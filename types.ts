
export enum PlaybackState {
  Idle = 'IDLE',
  Buffering = 'BUFFERING',
  Playing = 'PLAYING',
  Paused = 'PAUSED',
  Error = 'ERROR',
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface PdfSelection {
  mode: 'all' | 'pages' | 'chapters';
  start?: number;
  end?: number;
}
