import { readFileSync, readdirSync, existsSync, watch, type FSWatcher, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import type { Services } from '../services/index.js';

/** Shape of a message in a team inbox JSON file */
interface InboxMessage {
  from: string;
  text: string;
  summary?: string;
  timestamp: string;
  color?: string;
  read?: boolean;
}

/** Shape of a team config.json */
interface TeamConfig {
  name: string;
  description?: string;
  createdAt?: number;
  leadAgentId?: string;
  members?: Array<{
    agentId: string;
    name: string;
    agentType?: string;
    model?: string;
    color?: string;
    cwd?: string;
  }>;
}

/** Cached team state */
interface TeamState {
  tenantId: string;
  channelId: string;
  config: TeamConfig;
}

/** How often to poll for new team directories (ms) */
const POLL_INTERVAL_MS = 5_000;

/**
 * TeamInboxWatcher — watches ~/.claude/teams/ for inbox file changes
 * and syncs messages into AgentChat channels in real-time.
 *
 * Architecture:
 * 1. Scans teamsDir for existing teams on start
 * 2. Watches for file changes using fs.watch (recursive on macOS/Windows)
 * 3. Polls for new/removed team directories every 5 seconds (Phase 23)
 * 4. Reads inbox JSON files, deduplicates, and posts to MessageService
 * 5. MessageService emits events → WebSocketHub broadcasts to UI
 */
export class TeamInboxWatcher {
  private teams = new Map<string, TeamState>();
  private seenMessages = new Set<string>();
  private teamDedupKeys = new Map<string, Set<string>>();
  private lastProcessedIndex = new Map<string, number>();
  private watchers: FSWatcher[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(
    private services: Services,
    private teamsDir: string,
  ) {}

  /**
   * Start watching for team inbox changes.
   * Scans existing teams, processes current inbox files, then watches for changes.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // Ensure teams directory exists
    if (!existsSync(this.teamsDir)) {
      try {
        mkdirSync(this.teamsDir, { recursive: true });
      } catch {
        // Directory may not be creatable — that's OK, we just won't watch
        console.log(JSON.stringify({ event: 'team_watcher_no_dir', teamsDir: this.teamsDir }));
        return;
      }
    }

    // Scan existing teams
    await this.scanTeams();

    // Watch for changes (recursive on macOS via FSEvents)
    try {
      const watcher = watch(this.teamsDir, { recursive: true }, (_eventType, filename) => {
        if (filename) {
          this.handleFileChange(filename);
        }
      });
      this.watchers.push(watcher);
    } catch (err) {
      console.error(JSON.stringify({ event: 'team_watcher_watch_error', error: String(err) }));
    }

    // Poll for new team directories periodically (Phase 23)
    // Catches teams that fs.watch might miss (race conditions, platform differences)
    this.pollTimer = setInterval(() => {
      void this.pollForNewTeams();
    }, POLL_INTERVAL_MS);
  }

  /**
   * Stop watching and clean up all resources.
   */
  stop(): void {
    this.started = false;

    // Clear poll timer
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Close all watchers
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        // Ignore close errors
      }
    }
    this.watchers = [];

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.teamDedupKeys.clear();
  }

  /**
   * Scan the teams directory for existing teams and process their inboxes.
   */
  private async scanTeams(): Promise<void> {
    let entries: string[];
    try {
      entries = readdirSync(this.teamsDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const teamPath = join(this.teamsDir, entry);
      await this.processTeam(entry, teamPath);
    }
  }

  /**
   * Poll for new or removed team directories.
   * Runs periodically to catch teams that fs.watch might miss.
   */
  private async pollForNewTeams(): Promise<void> {
    if (!this.started) return;

    let entries: string[];
    try {
      entries = readdirSync(this.teamsDir);
    } catch {
      return;
    }

    // Detect new teams
    for (const entry of entries) {
      if (!this.teams.has(entry)) {
        const teamPath = join(this.teamsDir, entry);
        const configPath = join(teamPath, 'config.json');
        if (existsSync(configPath)) {
          try {
            await this.processTeam(entry, teamPath);
            console.log(JSON.stringify({
              event: 'team_discovered_by_poll',
              teamName: entry,
            }));
          } catch (err) {
            console.error(JSON.stringify({
              event: 'team_poll_discovery_error',
              teamName: entry,
              error: String(err),
            }));
          }
        }
      }
    }

    // Detect removed teams
    const currentTeamNames = new Set(entries);
    for (const teamName of this.teams.keys()) {
      if (!currentTeamNames.has(teamName)) {
        await this.removeTeam(teamName);
      }
    }
  }

  /**
   * Set up a team: read config, create tenant+channel, process existing inbox messages.
   */
  private async processTeam(teamName: string, teamPath: string): Promise<void> {
    // Skip if already processed
    if (this.teams.has(teamName)) {
      // Already set up — just re-process inboxes
      await this.processTeamInboxes(teamName);
      return;
    }

    // Read team config
    const configPath = join(teamPath, 'config.json');
    let config: TeamConfig;
    try {
      const raw = readFileSync(configPath, 'utf-8');
      config = JSON.parse(raw) as TeamConfig;
    } catch {
      // No config.json or invalid JSON — skip this directory
      return;
    }

    // Extract actual codebase path from team members' cwd field
    // Falls back to team directory path for backward compatibility
    const codebasePath = config.members?.find(m => m.cwd)?.cwd ?? teamPath;
    const tenantName = basename(codebasePath);

    // Create/get tenant using actual codebase path (shared across teams in same codebase)
    const tenant = await this.services.tenants.upsertByCodebasePath(
      tenantName,
      codebasePath,
    );

    // Session identity: createdAt uniquely identifies each team session
    const sessionId = config.createdAt != null ? String(config.createdAt) : null;

    // Find existing channel by exact name (including archived channels for conversation continuity)
    let channel = this.services.channels.findByName(tenant.id, teamName);

    if (channel && sessionId && channel.sessionId === sessionId) {
      // Same session continuing — reuse the channel (Phase 17 behavior)
      if (channel.archivedAt) {
        await this.services.channels.restore(tenant.id, channel.id);
        channel = { ...channel, archivedAt: null, userArchived: false };
        console.log(JSON.stringify({
          event: 'auto_restore_channel',
          channelId: channel.id,
          tenantId: tenant.id,
          trigger: 'team_reappearance',
        }));
      }
    } else if (channel && (channel.sessionId !== sessionId)) {
      // Different session with same name (or legacy channel with null sessionId)
      // Create a disambiguated channel
      const oldChannelSessionId = channel.sessionId;

      // Find all channels with this base name to determine the next suffix
      const existing = this.services.channels.findByNamePrefix(tenant.id, teamName);
      let maxSuffix = 1;
      const escapedName = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const ch of existing) {
        if (ch.name === teamName) continue;
        const match = ch.name.match(new RegExp(`^${escapedName}-(\\d+)$`));
        if (match) {
          const num = parseInt(match[1]!, 10);
          if (num > maxSuffix) maxSuffix = num;
        }
      }
      const disambiguatedName = `${teamName}-${maxSuffix + 1}`;

      channel = await this.services.channels.create(tenant.id, {
        name: disambiguatedName,
        sessionId: sessionId ?? undefined,
        type: 'manual',
      });

      console.log(JSON.stringify({
        event: 'team_channel_disambiguated',
        teamName,
        channelName: disambiguatedName,
        channelId: channel.id,
        tenantId: tenant.id,
        oldSessionId: oldChannelSessionId,
        newSessionId: sessionId,
      }));
    } else {
      // No existing channel — create a new one with session tracking
      channel = await this.services.channels.create(tenant.id, {
        name: teamName,
        sessionId: sessionId ?? undefined,
        type: 'manual',
      });
    }

    // Cache team state
    this.teams.set(teamName, {
      tenantId: tenant.id,
      channelId: channel.id,
      config,
    });

    // Process existing inbox messages
    await this.processTeamInboxes(teamName);
  }

  /**
   * Process all inbox files for a team, extracting new messages.
   */
  private async processTeamInboxes(teamName: string): Promise<void> {
    const teamState = this.teams.get(teamName);
    if (!teamState) return;

    const inboxDir = join(this.teamsDir, teamName, 'inboxes');
    let inboxFiles: string[];
    try {
      inboxFiles = readdirSync(inboxDir).filter(f => f.endsWith('.json'));
    } catch {
      // No inboxes directory yet — team may be newly created
      return;
    }

    for (const file of inboxFiles) {
      const filePath = join(inboxDir, file);
      const recipientName = basename(file, '.json');
      await this.processInboxFile(teamName, filePath, recipientName);
    }
  }

  /**
   * Process a single inbox file, extracting and ingesting new messages.
   */
  private async processInboxFile(
    teamName: string,
    filePath: string,
    recipientName: string,
  ): Promise<void> {
    const teamState = this.teams.get(teamName);
    if (!teamState) return;

    // Read and parse inbox JSON
    let messages: InboxMessage[];
    try {
      const raw = readFileSync(filePath, 'utf-8');
      if (!raw.trim()) return; // Empty file
      messages = JSON.parse(raw) as InboxMessage[];
      if (!Array.isArray(messages)) return;
    } catch {
      // Invalid JSON — file may be mid-write, skip for now
      return;
    }

    // Get last processed index for this file
    const lastIndex = this.lastProcessedIndex.get(filePath) ?? 0;

    // Process only new messages (after last processed index)
    for (let i = lastIndex; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg || typeof msg !== 'object' || !msg.from || !msg.timestamp || msg.text == null) continue;

      // Dedup key: from|timestamp|hash(text)
      const textHash = createHash('sha256').update(msg.text).digest('hex').slice(0, 16);
      const dedupKey = `${msg.from}|${msg.timestamp}|${textHash}`;

      if (this.seenMessages.has(dedupKey)) {
        continue; // Already ingested (broadcast duplicate)
      }
      this.seenMessages.add(dedupKey);

      // Track dedup keys per team for cleanup on removeTeam
      if (!this.teamDedupKeys.has(teamName)) {
        this.teamDedupKeys.set(teamName, new Set());
      }
      this.teamDedupKeys.get(teamName)!.add(dedupKey);

      // Detect structured message types (JSON in text field)
      let messageType: 'text' | 'event' = 'text';
      let originalType: string | undefined;
      try {
        const parsed = JSON.parse(msg.text) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object' && 'type' in parsed) {
          messageType = 'event';
          originalType = String(parsed['type']);
        }
      } catch {
        // Not JSON — regular text message
      }

      // Send to MessageService
      try {
        await this.services.messages.send(teamState.tenantId, {
          channelId: teamState.channelId,
          senderId: `${msg.from}@${teamName}`,
          senderName: msg.from,
          senderType: 'agent',
          content: msg.text,
          messageType,
          metadata: {
            recipient: recipientName,
            ...(msg.color != null ? { color: msg.color } : {}),
            ...(msg.summary != null ? { summary: msg.summary } : {}),
            ...(msg.read != null ? { read: msg.read } : {}),
            ...(originalType != null ? { original_type: originalType } : {}),
            source: 'team_inbox',
          },
        });
      } catch (err) {
        console.error(JSON.stringify({
          event: 'team_watcher_send_error',
          teamName,
          from: msg.from,
          error: String(err),
        }));
      }
    }

    // Update last processed index
    this.lastProcessedIndex.set(filePath, messages.length);
  }

  /**
   * Remove a team from internal tracking and archive its channel.
   * Called when a team directory disappears.
   * Archives the channel (system-initiated) so it can be auto-restored if the team reappears.
   */
  private async removeTeam(teamName: string): Promise<void> {
    const teamState = this.teams.get(teamName);

    // Archive the channel if we have state for this team
    if (teamState) {
      try {
        await this.services.channels.archive(teamState.tenantId, teamState.channelId, false);
        console.log(JSON.stringify({
          event: 'team_channel_archived',
          teamName,
          channelId: teamState.channelId,
          tenantId: teamState.tenantId,
        }));
      } catch (err) {
        console.error(JSON.stringify({
          event: 'team_channel_archive_error',
          teamName,
          error: String(err),
        }));
      }
    }

    this.teams.delete(teamName);

    // Clear seenMessages dedup keys for this team
    const dedupKeys = this.teamDedupKeys.get(teamName);
    if (dedupKeys) {
      for (const key of dedupKeys) {
        this.seenMessages.delete(key);
      }
      this.teamDedupKeys.delete(teamName);
    }

    // Clear lastProcessedIndex entries for this team's files
    const prefix = join(this.teamsDir, teamName);
    for (const key of this.lastProcessedIndex.keys()) {
      if (key.startsWith(prefix)) {
        this.lastProcessedIndex.delete(key);
      }
    }

    // Clear debounce timers for this team
    for (const [key, timer] of this.debounceTimers.entries()) {
      if (key.startsWith(teamName + '/') || key.startsWith(teamName + '\\')) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }

    console.log(JSON.stringify({ event: 'team_removed', teamName }));
  }

  /**
   * Handle a file change event from fs.watch.
   * Debounces by file path (100ms) to handle rapid writes.
   */
  private handleFileChange(filename: string): void {
    if (!this.started) return;

    // Clear existing timer for this file
    const existing = this.debounceTimers.get(filename);
    if (existing) {
      clearTimeout(existing);
    }

    // Debounce: wait 100ms for writes to settle
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filename);
      void this.processFileChange(filename);
    }, 100);

    this.debounceTimers.set(filename, timer);
  }

  /**
   * Process a debounced file change.
   */
  private async processFileChange(filename: string): Promise<void> {
    if (!this.started) return;

    // Parse the relative path to determine what changed
    // Possible patterns:
    //   {team-name}/config.json
    //   {team-name}/inboxes/{agent-name}.json
    //   {team-name}  (new directory)
    const parts = filename.split(/[/\\]/);

    if (parts.length === 0) return;

    const teamName = parts[0]!;
    const teamPath = join(this.teamsDir, teamName);

    // Check if this is a new team or existing team
    if (!this.teams.has(teamName)) {
      // Possibly a new team — try to set it up
      if (existsSync(join(teamPath, 'config.json'))) {
        try {
          await this.processTeam(teamName, teamPath);
        } catch (err) {
          console.error(JSON.stringify({
            event: 'team_watcher_new_team_error',
            teamName,
            error: String(err),
          }));
        }
      }
      return;
    }

    // Existing team — check if directory still exists
    if (!existsSync(teamPath)) {
      await this.removeTeam(teamName);
      return;
    }

    // Existing team — check if inbox file changed
    if (parts.length >= 3 && parts[1] === 'inboxes' && parts[2]!.endsWith('.json')) {
      const recipientName = basename(parts[2]!, '.json');
      const filePath = join(this.teamsDir, teamName, 'inboxes', parts[2]!);
      try {
        await this.processInboxFile(teamName, filePath, recipientName);
      } catch (err) {
        console.error(JSON.stringify({
          event: 'team_watcher_inbox_error',
          teamName,
          file: parts[2],
          error: String(err),
        }));
      }
    } else if (parts.length === 2 && parts[1] === 'config.json') {
      // Team config updated — re-read config
      try {
        const raw = readFileSync(join(teamPath, 'config.json'), 'utf-8');
        const config = JSON.parse(raw) as TeamConfig;
        const state = this.teams.get(teamName);
        if (state) {
          state.config = config;
        }
      } catch {
        // Invalid config — ignore
      }
    }
  }
}
