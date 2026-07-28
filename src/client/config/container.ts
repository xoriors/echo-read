import { AnimationFrameTicker } from '../adapters/outbound/audio/animationFrameTicker';
import { NARRATION_SAMPLE_RATE, WebAudioOutput } from '../adapters/outbound/audio/webAudioOutput';
import { ApiClient } from '../adapters/outbound/http/apiClient';
import { HttpContentGateway } from '../adapters/outbound/http/httpContentGateway';
import { HttpSpeechGateway } from '../adapters/outbound/http/httpSpeechGateway';
import { HttpStudyGateway } from '../adapters/outbound/http/httpStudyGateway';
import { DEFAULT_VOICE, NARRATION_VOICES } from '../../shared/domain/voice';
import { BroadcastStatusChannel } from '../adapters/outbound/status/broadcastStatusChannel';
import { InMemoryLibraryRepository } from '../adapters/outbound/storage/inMemoryLibraryRepository';
import { CardSpeaker } from '../application/cardSpeaker';
import { NarrationPlayer } from '../application/narrationPlayer';
import type { StatusChannel } from '../application/ports/statusChannel';
import { LoadContentUseCase } from '../application/usecases/loadContent';
import { LibraryService } from '../application/usecases/manageLibrary';
import { ManageStudyUseCase } from '../application/usecases/manageStudy';

export interface AppContainer {
  loadContent: LoadContentUseCase;
  study: ManageStudyUseCase;
  /** Speaks one card without disturbing the document being narrated. */
  cardSpeaker: CardSpeaker;
  player: NarrationPlayer;
  library: LibraryService;
  status: StatusChannel;
  voices: readonly string[];
}

/**
 * Composition root for the browser hexagon.
 *
 * The only module that names concrete adapters — everything else depends on
 * ports. Tests build their own container from fakes and get the real use cases.
 */
export function createAppContainer(): AppContainer {
  const status = new BroadcastStatusChannel();
  const api = new ApiClient(status);

  const speech = new HttpSpeechGateway(api);
  // Cards get their own output so stopping one cannot interrupt the other's
  // clock, and so a card never becomes the narrated document.
  const cardAudio = new WebAudioOutput(NARRATION_SAMPLE_RATE);

  const player = new NarrationPlayer({
    speech,
    audio: new WebAudioOutput(NARRATION_SAMPLE_RATE),
    ticker: new AnimationFrameTicker(),
    status,
    defaultVoice: DEFAULT_VOICE,
  });

  return {
    loadContent: new LoadContentUseCase(new HttpContentGateway(api), status),
    study: new ManageStudyUseCase(new HttpStudyGateway(api), status),
    cardSpeaker: new CardSpeaker(speech, cardAudio, status, DEFAULT_VOICE),
    player,
    library: new LibraryService(new InMemoryLibraryRepository()),
    status,
    voices: NARRATION_VOICES,
  };
}
