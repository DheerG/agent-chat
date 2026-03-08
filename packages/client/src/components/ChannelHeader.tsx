import './ChannelHeader.css';

interface ChannelHeaderProps {
  channelName: string;
  tenantName: string;
}

export function ChannelHeader({ channelName, tenantName }: ChannelHeaderProps) {
  return (
    <div className="channel-header" data-testid="channel-header">
      <div className="channel-header-info">
        <h2 className="channel-header-name"># {channelName}</h2>
        <span className="channel-header-tenant">{tenantName}</span>
      </div>
    </div>
  );
}
