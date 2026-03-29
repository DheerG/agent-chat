interface Props {
  status: string;
  size?: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  idle: '#eab308',
  error: '#ef4444',
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
