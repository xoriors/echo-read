import { dedupeSources, groundingSourceOf, type GroundingSource } from '../../../../shared/domain/groundingSource';
import type {
  AnalysisRequest,
  AnalysisResult,
  ContentAnalyzer,
} from '../../../application/ports/contentAnalyzer';
import type { GeminiClientProvider } from './geminiClient';
import { mapGeminiError } from './geminiErrorMapper';

export const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash';

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

/** Drives Google's Gemini models for every text-producing use case. */
export class GeminiContentAnalyzer implements ContentAnalyzer {
  constructor(
    private readonly clients: GeminiClientProvider,
    private readonly model: string = DEFAULT_TEXT_MODEL,
  ) {}

  async analyze({ prompt, attachments = [], useWebSearch = false }: AnalysisRequest): Promise<AnalysisResult> {
    try {
      const response = await this.clients.get().models.generateContent({
        model: this.model,
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
    } catch (error) {
      throw mapGeminiError(error, 'Failed to process content with Gemini.');
    }
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
