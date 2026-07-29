import { rmSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../src/server/adapters/outbound/sqlite/migrations';

const PATH = path.join(process.cwd(), '.test-data-migrations.db');
rmSync(PATH, { force: true });

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

// A database that already has migration 1, to prove 2 lands on top of real data
// rather than only on an empty file.
const first = new DatabaseSync(PATH);
first.exec('PRAGMA foreign_keys = ON');
const one = migrate(first);
check(one.applied.join(',') === '1,2', `first run applies 1 and 2 (applied ${one.applied})`);

first.prepare("INSERT INTO owner (id) VALUES ('o1')").run();
first
  .prepare(
    `INSERT INTO document (id, owner_id, title, kind, page_count, source_hash, text, page_index)
     VALUES ('d1','o1','T','pdf',2,'h','page one text\n\npage two text','[{"number":1,"start":0,"end":13},{"number":2,"start":15,"end":28}]')`,
  )
  .run();
first.prepare("INSERT INTO study_pack (id, document_id, owner_id, model) VALUES ('p1','d1','o1','m')").run();
first
  .prepare(
    "INSERT INTO self_explanation (id, study_pack_id, owner_id, prompt, source_page) VALUES ('e1','p1','o1','Explain it',2)",
  )
  .run();
first
  .prepare(
    "INSERT INTO explanation_attempt (self_explanation_id, owner_id, answer, feedback) VALUES ('e1','o1','my answer','{}')",
  )
  .run();
first.close();

const second = new DatabaseSync(PATH);
second.exec('PRAGMA foreign_keys = ON');
const two = migrate(second);
check(two.applied.length === 0, `second run applies nothing (applied ${JSON.stringify(two.applied)})`);
check(two.skipped.join(',') === '1,2', `both migrations stay recorded (skipped ${two.skipped})`);

const ledger = second.prepare('SELECT id, name FROM schema_migration ORDER BY id').all() as {
  id: number;
  name: string;
}[];
check(ledger.length === 2, `ledger holds exactly two rows (got ${ledger.length})`);
check(ledger[0]?.name === 'study_foundation', 'migration 1 keeps its recorded name');
check(ledger[1]?.name === 'self_explanation', 'migration 2 is recorded');

const kept = second.prepare("SELECT answer FROM explanation_attempt WHERE self_explanation_id = 'e1'").all();
check(kept.length === 1, 'data written between runs survives the second migrate');

// Cascade: deleting the pack must take its prompts and their attempts.
second.prepare("DELETE FROM study_pack WHERE id = 'p1'").run();
const orphanPrompts = second.prepare('SELECT id FROM self_explanation').all();
const orphanAttempts = second.prepare('SELECT id FROM explanation_attempt').all();
check(orphanPrompts.length === 0, 'deleting a pack removes its explanation prompts');
check(orphanAttempts.length === 0, 'and their attempts, rather than orphaning them');

second.close();
rmSync(PATH, { force: true });

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
