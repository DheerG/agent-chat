import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { FeedMessage } from '@agent-chat/shared';

// Configure marked for safe inline rendering
marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(content: string): string {
  const raw = marked.parse(content, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}

interface Props {
  message: FeedMessage;
}

export function MessageItem({ message }: Props) {
  const isSystem = message.senderType === 'system';
  const isError = message.messageType === 'error';
  const isStatus = message.messageType === 'status';
  const isInputRequest = message.messageType === 'input_request';
  const isHuman = message.senderType === 'human';

  const html = useMemo(() => renderMarkdown(message.content), [message.content]);

  if (isSystem) {
    return (
      <div className="message-item message-item--system">
        <span className="message-item__system-text">{message.content}</span>
      </div>
    );
  }

  return (
    <div className={`message-item ${isHuman ? 'message-item--human' : ''} ${isError ? 'message-item--error' : ''} ${isInputRequest ? 'message-item--attention' : ''} ${isStatus ? 'message-item--status' : ''}`}>
      <div className="message-item__header">
        <span className={`message-item__avatar ${isHuman ? 'message-item__avatar--human' : ''}`}>
          {message.senderName.charAt(0).toUpperCase()}
        </span>
        <span className="message-item__sender">{message.senderName}</span>
        <span className="message-item__time">
          {new Date(message.createdAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="message-item__content">
        {isInputRequest && <span className="message-item__badge">Needs Input</span>}
        {isError && <span className="message-item__badge message-item__badge--error">Error</span>}
        {isStatus && <span className="message-item__badge message-item__badge--status">Status</span>}
        <div className="message-item__text" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
