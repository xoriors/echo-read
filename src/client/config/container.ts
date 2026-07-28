import { AnimationFrameTicker } from '../adapters/outbound/audio/animationFrameTicker';
import { NARRATION_SAMPLE_RATE, WebAudioOutput } from '../adapters/outbound/audio/webAudioOutput';
import { ApiClient } from '../adapters/outbound/http/apiClient';
import { HttpContentGateway } from '../adapters/outbound/http/httpContentGateway';
import { HttpSpeechGateway } from '../adapters/outbound/http/httpSpeechGateway';
import { HttpStudyGateway } from '../adapters/outbound/http/httpStudyGateway';
import { DEFAULT_VOICE, NARRATION_VOICES } from '../../shared/domain/voice';
import { BroadcastStatusChannel } from '../adapters/outbound/status/broadcastStatusChannel';
import { InMemoryLibraryRepository } from '../adapters/outbound/storage/inMemoryLibraryRepository';
import { NarrationPlayer } from '../application/narrationPlayer';
import type { StatusChannel } from '../application/ports/statusChannel';
import { LoadContentUseCase } from '../application/usecases/loadContent';
import { LibraryService } from '../application/usecases/manageLibrary';
import { ManageStudyUseCase } from '../application/usecases/manageStudy';

export interface AppContainer {
  loadContent: LoadContentUseCase;
  study: ManageStudyUseCase;
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

  const player = new NarrationPlayer({
    speech: new HttpSpeechGateway(api),
    audio: new WebAudioOutput(NARRATION_SAMPLE_RATE),
    ticker: new AnimationFrameTicker(),
    status,
    defaultVoice: DEFAULT_VOICE,
  });

  return {
    loadContent: new LoadContentUseCase(new HttpContentGateway(api), status),
    study: new ManageStudyUseCase(new HttpStudyGateway(api), status),
    player,
    library: new LibraryService(new InMemoryLibraryRepository()),
    status,
    voices: NARRATION_VOICES,
  };
}
