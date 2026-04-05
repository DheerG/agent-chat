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

  getByConversation(conversationId: string): Session[] {
    return this.queries.getByConversation(conversationId);
  }
}
