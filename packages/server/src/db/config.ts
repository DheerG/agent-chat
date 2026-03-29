import { homedir } from 'os';
import { join } from 'path';

export function getDbPath(): string {
  return process.env['AGENT_CHAT_DB_PATH'] ?? join(homedir(), '.agent-chat', 'v2.db');
}
