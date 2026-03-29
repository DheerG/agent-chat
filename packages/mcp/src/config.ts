export interface McpConfig {
  dbPath: string;
  sessionId: string;
  agentName: string;
}

export function loadConfig(): McpConfig {
  const dbPath = process.env['AGENT_CHAT_DB_PATH'] ?? './data/agent-chat.db';
  const sessionId = process.env['AGENT_CHAT_SESSION_ID'] ?? `agent-${process.pid}`;
  const agentName = process.env['AGENT_CHAT_AGENT_NAME'] ?? 'claude-agent';

  return { dbPath, sessionId, agentName };
}
