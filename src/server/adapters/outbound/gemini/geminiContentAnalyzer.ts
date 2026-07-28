import { dedupeSources, groundingSourceOf, type GroundingSource } from '../../../../shared/domain/groundingSource';
import type {
  AnalysisRequest,
  AnalysisResult,
  ContentAnalyzer,
} from '../../../application/ports/contentAnalyzer';
import type { Logger } from '../../../application/ports/logger';
import type { GeminiClientProvider } from './geminiClient';
import { mapGeminiError } from './geminiErrorMapper';
import { callWithModelFallback } from './modelFallback';

export const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash';

/**
 * Tried in order when the preferred model is overloaded, roughly best-first:
 * a same-class model from the next generation, then a lighter one that is
 * cheaper to serve and so less likely to be saturated.
 *
 * Every entry was checked against `generateContent` rather than taken from
 * `models.list` — that listing still advertises retired names such as
 * `gemini-2.5-flash-lite`, which answers 404.
 */
export const DEFAULT_TEXT_MODELS: readonly string[] = [
  DEFAULT_TEXT_MODEL,
  'gemini-3-flash-preview',
  'gemini-flash-lite-latest',
];

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

/** Drives Google's Gemini models for every text-producing use case. */
export class GeminiContentAnalyzer implements ContentAnalyzer {
  constructor(
    private readonly clients: GeminiClientProvider,
    private readonly logger: Logger,
    private readonly models: readonly string[] = DEFAULT_TEXT_MODELS,
  ) {}

  async analyze({ prompt, attachments = [], useWebSearch = false }: AnalysisRequest): Promise<AnalysisResult> {
    return callWithModelFallback({
      models: this.models,
      logger: this.logger,
      operationName: 'analyze',
      mapError: (error) => mapGeminiError(error, 'Failed to process content with Gemini.'),
      operation: async (model) => {
        const response = await this.clients.get().models.generateContent({
          model,
          contents: {
            parts: [
              ...attachments.map(({ mimeType, data }) => ({ inlineData: { mimeType, data } })),
              { text: prompt.userPrompt },
            ],
          },
          config: {
            systemInstruction: prompt.systemInstruction,
            ...(useWebSearch ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });

        return {
          text: response.text?.trim() ?? '',
          sources: useWebSearch ? readGroundingSources(response) : [],
        };
      },
    });
  }
}

function readGroundingSources(response: unknown): GroundingSource[] {
  const candidate = (response as { candidates?: Array<{ groundingMetadata?: { groundingChunks?: GroundingChunk[] } }> })
    ?.candidates?.[0];

  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];

  return dedupeSources(
    chunks
      .map((chunk) => groundingSourceOf(chunk.web?.uri ?? '', chunk.web?.title || 'Unknown Source'))
      .filter((source) => !!source.uri),
  );
}
