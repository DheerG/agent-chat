import type { Conversation, ConversationListItem, ConversationSummary, ConversationSummaryRow } from '@agent-chat/shared';

type ConversationQueries = ReturnType<typeof import('../db/queries/conversations.js').createConversationQueries>;

function summaryRowToSummary(row: ConversationSummaryRow): ConversationSummary {
  return {
    conversationId: row.conversationId,
    totalMessages: row.totalMessages,
    lastMessageAt: row.lastMessageAt,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageSender: row.lastMessageSender,
    activeSessionCount: row.activeSessionCount,
    totalSessionCount: row.totalSessionCount,
    startedAt: row.startedAt,
    status: row.status,
  };
}

const DEFAULT_SUMMARY: ConversationSummary = {
  conversationId: '',
  totalMessages: 0,
  lastMessageAt: null,
  lastMessagePreview: null,
  lastMessageSender: null,
  activeSessionCount: 0,
  totalSessionCount: 0,
  startedAt: null,
  status: 'active',
};

export class ConversationService {
  constructor(private queries: ConversationQueries) {}

  async create(data: {
    name: string;
    workspacePath?: string;
    workspaceName?: string;
    type?: 'team';
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

    const items = convos.map(c => ({
      ...c,
      summary: summaryMap.get(c.id) ?? { ...DEFAULT_SUMMARY, conversationId: c.id },
    }));

    // Sort by most recent message, falling back to conversation updatedAt
    items.sort((a, b) => {
      const ta = a.summary.lastMessageAt ?? a.updatedAt;
      const tb = b.summary.lastMessageAt ?? b.updatedAt;
      return tb.localeCompare(ta);
    });

    return items;
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

  async incrementMessages(conversationId: string, preview: string, sender: string, timestamp?: string): Promise<void> {
    await this.queries.incrementSummaryMessages(conversationId, preview, sender, timestamp);
  }

  async incrementSessionCount(conversationId: string): Promise<void> {
    await this.queries.incrementSessionCount(conversationId);
  }
}
