import { toAnkiTsv } from '../src/client/domain/study';
import type { QuizItem } from '../src/shared/domain/studyPack';

const cards = [
  { front: 'What is spacing?', back: 'Study spread over time.', sourcePage: 2 },
  { front: 'Tab\there', back: 'Line\nbreak', sourcePage: undefined },
];

const quizItems: QuizItem[] = [
  {
    stem: 'Which schedule retained best?',
    options: ['Massed', 'Distributed', 'Rereading', 'Highlighting'],
    answerIndex: 1,
    rationale: 'Delayed recall was higher.',
    sourcePage: 4,
  },
];

const tsv = toAnkiTsv(cards, quizItems);
const lines = tsv.split('\n');

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

check(lines.length === 3, `one line per note (got ${lines.length})`);
check(tsv.includes('What is spacing?'), 'a flashcard front is in the file');
check(tsv.includes('Which schedule retained best?'), 'a quiz stem is in the file');
check(/A\) Massed.*B\) Distributed.*C\) Rereading.*D\) Highlighting/.test(tsv), 'options are lettered on the front');
check(tsv.includes('B) Distributed'), 'the answer is on the back, lettered');
check(tsv.includes('Delayed recall was higher.'), 'the rationale is on the back');
check(tsv.includes('(p. 4)'), 'the quiz page citation survives export');
check(tsv.includes('(p. 2)'), 'the flashcard page citation survives export');

for (const [index, line] of lines.entries()) {
  const fields = line.split('\t');
  check(fields.length === 2, `line ${index + 1} has exactly two fields (got ${fields.length})`);
  check(!/[\r\n]/.test(line), `line ${index + 1} contains no raw newline`);
}

check(tsv.includes('Line<br>break'), 'a newline inside a field became <br> rather than a new note');

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
