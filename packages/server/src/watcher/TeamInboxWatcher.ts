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

/**
 * TeamInboxWatcher — watches ~/.claude/teams/ for inbox file changes
 * and syncs messages into AgentChat channels in real-time.
 *
 * Architecture:
 * 1. Scans teamsDir for existing teams on start
 * 2. Watches for file changes using fs.watch (recursive on macOS/Windows)
 * 3. Reads inbox JSON files, deduplicates, and posts to MessageService
 * 4. MessageService emits events → WebSocketHub broadcasts to UI
 */
export class TeamInboxWatcher {
  private teams = new Map<string, TeamState>();
  private seenMessages = new Set<string>();
  private lastProcessedIndex = new Map<string, number>();
  private watchers: FSWatcher[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
  }

  /**
   * Stop watching and clean up all resources.
   */
  stop(): void {
    this.started = false;

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

    // Create/get tenant using team directory as codebasePath (unique per team)
    const tenant = await this.services.tenants.upsertByCodebasePath(
      teamName,
      teamPath,
    );

    // Find or create channel for this team
    const existingChannels = this.services.channels.listByTenant(tenant.id);
    let channel = existingChannels.find(c => c.name === teamName);
    if (!channel) {
      channel = await this.services.channels.create(tenant.id, {
        name: teamName,
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
   * Remove a team from internal tracking.
   * Called when a team directory disappears.
   * Does NOT modify the database — the tenant and channel remain for historical access.
   */
  private removeTeam(teamName: string): void {
    this.teams.delete(teamName);

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
      this.removeTeam(teamName);
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
