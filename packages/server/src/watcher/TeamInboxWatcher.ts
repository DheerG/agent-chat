import { readFileSync, readdirSync, existsSync, watch, type FSWatcher, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import type { Services } from '../services/index.js';

interface InboxMessage {
  from: string;
  text: string;
  summary?: string;
  timestamp: string;
  color?: string;
  read?: boolean;
}

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

interface TeamState {
  conversationId: string;
  config: TeamConfig;
}

const POLL_INTERVAL_MS = 5_000;

function commonAncestor(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const parts = paths.map(p => p.split('/'));
  const common: string[] = [];
  for (let i = 0; i < parts[0]!.length; i++) {
    const segment = parts[0]![i];
    if (parts.every(p => p[i] === segment)) {
      common.push(segment!);
    } else break;
  }
  const result = common.join('/') || '/';
  // Sanity check: don't use home dir or root as workspace
  const home = process.env['HOME'] ?? '/Users';
  if (result === '/' || result === home || result.length <= home.length) return null;
  return result;
}

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

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    if (!existsSync(this.teamsDir)) {
      try { mkdirSync(this.teamsDir, { recursive: true }); } catch {
        console.log(JSON.stringify({ event: 'team_watcher_no_dir', teamsDir: this.teamsDir }));
        return;
      }
    }

    await this.scanTeams();

    try {
      const watcher = watch(this.teamsDir, { recursive: true }, (_eventType, filename) => {
        if (filename) this.handleFileChange(filename);
      });
      this.watchers.push(watcher);
    } catch (err) {
      console.error(JSON.stringify({ event: 'team_watcher_watch_error', error: String(err) }));
    }

    this.pollTimer = setInterval(() => { void this.pollForNewTeams(); }, POLL_INTERVAL_MS);
  }

  stop(): void {
    this.started = false;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    for (const w of this.watchers) { try { w.close(); } catch { /* */ } }
    this.watchers = [];
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.teamDedupKeys.clear();
  }

  private async scanTeams(): Promise<void> {
    let entries: string[];
    try { entries = readdirSync(this.teamsDir); } catch { return; }
    for (const entry of entries) {
      await this.processTeam(entry, join(this.teamsDir, entry));
    }
  }

  private async pollForNewTeams(): Promise<void> {
    if (!this.started) return;
    let entries: string[];
    try { entries = readdirSync(this.teamsDir); } catch { return; }

    for (const entry of entries) {
      if (!this.teams.has(entry)) {
        const teamPath = join(this.teamsDir, entry);
        if (existsSync(join(teamPath, 'config.json'))) {
          try {
            await this.processTeam(entry, teamPath);
            console.log(JSON.stringify({ event: 'team_discovered_by_poll', teamName: entry }));
          } catch (err) {
            console.error(JSON.stringify({ event: 'team_poll_error', teamName: entry, error: String(err) }));
          }
        }
      }
    }

    const currentTeamNames = new Set(entries);
    for (const teamName of this.teams.keys()) {
      if (!currentTeamNames.has(teamName)) await this.removeTeam(teamName);
    }
  }

  private async processTeam(teamName: string, teamPath: string): Promise<void> {
    if (this.teams.has(teamName)) {
      await this.processTeamInboxes(teamName);
      return;
    }

    const configPath = join(teamPath, 'config.json');
    let config: TeamConfig;
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8')) as TeamConfig;
    } catch { return; }

    // Compute workspace path from member cwds
    const cwds = (config.members ?? []).map(m => m.cwd).filter((c): c is string => !!c);
    const workspacePath = commonAncestor(cwds) ?? cwds[0] ?? teamPath;
    const workspaceName = basename(workspacePath);

    // Skip teams whose workspace no longer exists (deleted worktrees, removed codebases)
    if (workspacePath !== teamPath && !existsSync(workspacePath)) {
      console.log(JSON.stringify({ event: 'team_skipped_missing_workspace', teamName, workspacePath }));
      return;
    }

    // Find or create conversation
    let conversation = this.services.conversations.findByName(teamName);

    if (conversation && conversation.archivedAt) {
      await this.services.conversations.restore(conversation.id);
      console.log(JSON.stringify({ event: 'auto_restore_conversation', conversationId: conversation.id }));
    }

    if (!conversation) {
      // Check for name collision (different team runs with same name)
      const existing = this.services.conversations.findByNamePrefix(teamName);
      if (existing.length > 0) {
        // Disambiguate
        let maxSuffix = 1;
        const escaped = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        for (const c of existing) {
          if (c.name === teamName) continue;
          const match = c.name.match(new RegExp(`^${escaped}-(\\d+)$`));
          if (match) {
            const num = parseInt(match[1]!, 10);
            if (num > maxSuffix) maxSuffix = num;
          }
        }
        const disambiguatedName = `${teamName}-${maxSuffix + 1}`;
        conversation = await this.services.conversations.create({
          name: disambiguatedName, workspacePath, workspaceName, type: 'team',
        });
      } else {
        conversation = await this.services.conversations.create({
          name: teamName, workspacePath, workspaceName, type: 'team',
        });
      }
    }

    // Register team members as sessions for correlation
    for (const member of config.members ?? []) {
      await this.services.sessions.upsert({
        id: member.agentId,
        conversationId: conversation.id,
        agentName: member.name,
        agentType: (member.agentType as 'leader' | 'teammate' | 'sub-agent') ?? 'teammate',
        model: member.model,
        cwd: member.cwd,
      });
      await this.services.conversations.incrementSessionCount(conversation.id);
    }

    // Check for pending sessions that match team members
    const memberIds = (config.members ?? []).map(m => m.agentId);
    if (memberIds.length > 0) {
      const unlinked = this.services.sessions.findByIds(memberIds);
      const toLink = unlinked.filter(s => !s.conversationId).map(s => s.id);
      if (toLink.length > 0) {
        await this.services.sessions.linkToConversation(toLink, conversation.id);
        await this.services.activityEvents.backfillConversation(toLink, conversation.id);
      }
    }

    this.teams.set(teamName, { conversationId: conversation.id, config });
    await this.processTeamInboxes(teamName);
  }

  private async processTeamInboxes(teamName: string): Promise<void> {
    const teamState = this.teams.get(teamName);
    if (!teamState) return;

    const inboxDir = join(this.teamsDir, teamName, 'inboxes');
    let inboxFiles: string[];
    try { inboxFiles = readdirSync(inboxDir).filter(f => f.endsWith('.json')); } catch { return; }

    for (const file of inboxFiles) {
      await this.processInboxFile(teamName, join(inboxDir, file), basename(file, '.json'));
    }
  }

  private async processInboxFile(teamName: string, filePath: string, recipientName: string): Promise<void> {
    const teamState = this.teams.get(teamName);
    if (!teamState) return;

    let messages: InboxMessage[];
    try {
      const raw = readFileSync(filePath, 'utf-8');
      if (!raw.trim()) return;
      messages = JSON.parse(raw) as InboxMessage[];
      if (!Array.isArray(messages)) return;
    } catch { return; }

    const lastIndex = this.lastProcessedIndex.get(filePath) ?? 0;

    for (let i = lastIndex; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg || typeof msg !== 'object' || !msg.from || !msg.timestamp || msg.text == null) continue;

      const textHash = createHash('sha256').update(msg.text).digest('hex').slice(0, 16);
      const dedupKey = `${msg.from}|${msg.timestamp}|${textHash}`;

      if (this.seenMessages.has(dedupKey)) continue;
      this.seenMessages.add(dedupKey);

      if (!this.teamDedupKeys.has(teamName)) this.teamDedupKeys.set(teamName, new Set());
      this.teamDedupKeys.get(teamName)!.add(dedupKey);

      try {
        const sentMsg = await this.services.messages.send(teamState.conversationId, {
          senderId: `${msg.from}@${teamName}`,
          senderName: msg.from,
          senderType: 'agent',
          content: msg.text,
          messageType: 'text',
          metadata: {
            recipient: recipientName,
            ...(msg.color != null ? { color: msg.color } : {}),
            ...(msg.summary != null ? { summary: msg.summary } : {}),
            source: 'team_inbox',
          },
        });

        await this.services.conversations.incrementMessages(
          teamState.conversationId, msg.text, msg.from, msg.timestamp
        );
      } catch (err) {
        console.error(JSON.stringify({
          event: 'team_watcher_send_error', teamName, from: msg.from, error: String(err),
        }));
      }
    }

    this.lastProcessedIndex.set(filePath, messages.length);
  }

  private async removeTeam(teamName: string): Promise<void> {
    const teamState = this.teams.get(teamName);
    if (teamState) {
      try {
        await this.services.conversations.archive(teamState.conversationId);
        console.log(JSON.stringify({ event: 'team_conversation_archived', teamName, conversationId: teamState.conversationId }));
      } catch (err) {
        console.error(JSON.stringify({ event: 'team_archive_error', teamName, error: String(err) }));
      }
    }

    this.teams.delete(teamName);
    const dedupKeys = this.teamDedupKeys.get(teamName);
    if (dedupKeys) {
      for (const key of dedupKeys) this.seenMessages.delete(key);
      this.teamDedupKeys.delete(teamName);
    }

    const prefix = join(this.teamsDir, teamName);
    for (const key of this.lastProcessedIndex.keys()) {
      if (key.startsWith(prefix)) this.lastProcessedIndex.delete(key);
    }

    for (const [key, timer] of this.debounceTimers.entries()) {
      if (key.startsWith(teamName + '/') || key.startsWith(teamName + '\\')) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }

    console.log(JSON.stringify({ event: 'team_removed', teamName }));
  }

  private handleFileChange(filename: string): void {
    if (!this.started) return;
    const existing = this.debounceTimers.get(filename);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filename);
      void this.processFileChange(filename);
    }, 100);
    this.debounceTimers.set(filename, timer);
  }

  private async processFileChange(filename: string): Promise<void> {
    if (!this.started) return;
    const parts = filename.split(/[/\\]/);
    if (parts.length === 0) return;

    const teamName = parts[0]!;
    const teamPath = join(this.teamsDir, teamName);

    if (!this.teams.has(teamName)) {
      if (existsSync(join(teamPath, 'config.json'))) {
        try { await this.processTeam(teamName, teamPath); } catch (err) {
          console.error(JSON.stringify({ event: 'team_watcher_new_team_error', teamName, error: String(err) }));
        }
      }
      return;
    }

    if (!existsSync(teamPath)) {
      await this.removeTeam(teamName);
      return;
    }

    if (parts.length >= 3 && parts[1] === 'inboxes' && parts[2]!.endsWith('.json')) {
      const recipientName = basename(parts[2]!, '.json');
      const filePath = join(this.teamsDir, teamName, 'inboxes', parts[2]!);
      try { await this.processInboxFile(teamName, filePath, recipientName); } catch (err) {
        console.error(JSON.stringify({ event: 'team_watcher_inbox_error', teamName, file: parts[2], error: String(err) }));
      }
    } else if (parts.length === 2 && parts[1] === 'config.json') {
      try {
        const config = JSON.parse(readFileSync(join(teamPath, 'config.json'), 'utf-8')) as TeamConfig;
        const state = this.teams.get(teamName);
        if (state) state.config = config;
      } catch { /* invalid config */ }
    }
  }
}
