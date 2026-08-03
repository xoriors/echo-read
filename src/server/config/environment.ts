import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { ConfigurationError } from '../../shared/domain/errors';

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
  /** VAPID private key (base64 PKCS8) for review reminders. Absent disables them. */
  vapidPrivateKey?: string;
  /** Contact address VAPID requires, so a push service can report abuse. */
  vapidSubject: string;
  /** Shared secret the reminder scheduler presents. Absent disables the route. */
  reminderSecret?: string;
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

/**
 * The key the owner cookie is signed with.
 *
 * Generating one when it is unset is fine locally and silently destroys data
 * in production: the cookie *is* the identity, so a new key means every
 * returning visitor fails signature verification, is issued a fresh owner id,
 * and finds their decks gone. The rows survive in the database, orphaned under
 * an owner nobody holds a cookie for — which looks exactly like data loss and
 * cannot be undone from the outside.
 *
 * That is not hypothetical: this app scales to zero, so the machine restarts
 * whenever it has been idle, and a generated key meant decks lasted until the
 * next quiet spell. Refusing to boot is the only safe answer — a warning in a
 * log nobody reads is how it went unnoticed in the first place.
 */
function sessionSecretFrom(env: NodeJS.ProcessEnv): string {
  const configured = readSecret(env, 'SESSION_SECRET');
  if (configured) return configured;

  if (env.NODE_ENV === 'production') {
    throw new ConfigurationError(
      'SESSION_SECRET must be set in production. Without it the owner cookie is ' +
        'signed with a key that changes on every restart, and every visitor ' +
        'silently loses the decks they have built. Generate one with ' +
        '`openssl rand -hex 32` and set it (e.g. `fly secrets set SESSION_SECRET=…`).',
    );
  }

  // Local development: a fresh identity each restart is a mild annoyance, not
  // data loss, and it keeps `npm run dev` working with no setup.
  return randomUUID();
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
    sessionSecret: sessionSecretFrom(env),
    vapidPrivateKey: readSecret(env, 'VAPID_PRIVATE_KEY'),
    vapidSubject: readSecret(env, 'VAPID_SUBJECT') ?? 'mailto:noreply@echo-read.fly.dev',
    reminderSecret: readSecret(env, 'REMINDER_SECRET'),
    geminiTextModels: readModelList(env, 'GEMINI_TEXT_MODELS'),
    geminiTtsModels: readModelList(env, 'GEMINI_TTS_MODELS'),
  };
}
