import type { Conversation, ConversationListItem, ConversationSummary, ConversationSummaryRow } from '@agent-chat/shared';

type ConversationQueries = ReturnType<typeof import('../db/queries/conversations.js').createConversationQueries>;

function summaryRowToSummary(row: ConversationSummaryRow): ConversationSummary {
  return {
    conversationId: row.conversationId,
    totalEvents: row.totalEvents,
    totalErrors: row.totalErrors,
    filesTouchedCount: row.filesTouchedCount,
    lastEventAt: row.lastEventAt,
    totalMessages: row.totalMessages,
    lastMessageAt: row.lastMessageAt,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageSender: row.lastMessageSender,
    activeSessionCount: row.activeSessionCount,
    totalSessionCount: row.totalSessionCount,
    hasStopEvent: row.hasStopEvent === 1,
    hasError: row.hasError === 1,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    status: row.status,
  };
}

const DEFAULT_SUMMARY: ConversationSummary = {
  conversationId: '',
  totalEvents: 0,
  totalErrors: 0,
  filesTouchedCount: 0,
  lastEventAt: null,
  totalMessages: 0,
  lastMessageAt: null,
  lastMessagePreview: null,
  lastMessageSender: null,
  activeSessionCount: 0,
  totalSessionCount: 0,
  hasStopEvent: false,
  hasError: false,
  startedAt: null,
  endedAt: null,
  status: 'active',
};

export class ConversationService {
  constructor(private queries: ConversationQueries) {}

  async create(data: {
    name: string;
    workspacePath?: string;
    workspaceName?: string;
    type?: 'team' | 'solo';
  }): Promise<Conversation> {
    return this.queries.create(data);
  }

  getById(id: string): Conversation | null {
    return this.queries.getById(id);
  }

  findByName(name: string): Conversation | null {
    return this.queries.findByName(name);
  }

  findByNamePrefix(prefix: string): Conversation[] {
    return this.queries.findByNamePrefix(prefix);
  }

  listWithSummaries(tab: 'active' | 'recent' | 'all' = 'active', limit = 50): ConversationListItem[] {
    let convos: Conversation[];
    switch (tab) {
      case 'active':
        convos = this.queries.listActive();
        break;
      case 'recent':
        convos = this.queries.listRecent(limit);
        break;
      case 'all':
        convos = this.queries.listAll(limit);
        break;
    }

    const ids = convos.map(c => c.id);
    const summaryRows = this.queries.getAllSummaries(ids);
    const summaryMap = new Map(summaryRows.map(s => [s.conversationId, summaryRowToSummary(s)]));

    return convos.map(c => ({
      ...c,
      summary: summaryMap.get(c.id) ?? { ...DEFAULT_SUMMARY, conversationId: c.id },
    }));
  }

  async updateStatus(id: string, status: Conversation['status']): Promise<void> {
    await this.queries.updateStatus(id, status);
  }

  async setAttentionNeeded(id: string, needed: boolean): Promise<void> {
    await this.queries.setAttentionNeeded(id, needed);
  }

  async archive(id: string): Promise<void> {
    await this.queries.archive(id);
  }

  async restore(id: string): Promise<void> {
    await this.queries.restore(id);
  }

  getSummary(conversationId: string): ConversationSummary {
    const row = this.queries.getSummary(conversationId);
    return row ? summaryRowToSummary(row) : { ...DEFAULT_SUMMARY, conversationId };
  }

  async incrementEvents(conversationId: string, isError: boolean): Promise<void> {
    await this.queries.incrementSummaryEvents(conversationId, isError);
  }

  async incrementMessages(conversationId: string, preview: string, sender: string, timestamp?: string): Promise<void> {
    await this.queries.incrementSummaryMessages(conversationId, preview, sender, timestamp);
  }

  async incrementSessionCount(conversationId: string): Promise<void> {
    await this.queries.incrementSessionCount(conversationId);
  }

  async decrementActiveSessionCount(conversationId: string): Promise<void> {
    await this.queries.decrementActiveSessionCount(conversationId);
  }

  async setStopEvent(conversationId: string): Promise<void> {
    await this.queries.setStopEvent(conversationId);
  }

  computeStatus(summary: ConversationSummary): Conversation['status'] {
    if (summary.hasError) return 'error';
    if (summary.activeSessionCount > 0) {
      if (summary.lastEventAt) {
        const elapsed = Date.now() - new Date(summary.lastEventAt).getTime();
        return elapsed < 5 * 60 * 1000 ? 'active' : 'idle';
      }
      return 'active';
    }
    if (summary.hasStopEvent) return 'completed';
    return 'inactive';
  }
}
