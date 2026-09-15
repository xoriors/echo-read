import { execSync } from 'node:child_process';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * What build this is, stamped into the bundle so a deploy can be checked
 * against `main` by eye rather than by comparing asset hashes.
 *
 * The SHA comes from `GIT_SHA` when set — the Docker build has no `.git` to
 * ask, so `npm run deploy` passes it as a build arg — and from git otherwise.
 * A working tree with uncommitted changes gets `-dirty`, because a clean SHA
 * on a dirty build is exactly the lie this exists to prevent.
 */
function buildInfo(): { sha: string; builtAt: string } {
  const builtAt = new Date().toISOString();
  const fromEnv = process.env.GIT_SHA?.trim();
  if (fromEnv) return { sha: fromEnv, builtAt };

  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim().length > 0;
    return { sha: dirty ? `${sha}-dirty` : sha, builtAt };
  } catch {
    return { sha: 'dev', builtAt };
  }
}

const info = buildInfo();

/** Also written to `dist/version.json`, so `curl /version.json` answers the same question. */
function versionFile(): Plugin {
  return {
    name: 'echoread-version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(info) });
    },
  };
}

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react(), versionFile()],
  define: {
    __BUILD_INFO__: JSON.stringify(info),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
