import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageContent } from '../components/MessageContent';

describe('MessageContent', () => {
  test('plain text renders without markdown', () => {
    render(<MessageContent content="Hello, world!" />);
    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
  });

  test('bold text renders as <strong>', () => {
    const { container } = render(<MessageContent content="This is **bold** text" />);
    const strong = container.querySelector('strong');
    expect(strong).toBeInTheDocument();
    expect(strong!.textContent).toBe('bold');
  });

  test('inline code renders as <code>', () => {
    const { container } = render(<MessageContent content="Use `console.log()` for debugging" />);
    const code = container.querySelector('code');
    expect(code).toBeInTheDocument();
    expect(code!.textContent).toBe('console.log()');
  });

  test('code block renders as <pre><code>', () => {
    const content = '```\nconst x = 1;\nconsole.log(x);\n```';
    const { container } = render(<MessageContent content={content} />);
    const pre = container.querySelector('pre');
    const code = pre?.querySelector('code');
    expect(pre).toBeInTheDocument();
    expect(code).toBeInTheDocument();
    expect(code!.textContent).toContain('const x = 1;');
  });

  test('links render with href and target="_blank"', () => {
    const { container } = render(<MessageContent content="Visit [Example](https://example.com)" />);
    const link = container.querySelector('a');
    expect(link).toBeInTheDocument();
    expect(link!.getAttribute('href')).toBe('https://example.com');
    expect(link!.getAttribute('target')).toBe('_blank');
    expect(link!.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link!.textContent).toBe('Example');
  });

  test('list renders as <ul><li>', () => {
    const content = '- Item one\n- Item two\n- Item three';
    const { container } = render(<MessageContent content={content} />);
    const ul = container.querySelector('ul');
    expect(ul).toBeInTheDocument();
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(3);
    expect(items[0]!.textContent).toBe('Item one');
  });

  test('XSS script tags are sanitized', () => {
    const { container } = render(
      <MessageContent content="<script>alert('xss')</script>" />
    );
    const script = container.querySelector('script');
    expect(script).toBeNull();
    // The script text should not appear rendered
    expect(container.textContent).not.toContain("alert('xss')");
  });

  test('empty content renders empty div without errors', () => {
    const { container } = render(<MessageContent content="" />);
    const rendered = container.querySelector('.message-content-rendered');
    expect(rendered).toBeInTheDocument();
    expect(rendered!.innerHTML).toBe('');
  });
});
