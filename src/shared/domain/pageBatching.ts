import { PAGE_SEPARATOR, type DocumentPage } from './page';

/**
 * Splitting a document into windows a model can answer in one call.
 *
 * The binding limit is not input context — Gemini 2.5 Flash takes about a
 * million tokens, more than most books — it is *output*: a single call cannot
 * emit a study deck for five hundred pages. So generation fans out over
 * batches and the results are merged here, in plain code, rather than by
 * another model call that could hallucinate during the merge.
 *
 * Batches never straddle a page boundary. That is what keeps citations exact:
 * every item a batch produces can only cite pages the batch actually contained.
 */
export interface PageBatch {
  index: number;
  pages: DocumentPage[];
  firstPage: number;
  lastPage: number;
  /** The pages joined as the reader would hear them. */
  text: string;
  /**
   * The same text with a marker before each page.
   *
   * This is what a model is shown when it has to cite pages. Without markers
   * the batch is one undifferentiated block and a page number can only be
   * guessed — in testing the model quoted page two verbatim and attributed it
   * to page one, every time.
   */
  labelledText: string;
  characters: number;
}

/** Marks a page boundary for a model. Kept terse so it costs few tokens. */
export function pageMarker(number: number): string {
  return `[Page ${number}]`;
}

/** Chosen to leave the model ample output budget for a batch's worth of items. */
export const DEFAULT_BATCH_CHARACTERS = 10_000;

export interface BatchingOptions {
  maxCharacters?: number;
}

/**
 * Packs pages into batches, greedily and in order.
 *
 * A page longer than the budget becomes its own batch rather than being cut:
 * splitting mid-page would produce a batch whose text is not wholly on any one
 * page, and citation accuracy is worth more than uniform batch sizes.
 */
export function batchPages(
  pages: readonly DocumentPage[],
  { maxCharacters = DEFAULT_BATCH_CHARACTERS }: BatchingOptions = {},
): PageBatch[] {
  const batches: PageBatch[] = [];
  let current: DocumentPage[] = [];
  let size = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    batches.push(toBatch(batches.length, current));
    current = [];
    size = 0;
  };

  for (const page of pages) {
    const cost = page.text.length + (current.length > 0 ? PAGE_SEPARATOR.length : 0);

    if (current.length > 0 && size + cost > maxCharacters) flush();

    current.push(page);
    size += current.length === 1 ? page.text.length : cost;
  }

  flush();
  return batches;
}

function toBatch(index: number, pages: DocumentPage[]): PageBatch {
  const text = pages.map((page) => page.text).join(PAGE_SEPARATOR);
  const labelledText = pages
    .map((page) => `${pageMarker(page.number)}\n${page.text}`)
    .join(PAGE_SEPARATOR);

  return {
    index,
    pages,
    firstPage: pages[0].number,
    lastPage: pages[pages.length - 1].number,
    text,
    labelledText,
    characters: text.length,
  };
}

/**
 * How many items to ask a batch for.
 *
 * Roughly one per 450 words, so a long document yields a longer deck without
 * yielding an unusable one — a five-hundred-page book should not produce two
 * thousand cards nobody will ever review. The per-batch floor keeps a short
 * final batch from being skipped entirely.
 */
export const WORDS_PER_ITEM = 450;
export const MIN_ITEMS_PER_BATCH = 2;
export const MAX_ITEMS_PER_BATCH = 12;

export function itemsForBatch(batch: PageBatch): number {
  const words = batch.text.split(/\s+/).filter(Boolean).length;
  const target = Math.round(words / WORDS_PER_ITEM);

  return Math.min(MAX_ITEMS_PER_BATCH, Math.max(MIN_ITEMS_PER_BATCH, target));
}

export interface GenerationEstimate {
  batches: number;
  /** One model call per batch. Shown before generating, so cost is not a surprise. */
  calls: number;
  estimatedItems: number;
  characters: number;
}

export function estimateGeneration(batches: readonly PageBatch[]): GenerationEstimate {
  return {
    batches: batches.length,
    calls: batches.length,
    estimatedItems: batches.reduce((total, batch) => total + itemsForBatch(batch), 0),
    characters: batches.reduce((total, batch) => total + batch.characters, 0),
  };
}

/** The shape the merge needs; the full item types live in the server domain. */
export interface MergeableItem {
  /** The text a duplicate would repeat — a card front, or a question stem. */
  key: string;
  sourcePage?: number;
}

export interface MergeOptions {
  limit: number;
}

/**
 * Combines every batch's output into one deck.
 *
 * Two things go wrong without this. Batches overlap in subject matter and
 * produce near-identical cards, so duplicates are dropped on a normalised key.
 * And a naive concatenation truncated to a limit would cover only the opening
 * chapters, so items are taken in passes across the document — one from each
 * batch, then a second from each — leaving coverage spread over the whole
 * document however the limit falls.
 */
export function mergeBatchItems<T extends MergeableItem>(
  perBatch: readonly (readonly T[])[],
  { limit }: MergeOptions,
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  // A cursor per batch rather than one shared round index: a batch whose turn
  // lands on a duplicate advances to its next usable item instead of
  // forfeiting the round. Without that, discarding a duplicate silently costs
  // that batch its slot, and a tight limit ends up clustered in the batches
  // that happened to be duplicate-free.
  const cursors = perBatch.map(() => 0);
  let tookAny = true;

  while (merged.length < limit && tookAny) {
    tookAny = false;

    for (let batch = 0; batch < perBatch.length && merged.length < limit; batch++) {
      const items = perBatch[batch];

      while (cursors[batch] < items.length) {
        const item = items[cursors[batch]++];
        const key = normaliseKey(item.key);
        if (!key || seen.has(key)) continue;

        seen.add(key);
        merged.push(item);
        tookAny = true;
        break;
      }
    }
  }

  return merged;
}

function normaliseKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
