import type { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import type { Message, Document } from '@agent-chat/shared';
import type { Services } from '../services/index.js';

// Wire protocol types — client → server
export interface WsSubscribeMessage {
  type: 'subscribe';
  channelId: string;
  lastSeenId?: string;
}

export interface WsUnsubscribeMessage {
  type: 'unsubscribe';
  channelId: string;
}

export interface WsPingMessage {
  type: 'ping';
}

export type WsClientMessage = WsSubscribeMessage | WsUnsubscribeMessage | WsPingMessage;

// Wire protocol types — server → client
export interface WsServerMessage {
  type: 'message' | 'catchup' | 'subscribed' | 'unsubscribed' | 'error' | 'pong' | 'document_created' | 'document_updated';
  [key: string]: unknown;
}

interface ClientState {
  tenantId: string;
  subscribedChannels: Set<string>;
}

/**
 * WebSocketHub manages WebSocket subscriptions and broadcasts messages
 * to connected clients. It listens for 'message:created' events on the
 * provided EventEmitter and delivers messages to all clients subscribed
 * to the relevant channel, with tenant isolation enforced at every level.
 */
export class WebSocketHub {
  // channelId → set of subscribed WebSocket clients
  private channels = new Map<string, Set<WebSocket>>();
  // WebSocket client → connection metadata
  private clients = new Map<WebSocket, ClientState>();

  constructor(
    private services: Services,
    emitter: EventEmitter,
  ) {
    emitter.on('message:created', (msg: Message) => {
      this.broadcastToChannel(msg);
    });

    emitter.on('document:created', (doc: Document) => {
      this.broadcastDocumentEvent('document_created', doc);
    });

    emitter.on('document:updated', (doc: Document) => {
      this.broadcastDocumentEvent('document_updated', doc);
    });
  }

  /**
   * Register a new WebSocket connection with its tenant context.
   */
  addClient(ws: WebSocket, tenantId: string): void {
    this.clients.set(ws, {
      tenantId,
      subscribedChannels: new Set(),
    });
  }

  /**
   * Handle an incoming text message from a client.
   */
  handleMessage(ws: WebSocket, data: string): void {
    let parsed: WsClientMessage;
    try {
      parsed = JSON.parse(data) as WsClientMessage;
    } catch {
      this.sendJson(ws, { type: 'error', error: 'Invalid JSON', code: 'PARSE_ERROR' });
      return;
    }

    switch (parsed.type) {
      case 'subscribe':
        this.handleSubscribe(ws, parsed);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(ws, parsed);
        break;
      case 'ping':
        this.sendJson(ws, { type: 'pong' });
        break;
      default:
        this.sendJson(ws, {
          type: 'error',
          error: `Unknown message type: ${(parsed as { type: string }).type}`,
          code: 'UNKNOWN_TYPE',
        });
    }
  }

  /**
   * Clean up when a client disconnects.
   */
  handleDisconnect(ws: WebSocket): void {
    const state = this.clients.get(ws);
    if (!state) return;

    // Remove from all channel subscription sets
    for (const channelId of state.subscribedChannels) {
      const subs = this.channels.get(channelId);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) {
          this.channels.delete(channelId);
        }
      }
    }

    this.clients.delete(ws);
  }

  /**
   * Close all connections (for graceful shutdown).
   */
  closeAll(): void {
    for (const [ws] of this.clients) {
      try {
        ws.close(1001, 'Server shutting down');
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.channels.clear();
    this.clients.clear();
  }

  get clientCount(): number {
    return this.clients.size;
  }

  private handleSubscribe(ws: WebSocket, msg: WsSubscribeMessage): void {
    const state = this.clients.get(ws);
    if (!state) {
      this.sendJson(ws, { type: 'error', error: 'Connection not registered', code: 'NOT_REGISTERED' });
      return;
    }

    // Tenant isolation: verify channel belongs to this tenant
    const channel = this.services.channels.getById(state.tenantId, msg.channelId);
    if (!channel) {
      this.sendJson(ws, {
        type: 'error',
        error: 'Channel not found or not in your tenant',
        code: 'CHANNEL_NOT_FOUND',
      });
      return;
    }

    // Add to subscription set
    state.subscribedChannels.add(msg.channelId);
    if (!this.channels.has(msg.channelId)) {
      this.channels.set(msg.channelId, new Set());
    }
    this.channels.get(msg.channelId)!.add(ws);

    // Handle reconnect catch-up if lastSeenId provided
    if (msg.lastSeenId) {
      const result = this.services.messages.list(state.tenantId, msg.channelId, {
        after: msg.lastSeenId,
      });
      this.sendJson(ws, {
        type: 'catchup',
        messages: result.messages,
        hasMore: result.pagination.hasMore,
      });
    }

    this.sendJson(ws, { type: 'subscribed', channelId: msg.channelId });
  }

  private handleUnsubscribe(ws: WebSocket, msg: WsUnsubscribeMessage): void {
    const state = this.clients.get(ws);
    if (!state) return;

    state.subscribedChannels.delete(msg.channelId);
    const subs = this.channels.get(msg.channelId);
    if (subs) {
      subs.delete(ws);
      if (subs.size === 0) {
        this.channels.delete(msg.channelId);
      }
    }

    this.sendJson(ws, { type: 'unsubscribed', channelId: msg.channelId });
  }

  private broadcastToChannel(message: Message): void {
    const subs = this.channels.get(message.channelId);
    if (!subs || subs.size === 0) return;

    const frame = JSON.stringify({ type: 'message', message });

    for (const ws of subs) {
      const state = this.clients.get(ws);
      // Double-check tenant isolation on broadcast
      if (state && state.tenantId === message.tenantId) {
        try {
          ws.send(frame);
        } catch {
          // Client may have disconnected — cleanup happens in handleDisconnect
        }
      }
    }
  }

  private broadcastDocumentEvent(type: 'document_created' | 'document_updated', document: Document): void {
    const subs = this.channels.get(document.channelId);
    if (!subs || subs.size === 0) return;

    const frame = JSON.stringify({ type, document });

    for (const ws of subs) {
      const state = this.clients.get(ws);
      if (state && state.tenantId === document.tenantId) {
        try {
          ws.send(frame);
        } catch {
          // Client may have disconnected
        }
      }
    }
  }

  private sendJson(ws: WebSocket, data: WsServerMessage): void {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // Client may have disconnected
    }
  }
}
