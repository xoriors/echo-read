import { ContentUnavailableError, ValidationError } from '../../../shared/domain/errors';
import { dedupeSources } from '../../../shared/domain/groundingSource';
import type { VideoAnalysis } from '../../domain/contentDocument';
import { isRefusal, VIDEO_PROMPT_VERSION, videoAnalysisPrompt } from '../../domain/prompts';
import { parseVideoAnalysis } from '../../domain/videoAnalysisParser';
import { youtubeVideoId } from '../../domain/youtubeVideoId';
import type { ContentAnalyzer } from '../ports/contentAnalyzer';
import type { Logger } from '../ports/logger';
import type { VideoAnalysisCache } from '../ports/videoAnalysisCache';

export interface AnalyzeVideoCommand {
  url: string;
}

/** Saved when the analyzer doesn't say which model answered. */
const UNKNOWN_MODEL = 'unknown';

/**
 * Research a video through web search and report back what it is about.
 * The model has no direct access to the video, only to what the web says.
 * A YouTube video that was already analysed with the current prompt is served
 * from the cache instead, so it costs neither time nor video quota again.
 */
export class AnalyzeVideoUseCase {
  constructor(
    private readonly analyzer: ContentAnalyzer,
    private readonly cache: VideoAnalysisCache,
    private readonly logger: Logger,
  ) {}

  async execute({ url }: AnalyzeVideoCommand): Promise<VideoAnalysis> {
    if (!url?.trim()) throw new ValidationError('URL is required');

    // Only a YouTube video has an id to cache it under; anything else is
    // analysed every time, as before.
    const videoId = youtubeVideoId(url);
    if (videoId === null) {
      const fresh = await this.analyze(url);
      return fresh.analysis;
    }
    const cached = await this.readCache(videoId);
    if (cached !== null) {
      return cached;
    }
    const fresh = await this.analyze(url);
    await this.writeCache(videoId, fresh.analysis, fresh.model);
    return fresh.analysis;
  }

  /** Asks the model, and turns its reply into analysis. */
  private async analyze(url: string): Promise<{ analysis: VideoAnalysis; model: string }> {
    const { text, sources, model } = await this.analyzer.analyze({
      prompt: videoAnalysisPrompt(url),
      useWebSearch: true,
    });

    if (!text.trim() || isRefusal(text)) {
      throw new ContentUnavailableError(
        'The AI could not analyze this video. It might be private, age-restricted, or lacks sufficient public information.',
      );
    }

    const parsed = parseVideoAnalysis(text, url);
    const analysis: VideoAnalysis = {
      text: parsed.analysis,
      sources: dedupeSources(sources),
      videoSource: parsed.videoSource,
    };
    return { analysis, model: model ?? UNKNOWN_MODEL };
  }

  /**
   * The cached analysis, or null when there is none.
   * Storage can be unavailable while the rest of the app works, so a broken
   * cache counts as a miss rather than failing the request.
   */
  private async readCache(videoId: string): Promise<VideoAnalysis | null> {
    try {
      const cached = await this.cache.get(videoId, VIDEO_PROMPT_VERSION);
      if (cached === null) {
        return null;
      }
      this.logger.info('Video analysis served from cache', { videoId, analyzedAt: cached.createdAt });
      return cached.analysis;
    } catch (error) {
      this.logger.warn('Video cache unavailable; analysing again', {
        videoId,
        reason: (error as Error).message,
      });
      return null;
    }
  }

  /** Saves a fresh analysis. Failing to save only loses the cache, not the answer. */
  private async writeCache(videoId: string, analysis: VideoAnalysis, model: string): Promise<void> {
    try {
      await this.cache.put({
        videoId,
        promptVersion: VIDEO_PROMPT_VERSION,
        model,
        durationSeconds: null,
        analysis,
      });
    } catch (error) {
      this.logger.warn('Could not save video analysis to cache', {
        videoId,
        reason: (error as Error).message,
      });
    }
  }
}