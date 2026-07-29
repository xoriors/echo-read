/**
 * The verification the live probe cannot force: what happens to a feedback
 * point that cites a page the source does not support.
 */
import {
  CheckExplanationUseCase,
  EXPLANATION_SOURCE_CHARACTERS,
  MAX_POINTS_PER_LIST,
} from '../src/server/application/usecases/checkExplanation';
import type { AnalysisRequest, AnalysisResult, ContentAnalyzer } from '../src/server/application/ports/contentAnalyzer';
import type { Logger } from '../src/server/application/ports/logger';
import { pageWindow, type DocumentPage } from '../src/shared/domain/page';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const silent: Logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

class StubAnalyzer implements ContentAnalyzer {
  seen: AnalysisRequest | null = null;
  constructor(private readonly reply: unknown) {}
  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    this.seen = request;
    return { text: JSON.stringify(this.reply), sources: [] };
  }
}

const PAGES: DocumentPage[] = [
  { number: 1, text: 'Spacing distributes study across separate sessions.' },
  { number: 2, text: 'Retrieval practice means recalling rather than rereading.' },
  { number: 3, text: 'Interleaving mixes problem types within a session.' },
];

const ANSWER = 'Retrieval practice means recalling material from memory rather than rereading it, which changes the memory.';

// --- A fabricated citation is dropped -------------------------------------
const analyzer = new StubAnalyzer({
  summary: 'Good start.',
  covered: [
    { point: 'Real', sourcePage: 2, sourceQuote: 'recalling rather than rereading' },
    // The quote is invented outright.
    { point: 'Invented quote', sourcePage: 2, sourceQuote: 'the hippocampus consolidates overnight' },
    // The quote is real, but it is on page 1, not page 3.
    { point: 'Wrong page', sourcePage: 3, sourceQuote: 'Spacing distributes study' },
    // The page does not exist in the window at all.
    { point: 'No such page', sourcePage: 99, sourceQuote: 'Spacing distributes study' },
  ],
  missed: [{ point: 'Missing bit', sourcePage: 3, sourceQuote: 'Interleaving mixes problem types' }],
  incorrect: [],
});

const useCase = new CheckExplanationUseCase(analyzer, silent);
const result = await useCase.execute({
  prompt: 'Explain retrieval practice.',
  answer: ANSWER,
  pages: PAGES,
  sourcePage: 2,
});

check(result.feedback.covered.length === 1, `only the grounded point survives (kept ${result.feedback.covered.length})`);
check(result.feedback.covered[0]?.point === 'Real', 'and it is the right one');
check(result.unverified === 3, `all three bad citations are counted (${result.unverified})`);
check(result.feedback.missed.length === 1, 'a grounded missed point is kept');
check(result.feedback.summary === 'Good start.', 'the summary is passed through');

// --- The model is shown page markers --------------------------------------
const sent = analyzer.seen?.prompt.userPrompt ?? '';
check(sent.includes('[Page 1]') && sent.includes('[Page 3]'), 'the source is labelled with page markers');
check(sent.includes(ANSWER), "the learner's answer reaches the model");
check(!!analyzer.seen?.responseSchema, 'a response schema is demanded rather than prose parsed');

// --- A short answer never reaches the model -------------------------------
const counting = new StubAnalyzer({ summary: '', covered: [], missed: [], incorrect: [] });
let refused = false;
try {
  await new CheckExplanationUseCase(counting, silent).execute({
    prompt: 'Explain.',
    answer: 'no idea',
    pages: PAGES,
    sourcePage: 1,
  });
} catch {
  refused = true;
}
check(refused, 'a too-short answer is refused');
check(counting.seen === null, 'and costs no model call');

// --- A wall of points is capped -------------------------------------------
const many = new StubAnalyzer({
  summary: 's',
  covered: Array.from({ length: 20 }, (_, i) => ({
    point: `Point ${i}`,
    sourcePage: 2,
    sourceQuote: 'recalling rather than rereading',
  })),
  missed: [],
  incorrect: [],
});
const capped = await new CheckExplanationUseCase(many, silent).execute({
  prompt: 'Explain.',
  answer: ANSWER,
  pages: PAGES,
  sourcePage: 2,
});
check(
  capped.feedback.covered.length === MAX_POINTS_PER_LIST,
  `feedback is capped at ${MAX_POINTS_PER_LIST} points (got ${capped.feedback.covered.length})`,
);
check(capped.unverified === 0, 'points dropped for length are not reported as bad citations');

// --- Any document size ----------------------------------------------------
const book: DocumentPage[] = Array.from({ length: 900 }, (_, i) => ({
  number: i + 1,
  text: `Page ${i + 1}. `.padEnd(2_000, 'x'),
}));

const middle = pageWindow(book, 450, EXPLANATION_SOURCE_CHARACTERS);
const size = middle.reduce((total, page) => total + page.text.length, 0);
check(size <= EXPLANATION_SOURCE_CHARACTERS, `a 900-page book yields a bounded window (${size} chars)`);
check(middle.some((page) => page.number === 450), 'the window contains the cited page');
check(
  middle[0].number < 450 && middle[middle.length - 1].number > 450,
  `the window reaches both sides of it (pages ${middle[0].number}-${middle[middle.length - 1].number})`,
);
check(
  middle.every((page, i) => i === 0 || page.number === middle[i - 1].number + 1),
  'and is a contiguous run — no gap the model could cite around',
);

// A page that will not fit must stop that side, not be skipped for a smaller
// one further out.
const lopsided = [
  { number: 1, text: 'a'.repeat(100) },
  { number: 2, text: 'b'.repeat(9_000) },
  { number: 3, text: 'c'.repeat(100) },
  { number: 4, text: 'd'.repeat(100) },
  { number: 5, text: 'e'.repeat(100) },
];
const stopped = pageWindow(lopsided, 3, 500);
check(
  stopped.map((p) => p.number).join(',') === '3,4,5',
  `an oversized neighbour stops that side rather than being skipped (got ${stopped.map((p) => p.number)})`,
);

const edge = pageWindow(book, 1, EXPLANATION_SOURCE_CHARACTERS);
check(edge[0].number === 1, 'a prompt on page 1 still gets a window');

const uncited = pageWindow(book, null, EXPLANATION_SOURCE_CHARACTERS);
check(uncited.length > 0 && uncited[0].number === 1, 'a prompt citing no page falls back to the opening');

const huge = pageWindow(
  [{ number: 1, text: 'y'.repeat(EXPLANATION_SOURCE_CHARACTERS * 3) }],
  1,
  EXPLANATION_SOURCE_CHARACTERS,
);
check(huge.length === 1, 'a single page larger than the budget is still shown rather than dropped');

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
