import { READ_MODES, READ_MODE_LABEL, type ReadMode } from '../../shared/domain/readMode';

/**
 * What the reader wants to do with a source, chosen before it is fetched.
 *
 * The first three are read modes — how much of the document to speak. "Learn"
 * is a fourth choice at the same level, because turning a document into
 * practice is an alternative to listening to it, not a setting applied to
 * listening.
 *
 * It lives here rather than in {@link ReadMode} because that type is a server
 * contract: it selects an editorial prompt. Learning does not select a prompt,
 * it selects a destination, and the server never needs to hear the word.
 */
export const LEARN_MODE = 'learn' as const;

export const DOCUMENT_MODES = [...READ_MODES, LEARN_MODE] as const;

export type DocumentMode = (typeof DOCUMENT_MODES)[number];

export const DOCUMENT_MODE_LABEL: Record<DocumentMode, string> = {
  ...READ_MODE_LABEL,
  [LEARN_MODE]: 'Learn',
};

export function isLearnMode(mode: DocumentMode): boolean {
  return mode === LEARN_MODE;
}

/**
 * How the document should be fetched for a given choice.
 *
 * Learning always takes the full text. A summary would be a poor source for
 * practice — items would test the summary rather than the material, and there
 * would be no page for them to cite.
 */
export function readModeFor(mode: DocumentMode): ReadMode {
  return mode === LEARN_MODE ? 'full' : mode;
}
