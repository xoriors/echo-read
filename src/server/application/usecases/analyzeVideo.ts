import { ContentUnavailableError, ValidationError } from '../../../shared/domain/errors';
import { dedupeSources } from '../../../shared/domain/groundingSource';
import type { VideoAnalysis } from '../../domain/contentDocument';
import { isRefusal, videoAnalysisPrompt } from '../../domain/prompts';
import { parseVideoAnalysis } from '../../domain/videoAnalysisParser';
import type { ContentAnalyzer } from '../ports/contentAnalyzer';

export interface AnalyzeVideoCommand {
  url: string;
}

/**
 * Research a video through web search and report back what it is about.
 * The model has no direct access to the video, only to what the web says.
 */
export class AnalyzeVideoUseCase {
  constructor(private readonly analyzer: ContentAnalyzer) {}

  async execute({ url }: AnalyzeVideoCommand): Promise<VideoAnalysis> {
    if (!url?.trim()) throw new ValidationError('URL is required');

    const { text, sources } = await this.analyzer.analyze({
      prompt: videoAnalysisPrompt(url),
      useWebSearch: true,
    });

    if (!text.trim() || isRefusal(text)) {
      throw new ContentUnavailableError(
        'The AI could not analyze this video. It might be private, age-restricted, or lacks sufficient public information.',
      );
    }

    const { analysis, videoSource } = parseVideoAnalysis(text, url);
    return { text: analysis, sources: dedupeSources(sources), videoSource };
  }
}
