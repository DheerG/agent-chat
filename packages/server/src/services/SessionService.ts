import type { Session } from '@agent-chat/shared';

type SessionQueries = ReturnType<typeof import('../db/queries/sessions.js').createSessionQueries>;

export class SessionService {
  constructor(private queries: SessionQueries) {}

  async upsert(data: {
    id: string;
    conversationId?: string;
    agentName?: string;
    agentType?: Session['agentType'];
    model?: string;
    cwd?: string;
    status?: Session['status'];
    parentSessionId?: string;
  }): Promise<Session> {
    return this.queries.upsert(data);
  }

  getById(id: string): Session | null {
    return this.queries.getById(id);
  }

  getByConversation(conversationId: string): Session[] {
    return this.queries.getByConversation(conversationId);
  }

  getActiveByConversation(conversationId: string): Session[] {
    return this.queries.getActiveByConversation(conversationId);
  }

  findByIds(ids: string[]): Session[] {
    return this.queries.findByIds(ids);
  }

  findUnlinked(): Session[] {
    return this.queries.findUnlinked();
  }

  async markStopped(id: string): Promise<void> {
    await this.queries.markStopped(id);
  }

  async markIdle(id: string): Promise<void> {
    await this.queries.markIdle(id);
  }

  async linkToConversation(sessionIds: string[], conversationId: string): Promise<void> {
    await this.queries.linkToConversation(sessionIds, conversationId);
  }
}
