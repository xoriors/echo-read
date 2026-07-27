import path from 'node:path';

export interface ServerConfig {
  port: number;
  isProduction: boolean;
  geminiApiKey?: string;
  browserlessApiKey?: string;
}

const DEFAULT_PORT = 3000;

/**
 * Pulls a local, git-ignored `.env` into `process.env` if one exists.
 *
 * Real deployments (CI, hosting) inject the same variables directly, so a
 * missing file is not an error — anything already exported takes precedence.
 */
function loadDotEnvFile(): void {
  try {
    process.loadEnvFile(path.join(process.cwd(), '.env'));
  } catch {
    // No .env on disk: fall back to the ambient environment.
  }
}

/** Keys pasted into a secrets UI often arrive wrapped in quotes or padding. */
function readSecret(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const cleaned = env[name]?.trim().replace(/^['"]|['"]$/g, '');
  return cleaned || undefined;
}

/** The only place the server reads its environment. */
export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  if (env === process.env) loadDotEnvFile();

  return {
    port: Number.parseInt(env.PORT ?? '', 10) || DEFAULT_PORT,
    isProduction: env.NODE_ENV === 'production',
    geminiApiKey: readSecret(env, 'GEMINI_API_KEY'),
    browserlessApiKey: readSecret(env, 'BROWSERLESS_API_KEY'),
  };
}
