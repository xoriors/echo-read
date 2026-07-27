import path from 'node:path';

import express, { type Express } from 'express';

/**
 * Serves the browser hexagon.
 *
 * In development the Vite dev server is mounted as middleware so the SPA is
 * transformed on the fly; in production the pre-built bundle is served from
 * disk with an SPA fallback.
 */
export async function mountStaticSite(app: Express, { isProduction }: { isProduction: boolean }): Promise<void> {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
    return;
  }

  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*all', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}
