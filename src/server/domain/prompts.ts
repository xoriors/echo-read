import { isRangedSelection, type PdfSelection } from '../../shared/domain/contentSource';
import { OPTIONS_PER_QUIZ_ITEM } from '../../shared/domain/studyPack';
import type { ReadMode, SummaryMode } from '../../shared/domain/readMode';

/**
 * The editorial rules of EchoRead, expressed as prompts.
 *
 * These are domain knowledge, not infrastructure: they say what a "short
 * summary" or a "clean article" means for this product. The Gemini adapter
 * knows how to send a `Prompt`; it does not know what is in one.
 */

export interface Prompt {
  systemInstruction: string;
  userPrompt: string;
}

/** How much source text we are willing to hand to the model in one call. */
export const MAX_SOURCE_CHARACTERS = 50_000;

/** Sentinel the model is told to emit when it cannot do the job at all. */
export const REFUSAL_SENTINEL = 'ERROR:';

const LONG_SUMMARY_TEMPLATE = `
**Brief Summary:**
[A concise, one-paragraph summary of the content's main point.]

**Key Topics Discussed:**
- **[Topic 1]:** [A brief explanation of the first key topic.]
- **[Topic 2]:** [A brief explanation of the second key topic.]
- **[And so on for major topics...]**

**Key Takeaways:**
- [The most important conclusion or takeaway from the content.]
- [Another significant insight or actionable point.]
- [And so on for key takeaways...]

Return only this structured analysis, without any added commentary.
`;

function clip(text: string): string {
  return text.substring(0, MAX_SOURCE_CHARACTERS);
}

/** Turns scraped page text into something worth listening to. */
export function articlePrompt(articleText: string, readMode: ReadMode): Prompt {
  const source = clip(articleText);

  switch (readMode) {
    case 'short':
      return {
        systemInstruction:
          'You are an expert article summarizer. Your task is to take text extracted from a webpage, summarize it into a single concise paragraph, and return only the summary text.',
        userPrompt: `Please summarize the following text into a concise, single-paragraph summary. Return only the summary text, without any added commentary or conversation.\n\nText:\n${source}`,
      };
    case 'long':
      return {
        systemInstruction:
          'You are an expert article analyst. Your task is to take text extracted from a webpage and generate a structured, in-depth summary in the requested format.',
        userPrompt: `Please create an in-depth summary of the following text extracted from a webpage. The output must strictly follow this format, using Markdown:\n\n${LONG_SUMMARY_TEMPLATE}\n\nText:\n${source}`,
      };
    default:
      return {
        systemInstruction:
          'You are an expert article extractor. Your task is to take raw text from a webpage and return only the clean, main article content suitable for text-to-speech.',
        userPrompt: `Please clean up the following text extracted from a webpage. Extract only the main article content. Exclude all extraneous material like advertisements, navigation menus, sidebars, headers, footers, and comment sections. Return only the clean text of the article suitable for text-to-speech conversion, without any added commentary.\n\nText:\n${source}`,
      };
  }
}

/** Condenses text the user pasted in themselves. */
export function pastedTextPrompt(text: string, readMode: SummaryMode): Prompt {
  if (readMode === 'long') {
    return {
      systemInstruction:
        'You are an expert text analyst. Your task is to take a piece of text, create a structured, in-depth summary in the requested format, and return only that summary.',
      userPrompt: `Please provide an in-depth summary of the following text. The output must strictly follow this format, using Markdown:\n\n${LONG_SUMMARY_TEMPLATE}\n\nText:\n${text}`,
    };
  }

  return {
    systemInstruction:
      'You are an expert text summarizer. Your task is to take a piece of text, create a concise, single-paragraph summary, and return only the summary text.',
    userPrompt: `Please summarize the following text into a single, concise paragraph. Return only the summary text, without any added commentary or conversation.\n\nText:\n${text}`,
  };
}

function selectionClause(selection: PdfSelection): string {
  if (!isRangedSelection(selection) || !selection.start || !selection.end) return '';
  const unit = selection.mode === 'pages' ? 'pages' : 'chapters';
  return ` from ${unit} ${selection.start} to ${selection.end}`;
}

/** Reads an attached PDF, honouring the page/chapter range the user picked. */
export function pdfPrompt(readMode: ReadMode, selection: PdfSelection): Prompt {
  const scope = selectionClause(selection);
  const refusalRule = ` If you cannot process the PDF for any reason, respond with the single phrase: '${REFUSAL_SENTINEL} Unable to process PDF.'`;

  switch (readMode) {
    case 'short':
      return {
        systemInstruction: `You are an expert document summarizer. Your task is to take a PDF, summarize it concisely into a single paragraph${scope}, and return only the summary text.${refusalRule}`,
        userPrompt: `Please provide a concise, single-paragraph summary of the attached PDF document${scope}. Return only the summary text, without any added commentary or conversation.`,
      };
    case 'long':
      return {
        systemInstruction: `You are an expert document analyst. Your task is to take a PDF, create a structured, in-depth summary in the requested format${scope}, and return only that summary.${refusalRule}`,
        userPrompt: `Please create an in-depth summary of the attached PDF document${scope}. The output must strictly follow this format, using Markdown:\n\n${LONG_SUMMARY_TEMPLATE}`,
      };
    default:
      return {
        systemInstruction: `You are an expert text extractor. Your task is to take a PDF and return only its text content${scope}, clean and ready for text-to-speech.${refusalRule}`,
        userPrompt: `Please extract all the text content${scope} from the attached PDF document. Return only the clean text, formatted for readability, without any added commentary or conversation.`,
      };
  }
}

/**
 * Asks the model to research a video via web search. The strict output shape
 * is what {@link parseVideoAnalysis} relies on.
 */
export function videoAnalysisPrompt(url: string): Prompt {
  return {
    systemInstruction: `You are an expert video analyst. Your task is to take a YouTube URL, use Google Search to find its content, and analyze it. You must return the video's title, its URL, and the analysis in the exact format requested. If you cannot find information about this specific video (e.g. it is private, deleted, or search yields no specific results), respond with the single phrase: "${REFUSAL_SENTINEL} Unable to analyze content."`,
    userPrompt: `I need you to analyze a specific YouTube video.\nURL: "${url}"\n\nStep 1: Use Google Search to find the specific video at this URL. Search for the URL directly.\nStep 2: Verify that the information found matches this specific video URL (e.g. check the video ID if visible in snippets, or the exact title). Do not hallucinate details for a random video.\nStep 3: Perform a comprehensive analysis of the video's content based *only* on the gathered information (descriptions, summaries, transcripts found on the web).\n\nYour output must strictly follow this format, including the "---" separator:\nVIDEO_TITLE: [The exact, full title of the video found]\nVIDEO_URL: ${url}\n---\n**Summary:**\n[A concise summary of the video's main points (3-4 sentences).]\n\n**Key Topics:**\n- **[Topic 1]:** [Brief explanation of the first key topic discussed.]\n- **[Topic 2]:** [Brief explanation of the second key topic discussed.]\n- **[Topic 3]:** [Brief explanation of the third key topic discussed.]\n\n**Key Takeaways:**\n- [Actionable insight or key takeaway 1.]\n- [Actionable insight or key takeaway 2.]\n- [Actionable insight or key takeaway 3.]\n`,
  };
}

export function isRefusal(text: string): boolean {
  return text.trim().startsWith(REFUSAL_SENTINEL);
}

/**
 * Asks for a study pack over one batch of pages.
 *
 * Three things here are deliberate, and all three come from the evidence this
 * feature is built on.
 *
 * Pre-questions come *before* the content, because prequestioning works by
 * directing attention during reading rather than testing after it.
 *
 * The instruction is to produce retrieval items, never a summary. Summarising
 * is rated low-utility; practice testing is one of only two techniques rated
 * high, so a pack that drifts into prose has failed at its purpose.
 *
 * Distractors get the most specific instruction in the prompt because they are
 * the measured weak point: across the AI-MCQ studies, distractor efficiency is
 * consistently where generated items fall short of human-written ones. Asking
 * for three, requiring each to be defensibly wrong, and requiring the model to
 * check each against the source is aimed squarely at that.
 *
 * `sourcePage` must be a real page from this batch and `sourceQuote` must be
 * copied verbatim, because the caller verifies the quote occurs on the cited
 * page and discards the item when it does not.
 */
export function studyPackPrompt(
  batchText: string,
  { firstPage, lastPage, itemCount }: { firstPage: number; lastPage: number; itemCount: number },
): Prompt {
  const pageRange =
    firstPage === lastPage ? `page ${firstPage}` : `pages ${firstPage} to ${lastPage}`;

  return {
    systemInstruction: [
      'You write study material that makes a learner recall, not reread.',
      'You never summarise: every item you produce must require the learner to retrieve something.',
      'You ground every item in the supplied text and cite the page it came from.',
      'You never invent a page number or a quotation.',
    ].join(' '),
    userPrompt: `The text below is ${pageRange} of a document. Each page begins with a
marker like [Page 7]; everything after a marker belongs to that page, until the
next marker. Use those markers to decide which page a quotation came from.

Produce study material as JSON matching the supplied schema.

Requirements:
- ${itemCount} flashcards. Front asks something specific; back answers it in one or two sentences.
- ${Math.max(1, Math.round(itemCount / 2))} multiple-choice questions, each with exactly ${OPTIONS_PER_QUIZ_ITEM} options.
  * Exactly one option is correct.
  * The other ${OPTIONS_PER_QUIZ_ITEM - 1} must be plausible to someone who has not read carefully, yet
    unambiguously wrong to someone who has. Before emitting each wrong option,
    check it against the text and confirm the text contradicts it or does not
    support it. Do not use "all of the above", "none of the above", joke
    options, or options that are obviously absurd.
  * Give the rationale for the correct answer.
  * Tag each with a Bloom level: recall, understand, apply, or analyse. Do not
    make every item recall.
- 2 to 3 pre-questions: what a reader should be looking for in this passage,
  asked before they read it.
- 1 self-explanation prompt asking the learner to explain a key idea in their
  own words.

For every flashcard, question and self-explanation prompt:
- "sourcePage" must be a page number between ${firstPage} and ${lastPage}.
- "sourceQuote" must be copied word for word from the text below, from that
  page, short enough to locate the claim (roughly 5 to 20 words).

Text:
${batchText}`,
  };
}

/**
 * Grades a learner's own-words explanation against the passage it came from.
 *
 * The model marks rather than the learner because the finding this feature is
 * built on is that people judge their own understanding badly — the illusion of
 * competence is strongest exactly after reading something fluent. Handing back
 * a reference answer and asking "how did you do?" gives the judgement to the
 * faculty least able to make it.
 *
 * What separates useful feedback from flattery is the instruction to name what
 * is *missing*. A model shown an answer and asked to comment will agree with
 * it; being told that omissions are the point, and that the source decides what
 * counts as one, is what makes the reply worth reading.
 *
 * Citations follow the pack's rule — real page, verbatim quote — because the
 * caller checks each one and discards the points it cannot verify.
 */
export function explanationFeedbackPrompt(
  prompt: string,
  answer: string,
  sourceText: string,
  { firstPage, lastPage }: { firstPage: number; lastPage: number },
): Prompt {
  const pageRange =
    firstPage === lastPage ? `page ${firstPage}` : `pages ${firstPage} to ${lastPage}`;

  return {
    systemInstruction: [
      'You give a learner feedback on an explanation they wrote in their own words.',
      'You judge only against the supplied source, never against what you happen to know.',
      'You are candid about what is missing: agreeing with a weak answer teaches nothing.',
      'You never invent a page number or a quotation.',
    ].join(' '),
    userPrompt: `The text below is ${pageRange} of a document a learner has been
studying. Each page begins with a marker like [Page 7]; everything after a
marker belongs to that page, until the next marker.

They were asked:
${prompt}

They wrote:
${answer}

Return JSON matching the supplied schema.

- "covered": what they got right, each stated in the source's own terms.
- "missed": what the source treats as central to this question and their answer
  left out. This is the most useful part of the reply — do not pad it, and do
  not leave it empty just to be encouraging.
- "incorrect": claims the source contradicts. Leave this empty if there are
  none. A difference of wording or emphasis is not an error, and neither is a
  claim the source simply does not address — if the source does not settle it,
  say so in the summary instead of marking it wrong.
- "summary": one or two sentences, addressed to the learner, saying where their
  explanation stands and what to look at next.

For every point in every list:
- "sourcePage" must be a page number between ${firstPage} and ${lastPage}.
- "sourceQuote" must be copied word for word from the text below, from that
  page, short enough to locate the claim (roughly 5 to 20 words).

Text:
${sourceText}`,
  };
}
