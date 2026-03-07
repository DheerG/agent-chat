import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComposeInput } from '../components/ComposeInput';

describe('ComposeInput', () => {
  test('renders text input and send button', () => {
    render(<ComposeInput onSend={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: /message input/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  test('calls onSend with input text when Enter is pressed', () => {
    const onSend = vi.fn();
    render(<ComposeInput onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).toHaveBeenCalledWith('Hello world');
  });

  test('clears input after sending', () => {
    const onSend = vi.fn();
    render(<ComposeInput onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(textarea.value).toBe('');
  });

  test('does not send empty messages', () => {
    const onSend = vi.fn();
    render(<ComposeInput onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  test('Shift+Enter does not send', () => {
    const onSend = vi.fn();
    render(<ComposeInput onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  test('send button click sends message', () => {
    const onSend = vi.fn();
    render(<ComposeInput onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(textarea, { target: { value: 'Click send' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSend).toHaveBeenCalledWith('Click send');
  });

  test('send button is disabled when input is empty', () => {
    render(<ComposeInput onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });
});
