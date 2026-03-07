import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import './MessageContent.css';

interface MessageContentProps {
  content: string;
}

// Configure marked renderer to add target="_blank" to links
const renderer = new marked.Renderer();
renderer.link = function ({ href, text }) {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};

marked.setOptions({
  breaks: true,
  gfm: true,
  renderer,
});

export function MessageContent({ content }: MessageContentProps) {
  const sanitizedHtml = useMemo(() => {
    if (!content) return '';
    const rawHtml = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ['target'],
    });
  }, [content]);

  return (
    <div
      className="message-content-rendered"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
