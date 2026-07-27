/**
 * A citation backing a piece of generated content: the article that was read,
 * the video that was analysed, or a page the model consulted via web search.
 */
export interface GroundingSource {
  uri: string;
  title: string;
}

export function groundingSourceOf(uri: string, title?: string): GroundingSource {
  return { uri, title: title?.trim() || uri };
}

/** Collapses duplicates by URI while preserving first-seen order. */
export function dedupeSources(sources: readonly GroundingSource[]): GroundingSource[] {
  const byUri = new Map<string, GroundingSource>();
  for (const source of sources) {
    if (source.uri && !byUri.has(source.uri)) byUri.set(source.uri, source);
  }
  return [...byUri.values()];
}
