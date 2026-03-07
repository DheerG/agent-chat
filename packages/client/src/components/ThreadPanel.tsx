import { useMemo, useCallback } from 'react';
import type { Message } from '@agent-chat/shared';
import { useMessages } from '../hooks/useMessages';
import { MessageItem } from './MessageItem';
import { ComposeInput } from './ComposeInput';
import './ThreadPanel.css';

interface ThreadPanelProps {
  tenantId: string;
  channelId: string;
  parentMessage: Message;
  allMessages: Message[];
  onClose: () => void;
  getPresenceStatus?: (agentId: string) => 'active' | 'idle' | null;
}

export function ThreadPanel({
  tenantId,
  channelId,
  parentMessage,
  allMessages,
  onClose,
  getPresenceStatus,
}: ThreadPanelProps) {
  const { sendMessage } = useMessages(tenantId, channelId);

  // Filter replies from the main message list
  const replies = useMemo(() => {
    return allMessages.filter((m) => m.parentMessageId === parentMessage.id);
  }, [allMessages, parentMessage.id]);

  const handleSend = useCallback((content: string) => {
    void sendMessage(content, parentMessage.id);
  }, [sendMessage, parentMessage.id]);

  return (
    <aside className="thread-panel" data-testid="thread-panel">
      <div className="thread-panel-header">
        <h2 className="thread-panel-title">Thread</h2>
        <button
          className="thread-panel-close"
          onClick={onClose}
          aria-label="Close thread"
        >
          &times;
        </button>
      </div>
      <div className="thread-panel-messages">
        <div className="thread-parent">
          <MessageItem
            message={parentMessage}
            presenceStatus={parentMessage.senderType === 'agent' ? getPresenceStatus?.(parentMessage.senderId) ?? null : null}
          />
        </div>
        <div className="thread-divider">
          <span className="thread-reply-count">
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </span>
        </div>
        <div className="thread-replies">
          {replies.map((reply) => (
            <MessageItem
              key={reply.id}
              message={reply}
              presenceStatus={reply.senderType === 'agent' ? getPresenceStatus?.(reply.senderId) ?? null : null}
            />
          ))}
          {replies.length === 0 && (
            <div className="thread-empty">No replies yet</div>
          )}
        </div>
      </div>
      <ComposeInput
        onSend={handleSend}
        placeholder="Reply in thread..."
      />
    </aside>
  );
}
