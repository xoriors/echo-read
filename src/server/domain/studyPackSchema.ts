import { BLOOM_LEVELS, OPTIONS_PER_QUIZ_ITEM } from '../../shared/domain/studyPack';

/**
 * The response shape demanded of the model.
 *
 * Asking for JSON against a schema rather than parsing prose is the difference
 * between a deck that occasionally fails to load and one that does not: the
 * batch results are merged and stored without a human reading them, so a
 * malformed shape has nowhere to be noticed.
 *
 * A schema is not a guarantee about *content*, though — the model can satisfy
 * every type here and still cite a page it invented. That is what validation
 * in the use case is for.
 */
export const STUDY_PACK_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    preQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' } },
        required: ['question'],
      },
    },
    flashcards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          front: { type: 'string' },
          back: { type: 'string' },
          sourcePage: { type: 'integer' },
          sourceQuote: { type: 'string' },
        },
        required: ['front', 'back', 'sourcePage', 'sourceQuote'],
      },
    },
    quizItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stem: { type: 'string' },
          options: {
            type: 'array',
            items: { type: 'string' },
            minItems: OPTIONS_PER_QUIZ_ITEM,
            maxItems: OPTIONS_PER_QUIZ_ITEM,
          },
          answerIndex: { type: 'integer' },
          rationale: { type: 'string' },
          bloomLevel: { type: 'string', enum: [...BLOOM_LEVELS] },
          sourcePage: { type: 'integer' },
          sourceQuote: { type: 'string' },
        },
        required: ['stem', 'options', 'answerIndex', 'rationale', 'sourcePage', 'sourceQuote'],
      },
    },
    selfExplanationPrompts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          sourcePage: { type: 'integer' },
        },
        required: ['prompt'],
      },
    },
  },
  required: ['preQuestions', 'flashcards', 'quizItems', 'selfExplanationPrompts'],
} as const;
