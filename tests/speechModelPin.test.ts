/**
 * Every part of a document in the same voice.
 *
 * The server falls back between speech models when one is busy, and the same
 * voice name is a different voice on a different model — so an article could
 * change narrator between parts, which a listener notices more than any
 * pause. Each answer now says which model rendered it, the browser sends
 * that back with the next part, and the server leads with it.
 */
import { ApiClient } from '../src/client/adapters/outbound/http/apiClient';
import { HttpSpeechGateway } from '../src/client/adapters/outbound/http/httpSpeechGateway';
import type { StatusChannel } from '../src/client/application/ports/statusChannel';
import type { GeminiClientProvider } from '../src/server/adapters/outbound/gemini/geminiClient';
import { GeminiSpeechSynthesizer } from '../src/server/adapters/outbound/gemini/geminiSpeechSynthesizer';
import type { Logger } from '../src/server/application/ports/logger';
import type { GenerateSpeechRequest } from '../src/shared/contracts/api';
import { RateLimitedError } from '../src/shared/domain/errors';

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const silent: Logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
const AUDIO = { candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA' } }] } }] };

// --- The server leads with the model it is asked for ----------------------------
function synthesizer(busy: ReadonlySet<string>, tried: string[]): GeminiSpeechSynthesizer {
  const clients = {
    get: () => ({
      models: {
        generateContent: async ({ model }: { model: string }) => {
          tried.push(model);
          if (busy.has(model)) throw new RateLimitedError(`${model} is busy`, 503);
          return AUDIO;
        },
      },
    }),
  } as unknown as GeminiClientProvider;

  return new GeminiSpeechSynthesizer(clients, silent, ['tts-a', 'tts-b', 'tts-c']);
}

const none: ReadonlySet<string> = new Set();

let tried: string[] = [];
let spoken = await synthesizer(none, tried).synthesize('First part.', 'Kore');
check(tried.join(',') === 'tts-a', `with no preference the first model serves (tried ${tried})`);
check(spoken.model === 'tts-a', 'and the answer says which model that was');

tried = [];
spoken = await synthesizer(none, tried).synthesize('Second part.', 'Kore', 'tts-b');
check(tried.join(',') === 'tts-b', `a preferred model is tried first (tried ${tried})`);
check(spoken.model === 'tts-b', 'and reported back');

tried = [];
spoken = await synthesizer(none, tried).synthesize('Second part.', 'Kore', 'tts-z');
check(tried.join(',') === 'tts-a', `a model nobody configured is ignored (tried ${tried})`);

tried = [];
spoken = await synthesizer(new Set(['tts-b']), tried).synthesize('Third part.', 'Kore', 'tts-b');
check(
  tried.join(',') === 'tts-b,tts-b,tts-b,tts-a',
  `a busy preferred model is retried, then the rest of the chain follows in order (tried ${tried})`,
);
check(spoken.model === 'tts-a', 'and the answer reports the model that actually served');

// --- The browser sends back the model that rendered the last part ----------------
const bodies: GenerateSpeechRequest[] = [];
let answerModel: string | undefined = 'tts-a';

globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
  bodies.push(JSON.parse(String(init?.body)) as GenerateSpeechRequest);
  return new Response(JSON.stringify({ base64Audio: 'AAAA', ...(answerModel ? { model: answerModel } : {}) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

const status: StatusChannel = { publish: () => {}, subscribe: () => () => {} };
const gateway = new HttpSpeechGateway(new ApiClient(status));

await gateway.synthesize('First part.', 'Kore');
await gateway.synthesize('Second part.', 'Kore');
check(bodies[0].preferredModel === undefined, 'the first request has no model to ask for yet');
check(bodies[1].preferredModel === 'tts-a', 'the second asks for the model that rendered the first');

answerModel = 'tts-b';
await gateway.synthesize('Third part.', 'Kore');
await gateway.synthesize('Fourth part.', 'Puck');
check(bodies[3].preferredModel === 'tts-b', 'a fallback becomes the new preference, and a change of voice keeps it');

answerModel = undefined;
await gateway.synthesize('Fifth part.', 'Puck');
await gateway.synthesize('Sixth part.', 'Puck');
check(bodies[5].preferredModel === 'tts-b', 'an answer without a model leaves the preference alone');
check(
  bodies.map((body) => body.voiceName).join(',') === 'Kore,Kore,Kore,Puck,Puck,Puck',
  'the voice name passes through untouched',
);

console.log(failures.length === 0 ? '\nDONE all passed' : `\nDONE ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
