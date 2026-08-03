import { describeDue, interleave } from '../src/client/domain/dueSession';
import type { ScheduledCardResponse, ScheduledQuizResponse } from '../src/shared/contracts/api';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const cards = (n: number): ScheduledCardResponse[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    front: `Card ${i}`,
    back: 'back',
    documentTitle: 'Doc',
    dueAt: null,
  }));

const questions = (n: number): ScheduledQuizResponse[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    stem: `Question ${i}`,
    options: ['a', 'b', 'c', 'd'],
    answerIndex: 0,
    documentTitle: 'Doc',
    dueAt: null,
  }));

const shape = (cardCount: number, questionCount: number): string =>
  interleave(cards(cardCount), questions(questionCount))
    .map((item) => (item.kind === 'card' ? 'C' : 'Q'))
    .join('');

// --- Nothing is lost -------------------------------------------------------
for (const [c, q] of [
  [0, 0],
  [1, 0],
  [0, 1],
  [3, 3],
  [7, 2],
  [2, 9],
  [50, 50],
]) {
  const items = interleave(cards(c), questions(q));
  const gotCards = items.filter((i) => i.kind === 'card').length;
  const gotQuestions = items.filter((i) => i.kind === 'question').length;
  check(
    gotCards === c && gotQuestions === q,
    `${c} cards + ${q} questions all survive (got ${gotCards} + ${gotQuestions})`,
  );
  check(new Set(items.map((i) => (i.kind === 'card' ? i.card.id : i.question.id))).size === c + q, `  and none is duplicated`);
}

// --- It actually mixes -----------------------------------------------------
check(shape(3, 3) === 'CQCQCQ', `equal lists alternate (got ${shape(3, 3)})`);

// The point of the ratio: neither kind may pile up at one end, which would
// turn the session back into the blocked practice this exists to avoid. With
// 6 cards to 2 questions the longest run of cards should be about 3 — what it
// must not be is 6 followed by 2.
const longestRun = (pattern: string): number =>
  Math.max(...(pattern.match(/(.)\1*/g) ?? ['']).map((run) => run.length));

for (const [c, q] of [
  [6, 2],
  [2, 6],
  [9, 3],
  [10, 1],
]) {
  const pattern = shape(c, q);
  const worst = Math.ceil(Math.max(c, q) / (Math.min(c, q) + 1));
  const run = longestRun(pattern);
  check(
    run <= worst + 1,
    `${c}:${q} spreads out — longest run ${run}, ideal ${worst} (${pattern})`,
  );
}

// --- One kind only ---------------------------------------------------------
check(shape(4, 0) === 'CCCC', 'cards alone stay cards');
check(shape(0, 4) === 'QQQQ', 'questions alone stay questions');
check(shape(0, 0) === '', 'nothing due is an empty session');

// --- How it is described ---------------------------------------------------
check(describeDue(2, 3) === '2 cards and 3 questions', `both kinds (got "${describeDue(2, 3)}")`);
check(describeDue(1, 1) === '1 card and 1 question', `singular of each (got "${describeDue(1, 1)}")`);
check(describeDue(5, 0) === '5 cards', `no questions omits them (got "${describeDue(5, 0)}")`);
check(describeDue(0, 1) === '1 question', `no cards omits them (got "${describeDue(0, 1)}")`);
check(describeDue(0, 0) === '', 'nothing due says nothing');

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
