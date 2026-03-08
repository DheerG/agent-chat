import type { Services } from '@agent-chat/server';
import type { McpConfig } from '../config.js';

export interface CheckinResult {
  checked_in_at: string;
  previous_checkin: string | null;
}

export async function handleCheckin(
  services: Services,
  config: McpConfig,
  tenantId: string,
): Promise<CheckinResult> {
  const result = await services.checkins.checkin(config.agentId, tenantId);
  return {
    checked_in_at: result.checkedInAt,
    previous_checkin: result.previousCheckin,
  };
}
