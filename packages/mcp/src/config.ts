export interface McpConfig {
  dbPath: string;
  tenantId: string;       // 'auto' or a specific tenant ULID
  agentId: string;        // Agent identifier (session ID)
  agentName: string;      // Human-readable agent name
}

export function loadConfig(): McpConfig {
  const dbPath = process.env['AGENT_CHAT_DB_PATH'] ?? './data/agent-chat.db';
  const tenantId = process.env['AGENT_CHAT_TENANT_ID'] ?? 'auto';
  const agentId = process.env['AGENT_CHAT_AGENT_ID'] ?? `agent-${process.pid}`;
  const agentName = process.env['AGENT_CHAT_AGENT_NAME'] ?? 'claude-agent';

  return { dbPath, tenantId, agentId, agentName };
}
