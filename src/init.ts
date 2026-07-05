import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_KEY_ENV, MCP_URL } from './constants.js';
import type { CommandContext } from './io.js';
import { writeLine } from './io.js';

const execFileAsync = promisify(execFile);

export type AgentId = 'claude' | 'cursor' | 'codex' | 'windsurf';

export interface AgentDefinition {
  id: AgentId;
  label: string;
  homeName: string;
  skillsDirName: string;
  command?: string;
}

export interface AgentDetection extends AgentDefinition {
  detected: boolean;
  homePath: string;
  commandFound: boolean;
}

export const AGENTS: AgentDefinition[] = [
  { id: 'claude', label: 'Claude Code', homeName: '.claude', skillsDirName: 'skills', command: 'claude' },
  { id: 'cursor', label: 'Cursor', homeName: '.cursor', skillsDirName: 'skills' },
  { id: 'codex', label: 'Codex', homeName: '.codex', skillsDirName: 'skills' },
  { id: 'windsurf', label: 'Windsurf', homeName: '.windsurf', skillsDirName: 'skills' },
];

export async function detectAgents(ctx: CommandContext): Promise<AgentDetection[]> {
  return Promise.all(
    AGENTS.map(async (agent) => {
      const homePath = join(ctx.homeDir, agent.homeName);
      const homeExists = await pathExists(homePath);
      const commandFound = agent.command ? await hasCommand(agent.command) : true;
      const detected = agent.id === 'claude' ? homeExists && commandFound : homeExists;
      return { ...agent, detected, homePath, commandFound };
    }),
  );
}

export async function installSkillsForAgents(
  agents: AgentDetection[],
  options: { all?: boolean } = {},
): Promise<string[]> {
  const source = skillsSourceDir();
  const targets = options.all ? agents : agents.filter((agent) => agent.detected);
  const installed: string[] = [];
  for (const agent of targets) {
    const skillsRoot = join(agent.homePath, agent.skillsDirName);
    await mkdir(skillsRoot, { recursive: true });
    for (const skillName of ['anyapi-onboarding', 'anyapi-discover', 'anyapi-run']) {
      await cp(join(source, skillName), join(skillsRoot, skillName), { recursive: true, force: true });
    }
    installed.push(`${agent.label}: ${skillsRoot}`);
  }
  return installed;
}

export async function configureMcp(agents: AgentDetection[], options: { all?: boolean; yes?: boolean }): Promise<string[]> {
  const targets = options.all ? agents : agents.filter((agent) => agent.detected);
  const results: string[] = [];
  for (const agent of targets) {
    if (!options.yes) {
      results.push(`${agent.label}\n${mcpSnippet(agent.id)}`);
      continue;
    }
    if (agent.id === 'claude' && agent.commandFound) {
      await execFileAsync('claude', [
        'mcp',
        'add',
        'anyapi',
        '--transport',
        'http',
        MCP_URL,
        '--header',
        `Authorization: Bearer $${API_KEY_ENV}`,
      ]);
      results.push(`${agent.label}: registered MCP server with claude mcp add`);
      continue;
    }
    if (agent.id === 'codex') {
      const target = join(agent.homePath, 'config.toml');
      await patchTomlMcp(target);
      results.push(`${agent.label}: patched ${target}`);
      continue;
    }
    if (agent.id === 'cursor') {
      const target = join(agent.homePath, 'mcp.json');
      await patchJsonMcp(target, `Bearer \${env:${API_KEY_ENV}}`);
      results.push(`${agent.label}: patched ${target}`);
      continue;
    }
    if (agent.id === 'windsurf') {
      const target = join(agent.homePath, 'mcp.json');
      await patchJsonMcp(target, `Bearer $${API_KEY_ENV}`);
      results.push(`${agent.label}: patched ${target}`);
    }
  }
  return results;
}

export function printAgentDetection(ctx: CommandContext, detections: AgentDetection[]): void {
  for (const agent of detections) {
    const status = agent.detected ? 'detected' : 'not detected';
    writeLine(ctx.stdout, `${agent.label}: ${status}`);
  }
}

export function mcpSnippet(agent: AgentId): string {
  if (agent === 'claude') {
    return [
      'claude mcp add anyapi \\',
      '  --transport http \\',
      `  ${MCP_URL} \\`,
      `  --header "Authorization: Bearer $${API_KEY_ENV}"`,
    ].join('\n');
  }
  if (agent === 'codex') {
    return [`[mcp_servers.anyapi]`, `url = "${MCP_URL}"`, `bearer_token_env_var = "${API_KEY_ENV}"`].join('\n');
  }
  const auth = agent === 'cursor' ? `Bearer \${env:${API_KEY_ENV}}` : `Bearer $${API_KEY_ENV}`;
  return JSON.stringify(
    {
      mcpServers: {
        anyapi: {
          url: MCP_URL,
          headers: { Authorization: auth },
        },
      },
    },
    null,
    2,
  );
}

function skillsSourceDir(): string {
  return fileURLToPath(new URL('../skills', import.meta.url));
}

async function patchJsonMcp(target: string, authorization: string): Promise<void> {
  const current = await readJsonFile(target);
  const root = isRecord(current) ? current : {};
  const mcpServers = isRecord(root.mcpServers) ? root.mcpServers : {};
  root.mcpServers = {
    ...mcpServers,
    anyapi: {
      url: MCP_URL,
      headers: { Authorization: authorization },
    },
  };
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(root, null, 2)}\n`, 'utf8');
}

async function patchTomlMcp(target: string): Promise<void> {
  const block = [`[mcp_servers.anyapi]`, `url = "${MCP_URL}"`, `bearer_token_env_var = "${API_KEY_ENV}"`].join('\n');
  const current = await readTextFile(target);
  const pattern = /\[mcp_servers\.anyapi\][\s\S]*?(?=\n\[|$)/;
  const next = pattern.test(current) ? current.replace(pattern, block) : `${current.trimEnd()}\n\n${block}\n`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, next.startsWith('\n') ? next.slice(1) : next, 'utf8');
}

async function readJsonFile(target: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(target, 'utf8'));
  } catch {
    return {};
  }
}

async function readTextFile(target: string): Promise<string> {
  try {
    return await readFile(target, 'utf8');
  } catch {
    return '';
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function hasCommand(command: string): Promise<boolean> {
  try {
    await execFileAsync('sh', ['-lc', `command -v ${command}`]);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
