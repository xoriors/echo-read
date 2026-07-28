import { BrowserlessArticleFetcher } from '../adapters/outbound/article/browserlessArticleFetcher';
import { FallbackArticleFetcher } from '../adapters/outbound/article/fallbackArticleFetcher';
import { HttpArticleFetcher } from '../adapters/outbound/article/httpArticleFetcher';
import { JinaArticleFetcher } from '../adapters/outbound/article/jinaArticleFetcher';
import { GeminiClientProvider } from '../adapters/outbound/gemini/geminiClient';
import { DEFAULT_TEXT_MODELS, GeminiContentAnalyzer } from '../adapters/outbound/gemini/geminiContentAnalyzer';
import { DEFAULT_TTS_MODELS, GeminiSpeechSynthesizer } from '../adapters/outbound/gemini/geminiSpeechSynthesizer';
import { ConsoleLogger } from '../adapters/outbound/logging/consoleLogger';
import { migrate } from '../adapters/outbound/sqlite/migrations';
import { SqliteDatabaseProvider } from '../adapters/outbound/sqlite/sqliteDatabase';
import { SqliteStudyRepository } from '../adapters/outbound/sqlite/sqliteStudyRepository';
import type { Logger } from '../application/ports/logger';
import { AnalyzeVideoUseCase } from '../application/usecases/analyzeVideo';
import { ReadArticleUseCase } from '../application/usecases/readArticle';
import { ReadPdfUseCase } from '../application/usecases/readPdf';
import { SpeakTextUseCase } from '../application/usecases/speakText';
import { SummarizeTextUseCase } from '../application/usecases/summarizeText';
import { BuildStudyPackUseCase } from '../application/usecases/buildStudyPack';
import type { StudyRepository } from '../application/ports/studyRepository';
import type { ServerConfig } from './environment';

export interface ServerContainer {
  logger: Logger;
  /** Opened on first use; a broken data directory is not a boot failure. */
  database: SqliteDatabaseProvider;
  useCases: {
    readArticle: ReadArticleUseCase;
    analyzeVideo: AnalyzeVideoUseCase;
    summarizeText: SummarizeTextUseCase;
    readPdf: ReadPdfUseCase;
    speakText: SpeakTextUseCase;
    buildStudyPack: BuildStudyPackUseCase;
  };
  studyRepository: StudyRepository;
}

/**
 * Composition root for the server hexagon: the one module that knows both the
 * ports and the concrete adapters behind them. Swapping a provider is an edit
 * here and nowhere else.
 */
export function createServerContainer(config: ServerConfig): ServerContainer {
  const logger = new ConsoleLogger(config.isProduction ? 'info' : 'debug');

  const database = new SqliteDatabaseProvider(config.dataDir);

  // Migrating at boot is safe because a volume attaches to one machine, so
  // there is exactly one writer. Failing here must not take the server down:
  // narration does not need storage, and a reader should still be able to
  // listen to a document while study features are unavailable.
  try {
    const { applied, skipped } = migrate(database.get());
    logger.info('Storage ready', { file: database.file, applied, alreadyApplied: skipped.length });
  } catch (error) {
    logger.error('Storage unavailable; study features are disabled', {
      file: database.file,
      reason: (error as Error).message,
    });
  }

  const geminiClients = new GeminiClientProvider(config.geminiApiKey);

  // Each model list is tried in order, so an overloaded model is retried a few
  // times and then abandoned for the next one.
  const analyzer = new GeminiContentAnalyzer(
    geminiClients,
    logger,
    config.geminiTextModels.length > 0 ? config.geminiTextModels : DEFAULT_TEXT_MODELS,
  );
  const synthesizer = new GeminiSpeechSynthesizer(
    geminiClients,
    logger,
    config.geminiTtsModels.length > 0 ? config.geminiTtsModels : DEFAULT_TTS_MODELS,
  );

  // Cheapest first: reader proxy, then a plain GET, then a real browser.
  const articleFetcher = new FallbackArticleFetcher(
    [
      new JinaArticleFetcher(logger),
      new HttpArticleFetcher(logger),
      new BrowserlessArticleFetcher(config.browserlessApiKey),
    ],
    logger,
  );

  return {
    logger,
    database,
    useCases: {
      readArticle: new ReadArticleUseCase(articleFetcher, analyzer, logger),
      analyzeVideo: new AnalyzeVideoUseCase(analyzer),
      summarizeText: new SummarizeTextUseCase(analyzer),
      readPdf: new ReadPdfUseCase(analyzer),
      speakText: new SpeakTextUseCase(synthesizer),
      buildStudyPack: new BuildStudyPackUseCase(analyzer, logger),
    },
    studyRepository: new SqliteStudyRepository(database),
  };
}
