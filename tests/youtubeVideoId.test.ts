/** Every spelling of a YouTube link must come back as the same id, because the id is what the analysis cache is keyed on. */

import { youtubeVideoId } from '../src/server/domain/youtubeVideoId';
const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) {
    failures.push(label);
  }
};
const ID = 'dQw4w9WgXcQ';

/* Every spelling of the same video agrees */
const spellings = [
  `https://www.youtube.com/watch?v=${ID}`,
  `https://youtube.com/watch?v=${ID}&t=42s`,
  `https://m.youtube.com/watch?feature=share&v=${ID}`,
  `https://music.youtube.com/watch?v=${ID}&list=PL123`,
  `https://youtu.be/${ID}`,
  `https://youtu.be/${ID}?si=abc123`,
  `https://www.youtube.com/shorts/${ID}`,
  `https://www.youtube.com/embed/${ID}`,
  `https://www.youtube.com/live/${ID}`,
  `www.youtube.com/watch?v=${ID}`,
  `  https://YOUTU.BE/${ID}  `,
];
for (const link of spellings) {
  check(youtubeVideoId(link) === ID, `${link.trim()} -> ${ID}`);
}

/* Anything that is not a link to one video is rejected */
const rejected = [
  '',
  'not a url',
  'https://www.youtube.com/',
  'https://www.youtube.com/watch',
  'https://www.youtube.com/watch?v=short',
  `https://www.youtube.com/watch?v=${ID}extra`,
  'https://www.youtube.com/@somechannel',
  `https://vimeo.com/${ID}`,
  `https://notyoutube.com/watch?v=${ID}`,
];
for (const link of rejected) {
  check(youtubeVideoId(link) === null, `rejects ${JSON.stringify(link)}`);
}

console.log(failures.length === 0 ? '\nAll passed' : `\n${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
