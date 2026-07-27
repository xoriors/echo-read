import { BrowserlessArticleFetcher } from '../adapters/outbound/article/browserlessArticleFetcher';
import { FallbackArticleFetcher } from '../adapters/outbound/article/fallbackArticleFetcher';
import { HttpArticleFetcher } from '../adapters/outbound/article/httpArticleFetcher';
import { JinaArticleFetcher } from '../adapters/outbound/article/jinaArticleFetcher';
import { GeminiClientProvider } from '../adapters/outbound/gemini/geminiClient';
import { GeminiContentAnalyzer } from '../adapters/outbound/gemini/geminiContentAnalyzer';
import { GeminiSpeechSynthesizer } from '../adapters/outbound/gemini/geminiSpeechSynthesizer';
import { ConsoleLogger } from '../adapters/outbound/logging/consoleLogger';
import type { Logger } from '../application/ports/logger';
import { AnalyzeVideoUseCase } from '../application/usecases/analyzeVideo';
import { ReadArticleUseCase } from '../application/usecases/readArticle';
import { ReadPdfUseCase } from '../application/usecases/readPdf';
import { SpeakTextUseCase } from '../application/usecases/speakText';
import { SummarizeTextUseCase } from '../application/usecases/summarizeText';
import type { ServerConfig } from './environment';

export interface ServerContainer {
  logger: Logger;
  useCases: {
    readArticle: ReadArticleUseCase;
    analyzeVideo: AnalyzeVideoUseCase;
    summarizeText: SummarizeTextUseCase;
    readPdf: ReadPdfUseCase;
    speakText: SpeakTextUseCase;
  };
}

/**
 * Composition root for the server hexagon: the one module that knows both the
 * ports and the concrete adapters behind them. Swapping a provider is an edit
 * here and nowhere else.
 */
export function createServerContainer(config: ServerConfig): ServerContainer {
  const logger = new ConsoleLogger(config.isProduction ? 'info' : 'debug');

  const geminiClients = new GeminiClientProvider(config.geminiApiKey);
  const analyzer = new GeminiContentAnalyzer(geminiClients);
  const synthesizer = new GeminiSpeechSynthesizer(geminiClients);

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
    useCases: {
      readArticle: new ReadArticleUseCase(articleFetcher, analyzer, logger),
      analyzeVideo: new AnalyzeVideoUseCase(analyzer),
      summarizeText: new SummarizeTextUseCase(analyzer),
      readPdf: new ReadPdfUseCase(analyzer),
      speakText: new SpeakTextUseCase(synthesizer),
    },
  };
}
