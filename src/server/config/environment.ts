import { randomUUID } from 'node:crypto';
import path from 'node:path';

export interface ServerConfig {
  port: number;
  isProduction: boolean;
  geminiApiKey?: string;
  browserlessApiKey?: string;
  /** Where SQLite lives. The fly volume is mounted here in production. */
  dataDir: string;
  /**
   * Signs the owner cookie. Generated when unset so local development works,
   * which also means restarting locally issues everyone a fresh identity.
   */
  sessionSecret: string;
  /** Preference order for text generation; empty means "use the built-in list". */
  geminiTextModels: string[];
  /** Preference order for speech; empty means "use the built-in list". */
  geminiTtsModels: string[];
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

/** Comma-separated overrides, e.g. `GEMINI_TEXT_MODELS=gemini-2.5-pro,gemini-2.5-flash`. */
function readModelList(env: NodeJS.ProcessEnv, name: string): string[] {
  return (env[name] ?? '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

/** The only place the server reads its environment. */
export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  if (env === process.env) loadDotEnvFile();

  return {
    port: Number.parseInt(env.PORT ?? '', 10) || DEFAULT_PORT,
    isProduction: env.NODE_ENV === 'production',
    geminiApiKey: readSecret(env, 'GEMINI_API_KEY'),
    browserlessApiKey: readSecret(env, 'BROWSERLESS_API_KEY'),
    dataDir: readSecret(env, 'DATA_DIR') ?? (env.NODE_ENV === 'production' ? '/data' : '.data'),
    sessionSecret: readSecret(env, 'SESSION_SECRET') ?? randomUUID(),
    geminiTextModels: readModelList(env, 'GEMINI_TEXT_MODELS'),
    geminiTtsModels: readModelList(env, 'GEMINI_TTS_MODELS'),
  };
}
