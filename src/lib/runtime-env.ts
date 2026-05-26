type RuntimeEnv = Record<string, unknown>;

let runtimeEnv: RuntimeEnv | null = null;

export function setRuntimeEnv(env: unknown): void {
  if (env && typeof env === 'object') {
    runtimeEnv = env as RuntimeEnv;
  }
}

export function getEnvValue(name: string): unknown {
  if (runtimeEnv && name in runtimeEnv) {
    return runtimeEnv[name];
  }

  const viteEnv = (import.meta as ImportMeta).env as Record<string, unknown> | undefined;
  if (viteEnv && name in viteEnv) {
    return viteEnv[name];
  }

  if (typeof process !== 'undefined' && process.env && name in process.env) {
    return process.env[name];
  }

  return undefined;
}

export function getEnvVar(name: string): string | undefined {
  const value = getEnvValue(name);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
