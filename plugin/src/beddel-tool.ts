import { spawn } from 'node:child_process';
import path from 'node:path';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/core';

type BeddelResult =
  | { ok: true; action: string; output: unknown }
  | { ok: false; error: { code?: string; message: string } };

function resolveCwd(cwdRaw: unknown): string {
  if (typeof cwdRaw !== 'string' || cwdRaw.length === 0) return process.cwd();
  if (path.isAbsolute(cwdRaw)) throw new Error('cwd must be a relative path');
  const base = process.cwd();
  const resolved = path.resolve(base, cwdRaw);
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..')) throw new Error('cwd escapes the base directory');
  return resolved;
}

function runBeddel(params: {
  execPath: string; argv: string[]; cwd: string; timeoutMs: number; maxStdoutBytes: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, BEDDEL_MODE: 'tool' };
    if (env.NODE_OPTIONS?.includes('--inspect')) delete env.NODE_OPTIONS;

    const proc = spawn(params.execPath, params.argv, {
      cwd: params.cwd, stdio: ['ignore', 'pipe', 'pipe'], env,
    });

    let stdout = '', stderr = '', stdoutBytes = 0, killed = false;

    proc.stdout!.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > params.maxStdoutBytes) {
        killed = true;
        proc.kill('SIGKILL');
        return;
      }
      stdout += chunk.toString('utf8');
    });
    proc.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });

    const timer = setTimeout(() => { killed = true; proc.kill('SIGKILL'); }, params.timeoutMs);

    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (killed && stdoutBytes > params.maxStdoutBytes)
        return reject(new Error('stdout exceeded maxStdoutBytes'));
      if (killed) return reject(new Error('process timed out'));
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

function buildArgv(action: string, params: Record<string, unknown>): string[] {
  const argv: string[] = [];
  if (params.verbose) argv.push('-v');

  if (action === 'run') {
    if (!params.workflow) throw new Error('workflow is required for run action');
    argv.push('run', params.workflow as string);
    if (typeof params.inputs === 'string' && params.inputs.length > 0) {
      const kv = JSON.parse(params.inputs) as Record<string, string>;
      for (const [k, v] of Object.entries(kv)) argv.push('-i', `${k}=${v}`);
    }
    if (typeof params.tools === 'string' && params.tools.length > 0) {
      for (const t of params.tools.split(',')) argv.push('-t', t.trim());
    }
    argv.push('--json-output');
  } else if (action === 'validate') {
    if (!params.workflow) throw new Error('workflow is required for validate action');
    argv.push('validate', params.workflow as string);
  } else {
    argv.push('list-primitives');
  }
  return argv;
}

function parseJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  try { return JSON.parse(trimmed); } catch {}
  const m = trimmed.match(/[\[{][\s\S]*[\]}](?=[^}\]]*$)/);
  return m ? (() => { try { return JSON.parse(m[0]); } catch { return null; } })() : null;
}

export function createBeddelTool(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig ?? {}) as Record<string, unknown>;

  return {
    name: 'beddel',
    label: 'Beddel Workflow Runner',
    description:
      'Execute declarative YAML AI workflows via the Beddel Python SDK CLI. Actions: run (execute workflow), validate (check YAML), list-primitives (show available primitives).',
    parameters: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['run', 'validate', 'list-primitives'], description: 'Action to perform' },
        workflow: { type: 'string', description: 'Path to workflow YAML file (required for run and validate)' },
        inputs: { type: 'string', description: 'JSON string of key-value pairs for workflow inputs, e.g. {"topic":"AI"}' },
        tools: { type: 'string', description: 'Comma-separated tool registrations: name=module:func,name2=module:func2' },
        cwd: { type: 'string', description: 'Relative working directory (must stay within gateway working directory)' },
        timeoutMs: { type: 'number' },
        maxStdoutBytes: { type: 'number' },
        verbose: { type: 'boolean' },
      },
      required: ['action'],
    },
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const action = params.action as string;
      if (!['run', 'validate', 'list-primitives'].includes(action))
        throw new Error(`unknown action: ${action}`);

      const execPath = (cfg.beddelPath as string) || 'beddel';
      const cwd = resolveCwd(params.cwd);
      const timeoutMs = (params.timeoutMs ?? cfg.timeoutMs ?? 120_000) as number;
      const maxStdoutBytes = (params.maxStdoutBytes ?? cfg.maxStdoutBytes ?? 1_048_576) as number;
      const argv = buildArgv(action, params);

      let result: BeddelResult;
      try {
        const { stdout, stderr, exitCode } = await runBeddel({ execPath, argv, cwd, timeoutMs, maxStdoutBytes });

        if (exitCode !== 0) {
          result = { ok: false, error: { code: `EXIT_${exitCode}`, message: (stderr || stdout).trim() } };
        } else if (action === 'run') {
          result = { ok: true, action, output: parseJsonOutput(stdout) ?? stdout.trim() };
        } else {
          result = { ok: true, action, output: stdout.trim() };
        }
      } catch (err: any) {
        result = { ok: false, error: { code: 'SPAWN_ERROR', message: err.message } };
      }

      const text = JSON.stringify(result, null, 2);
      return { content: [{ type: 'text' as const, text }], details: result };
    },
  };
}
