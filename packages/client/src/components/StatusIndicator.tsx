interface Props {
  status: string;
  size?: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  idle: '#eab308',
  pending: '#60a5fa',
  error: '#ef4444',
  stopped: '#9ca3af',
  completed: '#9ca3af',
  inactive: '#9ca3af',
};

export function StatusIndicator({ status, size = 10 }: Props) {
  const color = STATUS_COLORS[status] ?? '#9ca3af';
  const isActive = status === 'active';

  return (
    <span
      className="status-indicator"
      title={status}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        animation: isActive ? 'pulse 2s ease-in-out infinite' : undefined,
        flexShrink: 0,
      }}
    />
  );
}
