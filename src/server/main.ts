import { createHttpServer } from './adapters/inbound/http/httpServer';
import { createServerContainer } from './config/container';
import { loadServerConfig } from './config/environment';

/** Process entry point: read the environment, wire the hexagon, listen. */
async function main(): Promise<void> {
  const config = loadServerConfig();
  const { logger, useCases } = createServerContainer(config);

  const app = await createHttpServer({
    useCases,
    logger,
    isProduction: config.isProduction,
    sessionSecret: config.sessionSecret,
  });

  app.listen(config.port, '0.0.0.0', () => {
    logger.info(`Server running on http://localhost:${config.port}`);
  });
}

main().catch((error) => {
  console.error('Failed to start server', error);
  process.exitCode = 1;
});
