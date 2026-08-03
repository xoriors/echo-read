import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { MIGRATIONS, migrate } from '../src/server/adapters/outbound/sqlite/migrations';
import { SqliteDatabaseProvider } from '../src/server/adapters/outbound/sqlite/sqliteDatabase';
import { SqliteStudyRepository } from '../src/server/adapters/outbound/sqlite/sqliteStudyRepository';
import type { DocumentPage } from '../src/shared/domain/page';

// A scratch data directory, opened through the real provider rather than a
// stub, so the pragmas the schema depends on — foreign keys above all — are
// the ones production sets.
const DIR = path.join(process.cwd(), '.test-data');
const PATH = path.join(DIR, 'echoread.db');
rmSync(DIR, { recursive: true, force: true });

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

// --- The upgrade path a deployed database actually takes ------------------
// Migration 1 alone, with a row written under it, then migration 2 on top.
mkdirSync(DIR, { recursive: true });
const upgrading = new DatabaseSync(PATH);
upgrading.exec('PRAGMA foreign_keys = ON');
upgrading.exec('CREATE TABLE IF NOT EXISTS schema_migration (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
upgrading.exec('BEGIN');
upgrading.exec(MIGRATIONS[0].sql);
upgrading.prepare('INSERT INTO schema_migration (id, name) VALUES (1, ?)').run(MIGRATIONS[0].name);
upgrading.exec('COMMIT');

upgrading.prepare("INSERT INTO owner (id) VALUES ('old')").run();
upgrading
  .prepare(
    `INSERT INTO document (id, owner_id, title, kind, page_count, source_hash, text)
     VALUES ('dold','old','Legacy','pdf',1,'hold','the old flattened text')`,
  )
  .run();
upgrading.prepare("INSERT INTO study_pack (id, document_id, owner_id, model) VALUES ('pold','dold','old','m')").run();

const upgrade = migrate(upgrading);
const afterFirst = MIGRATIONS.filter((m) => m.id > 1).map((m) => m.id);
check(
  upgrade.applied.join(',') === afterFirst.join(','),
  `an existing v1 database upgrades through every later migration (applied ${upgrade.applied}, expected ${afterFirst})`,
);
check(upgrade.skipped.join(',') === '1', 'migration 1 is not re-run over live data');

const legacy = upgrading
  .prepare("SELECT text, page_index FROM document WHERE id = 'dold'")
  .get() as unknown as { text: string; page_index: string | null };
check(legacy.text === 'the old flattened text', 'the pre-existing document keeps its text');
check(legacy.page_index === null, 'and gets a null page index rather than a wrong one');

// A prompt on the legacy pack, to prove a document with no index still grades.
upgrading
  .prepare(
    "INSERT INTO self_explanation (id, study_pack_id, owner_id, prompt, source_page) VALUES ('eold','pold','old','Explain',NULL)",
  )
  .run();
upgrading.close();

// --- The repository, against the upgraded database ------------------------
const provider = new SqliteDatabaseProvider(DIR);
const database = provider.get();
const repository = new SqliteStudyRepository(provider);

const legacyContext = await repository.findExplanation('old', 'eold');
check(legacyContext !== null, 'a prompt on a pre-index document is still found');
check(
  legacyContext?.pages.length === 1 && legacyContext.pages[0].number === 1,
  'a document with no page index reads as one page rather than failing',
);
check(
  legacyContext?.pages[0].text === 'the old flattened text',
  'and that one page carries the whole text',
);

// --- A pack saved today ---------------------------------------------------
const pages: DocumentPage[] = [
  { number: 1, text: 'Spacing means study spread over time.\n\nIt beats massing.' },
  { number: 2, text: 'Retrieval practice means recalling rather than rereading.' },
  { number: 3, text: 'Interleaving mixes problem types within a session.' },
];

await repository.ensureOwner('alice');
await repository.ensureOwner('mallory');

const stored = await repository.save({
  ownerId: 'alice',
  title: 'Learning',
  kind: 'pdf',
  pages,
  sourceHash: 'hash-1',
  pack: {
    model: 'test-model',
    preQuestions: [{ question: 'What makes practice effective?' }],
    flashcards: [{ front: 'What is spacing?', back: 'Study spread over time.', sourcePage: 1 }],
    quizItems: [],
    selfExplanationPrompts: [
      { prompt: 'Explain retrieval practice in your own words.', sourcePage: 2 },
    ],
  },
});

check(stored.selfExplanationPrompts.length === 1, 'a saved pack comes back with its prompts');
check(!!stored.selfExplanationPrompts[0]?.id, 'each prompt carries an id to answer against');
check(stored.preQuestions.length === 1, 'and with its pre-questions');

// The bug this fixes: a reused pack used to arrive with neither.
const reused = await repository.findPackBySource('alice', 'hash-1');
check(reused?.selfExplanationPrompts.length === 1, 'a REUSED pack keeps its prompts');
check(reused?.selfExplanationPrompts[0]?.id === stored.selfExplanationPrompts[0].id, 'with the same ids');
check(reused?.preQuestions.length === 1, 'a reused pack keeps its pre-questions');

// --- Page round trip ------------------------------------------------------
const promptId = stored.selfExplanationPrompts[0].id;
const context = await repository.findExplanation('alice', promptId);
check(context?.pages.length === 3, `pages survive the round trip (got ${context?.pages.length})`);
check(
  JSON.stringify(context?.pages) === JSON.stringify(pages),
  'and come back character-for-character identical, blank lines included',
);
check(context?.sourcePage === 2, 'the prompt keeps the page it was drawn from');

// --- Owner scoping --------------------------------------------------------
const stolen = await repository.findExplanation('mallory', promptId);
check(stolen === null, "another owner cannot fetch someone else's prompt");
const unknown = await repository.findExplanation('alice', 'no-such-id');
check(unknown === null, 'an unknown id is a miss, not a throw');

// --- Questions are scheduled, and attempts are kept ----------------------
// Before this, a question was graded in the browser and the result went
// nowhere: a refresh lost it, and half the pack could never enter the
// schedule.
const withQuiz = await repository.save({
  ownerId: 'alice',
  title: 'Techniques',
  kind: 'pdf',
  pages,
  sourceHash: 'hash-quiz',
  pack: {
    model: 'test-model',
    preQuestions: [],
    flashcards: [],
    selfExplanationPrompts: [],
    quizItems: [
      {
        stem: 'Which retained best?',
        options: ['Massed', 'Distributed', 'Rereading', 'Highlighting'],
        answerIndex: 1,
        rationale: 'Delayed recall was higher.',
        sourcePage: 1,
      },
    ],
  },
});

const quizId = withQuiz.quizItems[0].id;
const dueNow = await repository.dueQuizItems('alice', new Date().toISOString(), 50);
check(dueNow.length === 1, `a new question is due immediately (got ${dueNow.length})`);
check(dueNow[0]?.id === quizId, 'and it is the one just saved');
check(dueNow[0]?.documentTitle === 'Techniques', 'carrying the document it came from');
check(dueNow[0]?.options.length === 4, 'with its options');
check(dueNow[0]?.stability === null, 'and no schedule yet');

const scheduled = await repository.recordQuizAttempt({
  ownerId: 'alice',
  quizItemId: quizId,
  chosenIndex: 1,
  correct: true,
  stability: 3.5,
  difficulty: 5,
  dueAt: '2099-01-01T00:00:00.000Z',
});
check(scheduled, 'an attempt is recorded');

const stillDue = await repository.dueQuizItems('alice', new Date().toISOString(), 50);
check(stillDue.length === 0, 'and the question leaves the queue until it is due again');

const later = await repository.dueQuizItems('alice', '2099-06-01T00:00:00.000Z', 50);
check(later.length === 1, 'coming back when the schedule says so');
check(later[0]?.stability === 3.5, 'with the stability that was stored');

// Owner scoping, the same rule grading a card follows.
const stolen2 = await repository.recordQuizAttempt({
  ownerId: 'mallory',
  quizItemId: quizId,
  chosenIndex: 0,
  correct: false,
  stability: 1,
  difficulty: 1,
  dueAt: '2099-01-01T00:00:00.000Z',
});
check(!stolen2, "another owner cannot answer someone else's question");

const attemptRows = database
  .prepare('SELECT chosen_index, correct FROM quiz_attempt')
  .all() as unknown as { chosen_index: number; correct: number }[];
check(attemptRows.length === 1, `only the legitimate attempt is stored (got ${attemptRows.length})`);
check(attemptRows[0]?.chosen_index === 1, 'the option chosen is kept, not just whether it was right');
check(attemptRows[0]?.correct === 1, 'along with the verdict');

check(
  (await repository.dueQuizItems('mallory', '2099-06-01T00:00:00.000Z', 50)).length === 0,
  "and another owner's queue stays empty",
);

// --- Attempts are append-only --------------------------------------------
const feedback = { covered: [], missed: [], incorrect: [], summary: 'ok' };
await repository.recordExplanationAttempt({ ownerId: 'alice', explanationId: promptId, answer: 'first try', feedback });
await repository.recordExplanationAttempt({ ownerId: 'alice', explanationId: promptId, answer: 'second try', feedback });

const attempts = database
  .prepare('SELECT answer FROM explanation_attempt ORDER BY id')
  .all() as unknown as { answer: string }[];
check(attempts.length === 2, `both attempts are kept (got ${attempts.length})`);
check(attempts[0]?.answer === 'first try', 'the earlier attempt is not overwritten');

provider.close();
rmSync(DIR, { recursive: true, force: true });

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
