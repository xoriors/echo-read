/**
 * The shape feedback on a learner's explanation must arrive in.
 *
 * Three lists rather than a score, because a mark tells someone how they did
 * and this has to tell them what to do next — and because a number invites the
 * self-assessment the whole feature exists to replace.
 *
 * Every point carries a page and a quote for the same reason the pack's items
 * do: the citation is checked against the source before it is shown, and one
 * that cannot be checked is dropped. A schema fixes the shape, never the truth
 * of what is in it.
 *
 * The three lists are spelled out rather than shared through `$ref`, because
 * the provider validates against a subset of JSON Schema and a reference it
 * does not resolve fails the whole call.
 */
const POINTS = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      point: { type: 'string' },
      sourcePage: { type: 'integer' },
      sourceQuote: { type: 'string' },
    },
    required: ['point', 'sourcePage', 'sourceQuote'],
  },
} as const;

export const EXPLANATION_FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    covered: POINTS,
    missed: POINTS,
    incorrect: POINTS,
  },
  required: ['summary', 'covered', 'missed', 'incorrect'],
} as const;
