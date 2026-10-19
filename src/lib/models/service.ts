import fs from 'fs';
import path from 'path';
import { execFile, execSync } from 'child_process';
import { getActiveSessions, updateAgentSessionModel } from '@/lib/db/sessionQueries';
import { openCodeService } from '@/lib/opencode/client';

export interface AgentModelConfig {
  orchestrator: string;
  manager: string;
  planner: string;
  builder: string;
  tester: string;
  reviewer: string;
  [key: string]: string | undefined;
}

export const KNOWN_MODELS = [
  'opencode/nemotron-3.5-super-vl-free',
  'opencode/nemotron-3.5-lightning-free',
  'opencode/nemotron-3-ultra-free',
  'opencode/deepseek-v4.1-flash-free',
  'opencode/longcat-2.5-preview-free',
  'opencode/mimo-v2.6-flash-free',
  'opencode/space-bunny-free',
  'opencode/step-5-preview-free',
  'opencode/cat-jam-free',
  'opencode/muse-spark-1.3-contributor-free',
  'opencode/big-pickle',
  'omniroute/agnes-3.0-flash',
  'omniroute/deepseek-v4.1-flash',
  'omniroute/glm-5.3-flash',
  'omniroute/laguna-s-2.1',
  'omniroute/luna',
  'omniroute/nous-longcat',
  'omniroute/step 5',
];

const CONFIG_PATH = path.resolve(process.cwd(), 'opencode.json');
const AGENT_CONFIG_PATH = path.resolve(process.cwd(), 'agent-configs', 'opencode.json');

let cachedAvailableModels: string[] | null = null;
let cachedModelVariants: Record<string, string[]> | null = null;
let lastModelFetch = 0;

/**
 * Retrieves the list of available models and their reasoning variants directly from OpenCode.
 */
export async function getModelCatalogWithVariants(): Promise<{
  availableModels: string[];
  modelVariants: Record<string, string[]>;
}> {
  const now = Date.now();
  if (cachedAvailableModels && cachedModelVariants && now - lastModelFetch < 60000) {
    return {
      availableModels: cachedAvailableModels,
      modelVariants: cachedModelVariants,
    };
  }

  // 1. Try fetching rich metadata from OpenCode HTTP service
  const serviceConfig = openCodeService.getServiceConfig();
  if (serviceConfig) {
    try {
      const baseUrl = openCodeService.getBaseUrl(serviceConfig);
      const headers = openCodeService.getAuthHeaders(serviceConfig);
      const res = await fetch(`${baseUrl}/api/model`, { headers });
      if (res.ok) {
        const json = await res.json();
        const list = (json.data || json) as any[];
        if (Array.isArray(list) && list.length > 0) {
          const models: string[] = [];
          const variantsMap: Record<string, string[]> = {};

          for (const m of list) {
            const fullId = `${m.providerID}/${m.id}`;
            models.push(fullId);
            variantsMap[fullId] = Array.isArray(m.variants)
              ? m.variants.map((v: any) => v.id).filter(Boolean)
              : [];
          }

          cachedAvailableModels = models;
          cachedModelVariants = variantsMap;
          lastModelFetch = now;

          return { availableModels: models, modelVariants: variantsMap };
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 2. Fallback to CLI or KNOWN_MODELS
  const models = await new Promise<string[]>((resolve) => {
    execFile('opencode', ['models'], { encoding: 'utf-8', timeout: 8000, shell: process.platform === 'win32' }, (err, stdout) => {
      if (!err && stdout) {
        const lines = stdout
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && !l.startsWith('Error'));

        if (lines.length > 0) {
          resolve(lines);
          return;
        }
      }
      resolve(KNOWN_MODELS);
    });
  });

  const variantsMap: Record<string, string[]> = {};
  for (const m of models) {
    if (m.includes('muse-spark')) {
      variantsMap[m] = ['minimal', 'low', 'medium', 'high', 'xhigh'];
    } else if (m.includes('deepseek-v4.1-flash-free')) {
      variantsMap[m] = ['low', 'high', 'max'];
    } else if (m.includes('super-vl')) {
      variantsMap[m] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
    } else if (m.startsWith('omniroute/')) {
      variantsMap[m] = ['low', 'medium', 'high'];
    } else {
      variantsMap[m] = [];
    }
  }

  cachedAvailableModels = models;
  cachedModelVariants = variantsMap;
  lastModelFetch = now;

  return { availableModels: models, modelVariants: variantsMap };
}

/**
 * Retrieves the list of available models from the OpenCode CLI or cache.
 */
export async function getAvailableModels(): Promise<string[]> {
  const catalog = await getModelCatalogWithVariants();
  return catalog.availableModels;
}

/**
 * Reads agent model configurations and reasoning variants from opencode.json.
 */
export function getAgentModelsConfig(): {
  agentModels: AgentModelConfig;
  agentVariants: Record<string, string>;
} {
  const defaults: AgentModelConfig = {
    orchestrator: 'opencode/nemotron-3.5-lightning-free',
    manager: 'opencode/nemotron-3.5-lightning-free',
    planner: 'opencode/nemotron-3.5-lightning-free',
    builder: 'opencode/nemotron-3.5-lightning-free',
    tester: 'opencode/nemotron-3.5-lightning-free',
    reviewer: 'opencode/nemotron-3.5-lightning-free',
  };

  const variants: Record<string, string> = {
    orchestrator: '',
    manager: '',
    planner: '',
    builder: '',
    tester: '',
    reviewer: '',
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const data = JSON.parse(content);
      if (data.agent) {
        for (const [role, conf] of Object.entries<any>(data.agent)) {
          if (conf?.model) {
            const rawModel = String(conf.model);
            if (rawModel.includes('#')) {
              const [cleanM, varId] = rawModel.split('#');
              defaults[role] = cleanM;
              variants[role] = varId || '';
            } else {
              defaults[role] = rawModel;
              variants[role] = '';
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to read opencode.json config:', err);
  }

  return { agentModels: defaults, agentVariants: variants };
}

/**
 * Retrieves the model currently used by the active orchestrator session.
 */
export function getActiveOrchestratorModel(): {
  model: string;
  variant: string;
  fullModel: string;
} {
  try {
    const active = getActiveSessions().find((s) => s.role === 'orchestrator');
    if (active?.model) {
      const raw = active.model;
      if (raw.includes('#')) {
        const [cleanM, varId] = raw.split('#');
        return { model: cleanM, variant: varId || '', fullModel: raw };
      }
      return { model: raw, variant: '', fullModel: raw };
    }
  } catch {
    // fallback
  }

  const { agentModels, agentVariants } = getAgentModelsConfig();
  const m = agentModels.orchestrator || 'opencode/nemotron-3.5-lightning-free';
  const v = agentVariants.orchestrator || '';
  return {
    model: m,
    variant: v,
    fullModel: v ? `${m}#${v}` : m,
  };
}

/**
 * Updates agent models and variants in opencode.json and reloads configuration.
 */
export function updateAgentModels(
  models: Partial<AgentModelConfig>,
  variants?: Record<string, string>
): {
  agentModels: AgentModelConfig;
  agentVariants: Record<string, string>;
} {
  const current = getAgentModelsConfig();
  const updatedModels = { ...current.agentModels, ...models };
  const updatedVariants = { ...current.agentVariants, ...(variants || {}) };

  const updateFile = (filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        if (!data.agent) data.agent = {};

        for (const [role, modelName] of Object.entries(updatedModels)) {
          const varId = updatedVariants[role];
          const fullSpec = varId && varId !== 'default' ? `${modelName}#${varId}` : modelName;

          if (data.agent[role]) {
            data.agent[role].model = fullSpec;
          } else {
            data.agent[role] = { model: fullSpec };
          }
        }

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch (err) {
      console.warn(`Failed to update ${filePath}:`, err);
    }
  };

  updateFile(CONFIG_PATH);
  updateFile(AGENT_CONFIG_PATH);

  // Sync global OpenCode configuration so sessions created in external target folders find agents
  syncGlobalOpenCodeConfig();

  // Reload OpenCode service config so changes apply immediately
  try {
    execSync('opencode reload', { encoding: 'utf-8', timeout: 5000, stdio: 'ignore' });
  } catch {
    // ignore
  }

  return { agentModels: updatedModels, agentVariants: updatedVariants };
}

/**
 * Synchronizes software-factory's custom agent definitions and MCP server
 * into OpenCode's global configuration (~/.config/opencode/opencode.json)
 * using absolute paths. This allows OpenCode sessions running in any external
 * directory (e.g. D:\Projects\test or git worktrees) to find orchestrator,
 * manager, builder, tester, and factory tools without scoping leakage.
 */
export function syncGlobalOpenCodeConfig(): void {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const globalConfigPath = path.join(home, '.config', 'opencode', 'opencode.json');
    if (!fs.existsSync(globalConfigPath)) {
      return;
    }

    const localConfigPath = path.resolve(process.cwd(), 'opencode.json');
    if (!fs.existsSync(localConfigPath)) {
      return;
    }

    const globalCfg = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
    const localCfg = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));

    const agents: Record<string, unknown> = {};
    for (const [name, conf] of Object.entries<any>(localCfg.agent || {})) {
      const agentCopy = { ...conf };
      if (typeof agentCopy.prompt === 'string' && agentCopy.prompt.startsWith('{file:')) {
        const relFile = agentCopy.prompt.slice(6, -1);
        const absFile = path.resolve(process.cwd(), relFile).replace(/\\/g, '/');
        agentCopy.prompt = `{file:${absFile}}`;
      }
      agents[name] = agentCopy;
    }

    globalCfg.agent = { ...(globalCfg.agent || {}), ...agents };
    globalCfg.default_agent = localCfg.default_agent || globalCfg.default_agent;
    globalCfg.subagent_depth = localCfg.subagent_depth || globalCfg.subagent_depth;
    globalCfg.permission = localCfg.permission || { external_directory: 'deny' };

    const mcpServerScript = path.resolve(process.cwd(), 'src', 'mcp-server.mjs');
    if (!globalCfg.mcp) globalCfg.mcp = {};
    if (!globalCfg.mcp.servers) globalCfg.mcp.servers = {};
    globalCfg.mcp.servers.factory = {
      type: 'local',
      command: ['node', mcpServerScript],
    };

    fs.writeFileSync(globalConfigPath, JSON.stringify(globalCfg, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to sync global opencode config:', err);
  }
}

/**
 * Overrides the model for the active Orchestrator session in OpenCode runtime and database.
 */
export async function overrideSessionModel(
  modelString: string,
  variant?: string
): Promise<string> {
  const cleanModel = modelString.trim();
  if (!cleanModel) return '';

  let finalFullSpec = cleanModel;
  let cleanBase = cleanModel;
  let finalVariant = variant || '';

  if (cleanModel.includes('#')) {
    const parts = cleanModel.split('#');
    cleanBase = parts[0];
    finalVariant = finalVariant || parts[1] || '';
  }

  if (finalVariant && finalVariant !== 'default') {
    finalFullSpec = `${cleanBase}#${finalVariant}`;
  } else {
    finalFullSpec = cleanBase;
  }

  // 1. Update opencode.json orchestrator default
  updateAgentModels(
    { orchestrator: cleanBase },
    { orchestrator: finalVariant && finalVariant !== 'default' ? finalVariant : '' }
  );

  // 2. Reset active session so the next user prompt starts a clean session with the new model
  try {
    await openCodeService.resetSession();
    return '';
  } catch (err) {
    console.warn('Failed to reset session with new model:', err);
    return '';
  }
}

export interface ModelTestResult {
  success: boolean;
  model: string;
  reply?: string;
  latencyMs: number;
  error?: string;
}

/**
 * Tests connectivity and response from a given model.
 */
export async function testModelConnectivity(
  modelString: string,
  variantOverride?: string
): Promise<ModelTestResult> {
  const startTime = Date.now();
  const cleanModel = modelString.trim();

  let providerID = 'opencode';
  let modelId = cleanModel;
  let variant: string | undefined = variantOverride || undefined;

  if (cleanModel.includes('/')) {
    const parts = cleanModel.split('/');
    providerID = parts[0];
    modelId = parts.slice(1).join('/');
  }

  if (modelId.includes('#')) {
    const parts = modelId.split('#');
    modelId = parts[0];
    variant = variant || parts[1] || undefined;
  }

  const serviceConfig = openCodeService.getServiceConfig();
  if (!serviceConfig) {
    return {
      success: false,
      model: cleanModel,
      latencyMs: Date.now() - startTime,
      error: 'OpenCode background service is not running.',
    };
  }

  const baseUrl = openCodeService.getBaseUrl(serviceConfig);
  const headers = openCodeService.getAuthHeaders(serviceConfig);

  let tempSessionId: string | null = null;
  try {
    // 1. Create a lightweight temporary session with the specified model and variant
    const sessionRes = await fetch(`${baseUrl}/api/session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: `Model Test: ${cleanModel}${variant ? ` (${variant})` : ''}`,
        model: {
          providerID,
          id: modelId,
          ...(variant && variant !== 'default' ? { variant } : {}),
        },
      }),
    });

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      return {
        success: false,
        model: cleanModel,
        latencyMs: Date.now() - startTime,
        error: `Session init failed: ${errText.slice(0, 150)}`,
      };
    }

    const sessionData = await sessionRes.json();
    tempSessionId = sessionData.data?.id as string;

    // 2. Post test prompt
    const promptRes = await fetch(`${baseUrl}/api/session/${tempSessionId}/prompt`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: 'Reply with exact text: OK' }),
    });

    if (!promptRes.ok) {
      const errText = await promptRes.text();
      return {
        success: false,
        model: cleanModel,
        latencyMs: Date.now() - startTime,
        error: `Prompt failed: ${errText.slice(0, 150)}`,
      };
    }

    // 3. Poll for response (up to 12s)
    let reply = '';
    const pollDeadline = Date.now() + 12000;
    while (Date.now() < pollDeadline) {
      await new Promise((r) => setTimeout(r, 400));
      const msgRes = await fetch(`${baseUrl}/api/session/${tempSessionId}/message`, { headers });
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        const msgs = (msgData.data || []) as any[];
        const assistantMsg = msgs.slice().reverse().find((m) => m.type === 'assistant');
        if (assistantMsg && Array.isArray(assistantMsg.content)) {
          const textPart = assistantMsg.content.find((c: any) => c.type === 'text');
          if (textPart?.text) {
            reply = textPart.text.trim();
            break;
          }
        }
      }
    }

    const latencyMs = Date.now() - startTime;

    if (!reply) {
      return {
        success: false,
        model: cleanModel,
        latencyMs,
        error: 'Model response timed out after 12s.',
      };
    }

    return {
      success: true,
      model: cleanModel,
      reply: reply.slice(0, 120),
      latencyMs,
    };
  } catch (err: unknown) {
    return {
      success: false,
      model: cleanModel,
      latencyMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // 4. Always cleanup temporary test session
    if (tempSessionId) {
      try {
        await fetch(`${baseUrl}/api/session/${tempSessionId}`, {
          method: 'DELETE',
          headers,
        });
      } catch {
        // ignore cleanup error
      }
    }
  }
}
