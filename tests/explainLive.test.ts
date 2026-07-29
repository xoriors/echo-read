/**
 * End-to-end, against the real model: does grading an explanation actually
 * distinguish a good answer from a thin one, and is every page it cites real?
 */

const BASE = 'http://127.0.0.1:5205';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

interface Jar {
  cookie: string;
}

async function call(jar: Jar, path: string, body: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jar.cookie ? { Cookie: jar.cookie } : {}) },
    body: JSON.stringify(body),
  });

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) jar.cookie = setCookie.split(';')[0];

  return { status: response.status, json: await response.json() };
}

const PAGES = [
  {
    number: 1,
    text: 'Spaced practice means distributing study across separate sessions rather than concentrating it into one. Holding total study time constant, learners who space their sessions recall substantially more on a delayed test than learners who mass them. The effect is largest when the gap between sessions is long relative to the delay before the test.',
  },
  {
    number: 2,
    text: 'Retrieval practice means attempting to recall material from memory rather than reviewing it. The act of retrieval itself modifies memory, making the retrieved item easier to recall in future. Restudying produces a stronger feeling of knowing but weaker retention, which is why learners who judge their own progress tend to choose restudying over testing.',
  },
  {
    number: 3,
    text: 'Interleaving means mixing problem types within a practice session instead of blocking them by type. Blocked practice feels smoother and produces better performance during the session, but interleaved practice produces better performance on a later test, because it forces learners to select a strategy rather than merely execute one.',
  },
];

// --- Alice generates a pack ------------------------------------------------
const alice: Jar = { cookie: '' };
const pack = await call(alice, '/api/study-pack', {
  title: 'Study techniques',
  kind: 'pdf',
  pages: PAGES,
});

check(pack.status === 200, `pack generated (HTTP ${pack.status}) ${pack.status === 200 ? '' : JSON.stringify(pack.json).slice(0, 200)}`);
const prompts = pack.json?.selfExplanationPrompts ?? [];
check(prompts.length > 0, `the pack carries self-explanation prompts (got ${prompts.length})`);
check(prompts.every((p: any) => typeof p.id === 'string' && p.id.length > 0), 'every prompt carries an id');

const promptId: string = prompts[0]?.id;
console.log(`  prompt: ${prompts[0]?.prompt}`);

// --- A short answer is refused without paying for a model call -------------
const short = await call(alice, '/api/explain-check', { explanationId: promptId, answer: 'dunno' });
check(short.status === 400, `a two-word answer is refused (HTTP ${short.status})`);

// --- A strong answer -------------------------------------------------------
// Built from the page the prompt actually cites, not guessed in advance: the
// prompt is generated fresh each run, and an answer about the wrong page is a
// bad answer no matter how well written. Anything else would test the probe's
// luck rather than the grading.
const promptPage: number = prompts[0]?.sourcePage ?? 1;
const source = PAGES.find((page) => page.number === promptPage) ?? PAGES[0];
console.log(`  answering against page ${source.number}`);

const STRONG = source.text
  .split('. ')
  .map((sentence) => sentence.trim())
  .filter(Boolean)
  .map((sentence) => `In other words, ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`)
  .join('. ');

const THIN = 'It is about studying in a better way, which helps you remember more of it later on when you are tested.';

const strong = await call(alice, '/api/explain-check', { explanationId: promptId, answer: STRONG });
const thin = await call(alice, '/api/explain-check', { explanationId: promptId, answer: THIN });

check(strong.status === 200, `a full answer is graded (HTTP ${strong.status}) ${strong.status === 200 ? '' : JSON.stringify(strong.json).slice(0, 300)}`);
check(thin.status === 200, `a thin answer is graded (HTTP ${thin.status})`);

const s = strong.json?.feedback;
const t = thin.json?.feedback;
console.log(`  strong: covered ${s?.covered?.length} missed ${s?.missed?.length} incorrect ${s?.incorrect?.length} unverified ${strong.json?.unverified}`);
console.log(`          "${s?.summary}"`);
console.log(`  thin:   covered ${t?.covered?.length} missed ${t?.missed?.length} incorrect ${t?.incorrect?.length} unverified ${thin.json?.unverified}`);
console.log(`          "${t?.summary}"`);

check(typeof s?.summary === 'string' && s.summary.length > 0, 'the strong answer gets a summary');
check(s?.summary !== t?.summary, 'the two answers get different feedback, not a stock reply');
check(
  (t?.missed?.length ?? 0) >= (s?.missed?.length ?? 0),
  `the thin answer is told it missed at least as much (${t?.missed?.length} vs ${s?.missed?.length})`,
);
check((s?.covered?.length ?? 0) > 0, 'the strong answer is credited with something');

// --- Every citation that survived is real ----------------------------------
const normalise = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase();
const pageText = new Map(PAGES.map((p) => [p.number, normalise(p.text)]));

let checked = 0;
let bad = 0;
for (const feedback of [s, t]) {
  for (const list of ['covered', 'missed', 'incorrect'] as const) {
    for (const point of feedback?.[list] ?? []) {
      checked++;
      const page = pageText.get(point.sourcePage);
      if (!page || !page.includes(normalise(point.sourceQuote))) {
        bad++;
        console.log(`    [bad citation] p${point.sourcePage}: "${point.sourceQuote}"`);
      }
    }
  }
}
check(checked > 0, `feedback points were produced to check (${checked})`);
check(bad === 0, `every surviving citation quotes the page it names (${bad} bad of ${checked})`);

// --- Mallory cannot grade against Alice's document -------------------------
const mallory: Jar = { cookie: '' };
// A request of her own first, so she has an identity that is simply not Alice's.
await call(mallory, '/api/explain-check', { explanationId: 'warm-up', answer: STRONG });
const stolen = await call(mallory, '/api/explain-check', { explanationId: promptId, answer: STRONG });
check(stolen.status === 400, `another visitor cannot grade against Alice's prompt (HTTP ${stolen.status})`);
check(mallory.cookie !== alice.cookie, 'the two visitors really do hold different identities');

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
