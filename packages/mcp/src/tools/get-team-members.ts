import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Services } from '@agent-chat/server';
import type { McpConfig } from '../config.js';

interface TeamMember {
  name: string;
  agentId: string;
  agentType?: string;
  status?: string;
}

export interface GetTeamMembersResult {
  team_name: string;
  members: TeamMember[];
}

export function handleGetTeamMembers(
  services: Services,
  _config: McpConfig,
  tenantId: string,
): GetTeamMembersResult {
  // Determine teams directory
  const teamsDir = process.env['TEAMS_DIR'] ?? join(homedir(), '.claude', 'teams');

  // Get tenant to find team name
  const tenant = services.tenants.getById(tenantId);
  if (!tenant) {
    return { team_name: 'unknown', members: [] };
  }

  const teamName = tenant.name;

  // Try direct path first: teamsDir/{teamName}/config.json
  const teamConfigPath = join(teamsDir, teamName, 'config.json');

  if (existsSync(teamConfigPath)) {
    try {
      const raw = readFileSync(teamConfigPath, 'utf-8');
      const teamConfig = JSON.parse(raw) as Record<string, unknown>;
      return buildResult(teamConfig);
    } catch {
      // Fall through to scanning
    }
  }

  // Fall back to scanning teams directory for a match
  try {
    const teamDirs = readdirSync(teamsDir);
    for (const dir of teamDirs) {
      const configPath = join(teamsDir, dir, 'config.json');
      if (existsSync(configPath)) {
        try {
          const raw = readFileSync(configPath, 'utf-8');
          const cfg = JSON.parse(raw) as Record<string, unknown>;
          if (cfg['name'] === teamName) {
            return buildResult(cfg);
          }
        } catch {
          continue;
        }
      }
    }
  } catch {
    // Teams directory doesn't exist — fall through
  }

  // No team config found — return presence data instead
  return {
    team_name: teamName,
    members: getPresenceMembers(services, tenantId),
  };
}

function buildResult(teamConfig: Record<string, unknown>): GetTeamMembersResult {
  const members = (teamConfig['members'] as Array<Record<string, unknown>>) ?? [];
  return {
    team_name: String(teamConfig['name'] ?? 'unknown'),
    members: members.map(m => ({
      name: String(m['name'] ?? 'unknown'),
      agentId: String(m['agentId'] ?? ''),
      agentType: m['agentType'] ? String(m['agentType']) : undefined,
    })),
  };
}

function getPresenceMembers(services: Services, tenantId: string): TeamMember[] {
  const channels = services.channels.listByTenant(tenantId);
  const members = new Map<string, TeamMember>();

  for (const ch of channels) {
    const presenceList = services.presence.getByChannel(tenantId, ch.id);
    for (const p of presenceList) {
      if (!members.has(p.agentId)) {
        members.set(p.agentId, {
          name: p.agentId,
          agentId: p.agentId,
          status: p.status,
        });
      }
    }
  }

  return [...members.values()];
}
