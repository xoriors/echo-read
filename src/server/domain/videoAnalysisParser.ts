import { groundingSourceOf, type GroundingSource } from '../../shared/domain/groundingSource';

const TITLE_LINE = /^VIDEO_TITLE: (.*)$/m;
const URL_LINE = /^VIDEO_URL: (.*)$/m;
const SEPARATOR = '---';
const UNKNOWN_TITLE = 'Unknown Video';

export interface ParsedVideoAnalysis {
  analysis: string;
  videoSource: GroundingSource;
}

/**
 * Splits the model's reply into the video it identified and the prose about it.
 *
 * Pure and total: a reply that ignores the requested envelope still yields the
 * full text as the analysis, attributed to the URL the caller asked about.
 */
export function parseVideoAnalysis(reply: string, requestedUrl: string): ParsedVideoAnalysis {
  const text = reply.trim();

  const title = TITLE_LINE.exec(text)?.[1]?.trim() || UNKNOWN_TITLE;
  const url = URL_LINE.exec(text)?.[1]?.trim() || requestedUrl;

  const separatorIndex = text.indexOf(SEPARATOR);
  const analysis =
    separatorIndex !== -1
      ? text.substring(separatorIndex + SEPARATOR.length).trim()
      : text.replace(TITLE_LINE, '').replace(URL_LINE, '').trim();

  return { analysis, videoSource: groundingSourceOf(url, title) };
}
