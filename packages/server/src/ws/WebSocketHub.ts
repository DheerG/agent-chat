import type { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import type { Message, WsServerMessage } from '@agent-chat/shared';
import type { Services } from '../services/index.js';

interface ClientState {
  subscribedConversations: Set<string>;
  subscribedAll: boolean;
}

export class WebSocketHub {
  private conversations = new Map<string, Set<WebSocket>>();
  private clients = new Map<WebSocket, ClientState>();
  private allSubscribers = new Set<WebSocket>();

  constructor(
    private services: Services,
    emitter: EventEmitter,
  ) {
    emitter.on('message:created', (msg: Message) => {
      this.broadcastToConversation(msg.conversationId, {
        type: 'message',
        conversationId: msg.conversationId,
        message: msg,
      });

      // Also update summary for sidebar
      const summary = this.services.conversations.getSummary(msg.conversationId);
      this.broadcastToAll({
        type: 'summary_update',
        conversationId: msg.conversationId,
        summary,
      });
    });
  }

  addClient(ws: WebSocket): void {
    this.clients.set(ws, {
      subscribedConversations: new Set(),
      subscribedAll: false,
    });
  }

  handleMessage(ws: WebSocket, raw: string): void {
    const state = this.clients.get(ws);
    if (!state) return;

    let msg: { type: string; conversationIds?: string[]; lastSeenId?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      this.send(ws, { type: 'error', error: 'Invalid JSON' } as unknown as WsServerMessage);
      return;
    }

    switch (msg.type) {
      case 'subscribe': {
        const ids = msg.conversationIds ?? [];
        for (const id of ids) {
          state.subscribedConversations.add(id);
          if (!this.conversations.has(id)) this.conversations.set(id, new Set());
          this.conversations.get(id)!.add(ws);
        }
        this.send(ws, { type: 'subscribed', conversationIds: ids } as unknown as WsServerMessage);

        // Send catchup if lastSeenId provided
        if (msg.lastSeenId && ids.length === 1) {
          const conversationId = ids[0]!;
          const messages = this.services.messages.list(conversationId, { after: msg.lastSeenId, limit: 100 });
          for (const m of messages.messages) {
            this.send(ws, { type: 'message', conversationId, message: m });
          }
        }
        break;
      }

      case 'subscribe_all': {
        state.subscribedAll = true;
        this.allSubscribers.add(ws);
        this.send(ws, { type: 'subscribed_all' } as unknown as WsServerMessage);
        break;
      }

      case 'unsubscribe': {
        const ids = msg.conversationIds ?? [];
        for (const id of ids) {
          state.subscribedConversations.delete(id);
          this.conversations.get(id)?.delete(ws);
        }
        break;
      }

      case 'ping': {
        this.send(ws, { type: 'pong' } as unknown as WsServerMessage);
        break;
      }
    }
  }

  handleDisconnect(ws: WebSocket): void {
    const state = this.clients.get(ws);
    if (state) {
      for (const id of state.subscribedConversations) {
        this.conversations.get(id)?.delete(ws);
      }
    }
    this.allSubscribers.delete(ws);
    this.clients.delete(ws);
  }

  broadcastToConversation(conversationId: string, msg: WsServerMessage): void {
    const subscribers = this.conversations.get(conversationId);
    if (subscribers) {
      const payload = JSON.stringify(msg);
      for (const ws of subscribers) {
        this.sendRaw(ws, payload);
      }
    }

    // Also send to subscribe_all clients
    const payload = JSON.stringify(msg);
    for (const ws of this.allSubscribers) {
      // Don't double-send to clients that are also specifically subscribed
      if (!subscribers?.has(ws)) {
        this.sendRaw(ws, payload);
      }
    }
  }

  broadcastToAll(msg: WsServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const ws of this.clients.keys()) {
      this.sendRaw(ws, payload);
    }
  }

  closeAll(): void {
    for (const ws of this.clients.keys()) {
      try { ws.close(); } catch { /* ignore */ }
    }
    this.clients.clear();
    this.conversations.clear();
    this.allSubscribers.clear();
  }

  private send(ws: WebSocket, msg: WsServerMessage): void {
    this.sendRaw(ws, JSON.stringify(msg));
  }

  private sendRaw(ws: WebSocket, payload: string): void {
    try {
      if (ws.readyState === 1) ws.send(payload);
    } catch { /* client gone */ }
  }
}
