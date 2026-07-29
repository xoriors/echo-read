import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { SourceKind } from '../../../../shared/domain/contentSource';
import { messageOf } from '../../../../shared/domain/errors';
import type { GroundingSource } from '../../../../shared/domain/groundingSource';
import type { ReadMode } from '../../../../shared/domain/readMode';
import type { LoadContentCommand } from '../../../application/usecases/loadContent';
import type { LibraryEntry } from '../../../domain/library';
import type { ScheduledCardResponse, StudyPackResponse } from '../../../../shared/contracts/api';
import type { DocumentPage } from '../../../../shared/domain/page';
import { PlaybackState } from '../../../domain/playback';
import {
  describeForm,
  isSubmittable,
  pdfSelectionOf,
  shareableLink,
  validateContentForm,
  type ContentForm,
} from '../../../domain/contentForm';
import { isLearnMode, readModeFor } from '../../../domain/documentMode';
import { LocalFilePdfSource, RemotePdfSource } from '../../outbound/pdf/browserPdfSources';
import { copyToClipboard, downloadTextFile } from '../../outbound/browser/browserApis';
import { AppHeader } from './components/AppHeader';
import { DocumentPanel } from './components/DocumentPanel';
import { LibraryDrawer } from './components/LibraryDrawer';
import { PlayerControls, type ReadingPreferences } from './components/PlayerControls';
import { SourcePanel } from './components/sources/SourcePanel';
import { StudyPanel } from './components/study/StudyPanel';
import { StatusBanner } from './components/StatusBanner';
import { useContainer } from './ContainerContext';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useContentForm } from './hooks/useContentForm';
import { useLibrary } from './hooks/useLibrary';
import { useNarration } from './hooks/useNarration';
import { useSleepTimer } from './hooks/useSleepTimer';
import { useStatusMessage } from './hooks/useStatusMessage';

const DOWNLOAD_FILE_NAME = 'EchoRead_Document.txt';
const COPIED_FEEDBACK_MS = 2_000;

/** What is currently on screen, once a source has been turned into text. */
interface OpenDocument {
  kind: SourceKind;
  readMode: ReadMode;
  /** Chosen as "Learn" rather than a read mode, so the study panel opens. */
  learning: boolean;
  title: string;
  text: string;
  /** What the study pack cites. One page for sources that have no real pages. */
  pages: DocumentPage[];
  sources: GroundingSource[];
  videoSource: GroundingSource | null;
  url?: string;
  pdfUrl?: string;
  shareLink: string | null;
}

const DEFAULT_PREFERENCES: ReadingPreferences = {
  fontSize: 20,
  autoScroll: false,
  highlight: false,
  tapToSeek: false,
  sleepTimerMinutes: 0,
};

/**
 * The driving adapter: it wires user gestures to use cases and renders the
 * resulting state. Every decision it makes is about presentation — retrieving,
 * chunking, synthesising and remembering all happen behind ports.
 */
export default function App(): React.JSX.Element {
  const { loadContent, player, library: libraryService, study, cardSpeaker, voices } = useContainer();

  const controller = useContentForm();
  const narration = useNarration();
  const library = useLibrary();
  const [status, setStatus] = useStatusMessage();

  const [openDocument, setOpenDocument] = useState<OpenDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isLibraryOpen, setLibraryOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [studyPack, setStudyPack] = useState<StudyPackResponse | null>(null);
  const [isGeneratingPack, setGeneratingPack] = useState(false);
  const [dueCards, setDueCards] = useState<ScheduledCardResponse[]>([]);
  const [preferences, setPreferences] = useState<ReadingPreferences>(DEFAULT_PREFERENCES);

  const textRef = useRef<HTMLParagraphElement>(null);

  const updatePreferences = useCallback((changes: Partial<ReadingPreferences>) => {
    setPreferences((previous) => ({ ...previous, ...changes }));
  }, []);

  const sleepSecondsRemaining = useSleepTimer(preferences.sleepTimerMinutes, () => {
    player.pause();
    updatePreferences({ sleepTimerMinutes: 0 });
  });

  const togglePlay = useCallback(() => {
    if (narration.state === PlaybackState.Playing) player.pause();
    else void player.resume();
  }, [narration.state, player]);

  // Space is the usual play/pause key for a player, but it also types a space
  // and activates a focused button — so it is only claimed when the reader is
  // not typing and has not focused a control.
  useEffect(() => {
    if (!narration.isLoaded) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      togglePlay();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [narration.isLoaded, togglePlay]);

  useAutoScroll({
    enabled: preferences.autoScroll,
    progress: narration.documentProgress,
    textRef,
    onManualScroll: useCallback(() => updatePreferences({ autoScroll: false }), [updatePreferences]),
  });

  const fail = useCallback(
    (message: string) => {
      setError(message);
      setStatus('');
      setIsFetching(false);
    },
    [setStatus],
  );

  const handleSubmit = useCallback(async () => {
    const problem = validateContentForm(controller.form);
    if (problem) {
      fail(problem);
      return;
    }

    setError(null);
    setOpenDocument(null);
    player.reset();
    setIsFetching(true);

    try {
      const loaded = await loadContent.execute(commandFor(controller.form, controller.pdfFile));
      const entry = libraryService.remember({
        kind: controller.form.kind,
        title: describeForm(controller.form),
        url: linkedUrl(controller.form),
        pdfUrl: linkedPdfUrl(controller.form),
        text: loaded.text,
        sources: loaded.sources,
        videoSource: loaded.videoSource,
      });

      setStudyPack(null);
      setOpenDocument({
        kind: entry.kind,
        readMode: readModeFor(controller.form.readMode),
        learning: isLearnMode(controller.form.readMode),
        title: entry.title,
        text: loaded.text,
        pages: loaded.pages,
        sources: loaded.sources,
        videoSource: loaded.videoSource,
        url: entry.url,
        pdfUrl: entry.pdfUrl,
        shareLink: shareableLink(controller.form),
      });

      setIsFetching(false);

      // Learning is not listening: the document is still loaded so the
      // transport works if the reader wants it, but it does not start speaking
      // over someone who asked for flashcards.
      const learning = isLearnMode(controller.form.readMode);
      setStatus(learning ? '' : 'Generating audio...');
      await player.load(loaded.text, { autoplay: !learning });
    } catch (caught) {
      fail(messageOf(caught));
    }
  }, [controller.form, controller.pdfFile, fail, libraryService, loadContent, player, setStatus]);

  const handleOpenEntry = useCallback(
    async (entry: LibraryEntry) => {
      setLibraryOpen(false);
      setError(null);
      setStudyPack(null);
      setOpenDocument({
        kind: entry.kind,
        readMode: 'full',
        // Opening from history resumes reading; Learn is chosen per request.
        learning: false,
        title: entry.title,
        text: entry.text,
        // A library entry keeps its text, not its pages, so citations fall
        // back to the whole document.
        pages: [{ number: 1, text: entry.text }],
        sources: entry.sources,
        videoSource: entry.videoSource,
        url: entry.url,
        pdfUrl: entry.pdfUrl,
        shareLink: entry.url ?? entry.pdfUrl ?? null,
      });

      setStatus('Generating audio...');
      await player.load(entry.text);
    },
    [player, setStatus],
  );

  const handleSaveForLater = useCallback(() => {
    if (!openDocument) return;
    libraryService.saveForLater({
      kind: openDocument.kind,
      title: openDocument.title,
      url: openDocument.url,
      pdfUrl: openDocument.pdfUrl,
      text: openDocument.text,
      sources: openDocument.sources,
      videoSource: openDocument.videoSource,
    });
  }, [openDocument, libraryService]);

  const handleCopyLink = useCallback(async () => {
    if (!openDocument?.shareLink) return;
    if (!(await copyToClipboard(openDocument.shareLink))) return;

    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), COPIED_FEEDBACK_MS);
  }, [openDocument]);

  const handleGeneratePack = useCallback(async () => {
    if (!openDocument) return;

    setError(null);
    setGeneratingPack(true);
    try {
      setStudyPack(await study.generate(openDocument.title, openDocument.kind, openDocument.pages));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setGeneratingPack(false);
    }
  }, [openDocument, study]);

  const refreshDueCards = useCallback(async () => {
    try {
      setDueCards(await study.dueCards());
    } catch {
      // A missing queue is not worth interrupting a reader over; the banner
      // simply stays hidden.
    }
  }, [study]);

  // Spacing only pays off across sessions, so what is due is asked for when
  // the Learning tab opens rather than only after generating something.
  useEffect(() => {
    if (openDocument?.learning) void refreshDueCards();
  }, [openDocument?.learning, refreshDueCards]);

  const handleGrade = useCallback(
    (cardId: string, rating: number) => {
      void study
        .grade(cardId, rating)
        .then(refreshDueCards)
        .catch((caught: unknown) => setError(messageOf(caught)));
    },
    [study, refreshDueCards],
  );

  const canControlPlayback = narration.isLoaded && narration.state !== PlaybackState.Buffering && !isFetching;
  const isBusy = isFetching || narration.state === PlaybackState.Buffering;

  return (
    <div className="bg-gray-900 min-h-screen text-white font-sans flex flex-col items-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-4xl">
        <AppHeader onOpenLibrary={() => setLibraryOpen(true)} />

        <SourcePanel
          controller={controller}
          busy={isFetching}
          canSubmit={isSubmittable(controller.form)}
          onSubmit={handleSubmit}
        />

        <StatusBanner status={status} error={error ?? narration.error} busy={isBusy} />

        {openDocument?.learning && (
          <StudyPanel
            pack={studyPack}
            isGenerating={isGeneratingPack}
            onGenerate={() => void handleGeneratePack()}
            onGrade={handleGrade}
            // Speaks through its own output rather than the narration player,
            // so hearing a card cannot discard the document being read.
            onSpeakCard={(front, back) => void cardSpeaker.speakCard(front, back)}
            onSpeakQuestion={(stem, options) => void cardSpeaker.speakQuestion(stem, options)}
            onSpeakAnswer={(answer, rationale) => void cardSpeaker.speakAnswer(answer, rationale)}
            dueCards={dueCards}
          />
        )}

        {openDocument && !openDocument.learning && (
          <DocumentPanel
            text={openDocument.text}
            sources={openDocument.sources}
            videoSource={openDocument.videoSource}
            kind={openDocument.kind}
            readMode={openDocument.readMode}
            progress={narration.documentProgress}
            highlight={preferences.highlight && narration.durationSeconds > 0}
            tapToSeek={preferences.tapToSeek}
            fontSize={preferences.fontSize}
            shareableLink={openDocument.shareLink}
            linkCopied={linkCopied}
            textRef={textRef}
            onCopyLink={handleCopyLink}
            onSaveForLater={handleSaveForLater}
            onDownload={() => downloadTextFile(DOWNLOAD_FILE_NAME, openDocument.text)}
            onSeekToCharacter={(index) => player.playFromCharacter(index)}
          />
        )}

        {narration.isLoaded && (
          <PlayerControls
            narration={narration}
            voices={voices}
            preferences={preferences}
            sleepSecondsRemaining={sleepSecondsRemaining}
            enabled={canControlPlayback}
            onTogglePlay={togglePlay}
            onStop={() => player.stop()}
            onRewind={() => player.rewind()}
            onNext={() => player.skipToNextChunk()}
            onSeek={(seconds) => player.seekTo(seconds)}
            onVoiceChange={(voice) => void player.setVoice(voice)}
            onSpeedChange={(speed) => player.setSpeed(speed)}
            onPreferencesChange={updatePreferences}
          />
        )}
      </div>

      <LibraryDrawer
        library={library}
        open={isLibraryOpen}
        onClose={() => setLibraryOpen(false)}
        onOpenEntry={(entry) => void handleOpenEntry(entry)}
      />
    </div>
  );
}

/** Maps the validated form onto the command the use case understands. */
function commandFor(form: ContentForm, pdfFile: File | null): LoadContentCommand {
  switch (form.kind) {
    case 'url':
      return { kind: 'url', url: form.url, readMode: readModeFor(form.readMode) };
    case 'video':
      return { kind: 'video', url: form.url };
    case 'text':
      return { kind: 'text', text: form.pastedText, readMode: readModeFor(form.readMode) };
    case 'pdf':
      return {
        kind: 'pdf',
        source: form.pdf.method === 'url' ? new RemotePdfSource(form.pdf.url) : new LocalFilePdfSource(pdfFile!),
        readMode: readModeFor(form.readMode),
        selection: pdfSelectionOf(form.pdf),
      };
  }
}

function linkedUrl(form: ContentForm): string | undefined {
  return form.kind === 'url' || form.kind === 'video' ? form.url : undefined;
}

function linkedPdfUrl(form: ContentForm): string | undefined {
  return form.kind === 'pdf' && form.pdf.method === 'url' ? form.pdf.url : undefined;
}

/**
 * Whether a key event came from somewhere a space belongs — a field, or a
 * control that space would activate. Editable hosts report `isContentEditable`.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName);
}

