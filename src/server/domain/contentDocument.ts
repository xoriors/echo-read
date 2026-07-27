import { dedupeSources, type GroundingSource } from '../../shared/domain/groundingSource';

/**
 * A piece of readable content plus the citations that back it.
 * This is what every server use case ultimately produces.
 */
export interface ContentDocument {
  text: string;
  sources: GroundingSource[];
}

/** A content document that is specifically the analysis of one video. */
export interface VideoAnalysis extends ContentDocument {
  videoSource: GroundingSource;
}

export function contentDocument(text: string, sources: readonly GroundingSource[] = []): ContentDocument {
  return { text: text.trim(), sources: dedupeSources(sources) };
}

export function hasReadableText(document: ContentDocument): boolean {
  return document.text.trim().length > 0;
}
