/**
 * What happens when generation fails.
 *
 * A batch that fails is swallowed so one bad call cannot cost a whole book —
 * which is right for one batch out of twenty and was badly wrong for one out
 * of one: a quota exhausted mid-request produced an empty pack, returned HTTP
 * 200, and rendered as "No flashcards in this pack" beside a notice saying it
 * had been generated. The reader was told nothing had gone wrong.
 */
import { BuildStudyPackUseCase } from '../src/server/application/usecases/buildStudyPack';
import type { AnalysisRequest, AnalysisResult, ContentAnalyzer } from '../src/server/application/ports/contentAnalyzer';
import type { Logger } from '../src/server/application/ports/logger';
import { RateLimitedError } from '../src/shared/domain/errors';
import type { DocumentPage } from '../src/shared/domain/page';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const silent: Logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

const QUOTA_MESSAGE = 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 20';

/** Pages long enough that `batchPages` makes more than one batch. */
function pagesOf(count: number): DocumentPage[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    text: `Page ${i + 1}. Spaced practice distributes study across sessions. `.padEnd(6_000, 'x'),
  }));
}

function reply(pageNumber: number, quote: string): string {
  return JSON.stringify({
    preQuestions: [{ question: 'What is spacing?' }],
    // Distinct per page: identical fronts are merged as duplicates, which is
    // correct but would hide whether every batch contributed.
    flashcards: [
      {
        front: `What does page ${pageNumber} say about spacing?`,
        back: 'Study across sessions.',
        sourcePage: pageNumber,
        sourceQuote: quote,
      },
    ],
    quizItems: [],
    selfExplanationPrompts: [],
  });
}

/** Fails the first `failCount` calls, then answers. */
class FlakyAnalyzer implements ContentAnalyzer {
  calls = 0;
  constructor(
    private readonly failCount: number,
    private readonly error: Error = new RateLimitedError(QUOTA_MESSAGE),
  ) {}

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    this.calls++;
    if (this.calls <= this.failCount) throw this.error;

    // Quote a page this batch was actually shown, so the item verifies.
    //
    // Read from after "Text:" rather than the whole prompt: the instructions
    // above it contain a literal "[Page 7]" as an example of a marker, and
    // matching that instead cites a page the batch never saw.
    const source = request.prompt.userPrompt.split('\nText:\n')[1] ?? '';
    const page = Number(/\[Page (\d+)\]/.exec(source)?.[1] ?? 1);

    return { text: reply(page, `Page ${page}. Spaced practice distributes study`), sources: [] };
  }
}

// --- Every batch fails -----------------------------------------------------
const allFail = new FlakyAnalyzer(Number.MAX_SAFE_INTEGER);
let thrown: Error | null = null;
try {
  await new BuildStudyPackUseCase(allFail, silent).execute({ pages: pagesOf(1), model: 'm' });
} catch (error) {
  thrown = error as Error;
}

check(thrown !== null, 'a generation where every section failed throws rather than returning an empty pack');
check(
  (thrown?.message ?? '').includes('Quota exceeded'),
  `and carries the real reason, so the reader learns their quota ran out (got: ${thrown?.message.slice(0, 60)})`,
);

// --- Some batches fail -----------------------------------------------------
// Four batches, the first two fail. A partial deck is worth keeping — but the
// hole in it has to be reported.
const partial = new FlakyAnalyzer(2);
const result = await new BuildStudyPackUseCase(partial, silent).execute({
  pages: pagesOf(4),
  model: 'm',
});

check(result.estimate.batches === 4, `the document made four batches (got ${result.estimate.batches})`);
check(result.failedBatches === 2, `two failed sections are counted (got ${result.failedBatches})`);
check(result.pack.flashcards.length > 0, 'the sections that worked still produce cards');
check(result.rejected === 0, 'a failed section is not miscounted as a discarded item');

// --- Nothing fails ---------------------------------------------------------
const healthy = new FlakyAnalyzer(0);
const clean = await new BuildStudyPackUseCase(healthy, silent).execute({
  pages: pagesOf(2),
  model: 'm',
});

check(clean.failedBatches === 0, 'a clean run reports no failed sections');
check(
  clean.pack.flashcards.length === 2,
  `and every batch contributed a card (got ${clean.pack.flashcards.length})`,
);

// --- A genuinely empty result is not a failure -----------------------------
// The model answered; it just produced nothing usable. That is an empty deck,
// not a failed generation, and must not be reported as one.
const emptyAnalyzer: ContentAnalyzer = {
  analyze: async () => ({
    text: JSON.stringify({ preQuestions: [], flashcards: [], quizItems: [], selfExplanationPrompts: [] }),
    sources: [],
  }),
};

const empty = await new BuildStudyPackUseCase(emptyAnalyzer, silent).execute({
  pages: pagesOf(1),
  model: 'm',
});

check(empty.failedBatches === 0, 'a model that answers with nothing is not a failed section');
check(empty.pack.flashcards.length === 0, 'and the pack is simply empty');

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
