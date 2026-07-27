import React, { type RefObject } from 'react';

import type { SourceKind } from '../../../../../shared/domain/contentSource';
import type { GroundingSource } from '../../../../../shared/domain/groundingSource';
import type { ReadMode } from '../../../../../shared/domain/readMode';
import { ToolbarButton } from './controls';
import { HighlightedText } from './HighlightedText';
import { BookmarkIcon, DownloadIcon, LinkIcon } from './icons';

interface DocumentPanelProps {
  text: string;
  sources: GroundingSource[];
  videoSource: GroundingSource | null;
  kind: SourceKind;
  readMode: ReadMode;
  progress: number;
  highlight: boolean;
  fontSize: number;
  shareableLink: string | null;
  linkCopied: boolean;
  textRef: RefObject<HTMLParagraphElement | null>;
  onCopyLink: () => void;
  onSaveForLater: () => void;
  onDownload: () => void;
  onSeekToCharacter: (characterIndex: number) => void;
}

export function DocumentPanel({
  text,
  sources,
  videoSource,
  kind,
  readMode,
  progress,
  highlight,
  fontSize,
  shareableLink,
  linkCopied,
  textRef,
  onCopyLink,
  onSaveForLater,
  onDownload,
  onSeekToCharacter,
}: DocumentPanelProps): React.JSX.Element {
  return (
    <div className="bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-2xl mb-8">
      {videoSource && (
        <div className="mb-6 p-4 bg-gray-700/50 rounded-lg border border-gray-600">
          <h3 className="text-xl font-semibold text-gray-200 mb-1">Analyzing Video:</h3>
          <SourceLink source={videoSource} className="break-all" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 border-b border-gray-700 pb-2 gap-4">
        <h2 className="text-3xl font-bold text-gray-100 break-words">{documentTitle(kind, readMode)}</h2>
        <div className="flex flex-wrap gap-2 mt-1 sm:mt-0">
          {shareableLink && (
            <ToolbarButton onClick={onCopyLink} title="Copy Link/Path" active={linkCopied}>
              <LinkIcon />
              <span>{linkCopied ? 'Copied!' : 'Copy Link'}</span>
            </ToolbarButton>
          )}
          <ToolbarButton onClick={onSaveForLater} title="Save to Read Later">
            <BookmarkIcon />
            <span className="hidden sm:inline">Read Later</span>
          </ToolbarButton>
          <ToolbarButton onClick={onDownload} title="Download as Text File">
            <DownloadIcon />
            <span>Download Text</span>
          </ToolbarButton>
        </div>
      </div>

      <HighlightedText
        ref={textRef}
        text={text}
        progress={progress}
        highlight={highlight}
        fontSize={fontSize}
        onSeekToCharacter={onSeekToCharacter}
      />

      {sources.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xl font-semibold text-gray-200 mb-2">Sources:</h3>
          <ul className="list-disc list-inside space-y-1">
            {sources.map((source) => (
              <li key={source.uri} className="text-lg">
                <SourceLink source={source} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SourceLink({ source, className = '' }: { source: GroundingSource; className?: string }): React.JSX.Element {
  return (
    <a
      href={source.uri}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-blue-400 hover:text-blue-300 hover:underline transition ${className}`}
    >
      {source.title || source.uri}
    </a>
  );
}

function documentTitle(kind: SourceKind, readMode: ReadMode): string {
  if (kind === 'video') return 'Video Analysis';

  const prefix = kind === 'pdf' ? 'PDF ' : '';
  if (readMode === 'short') return `${prefix}Summary`;
  if (readMode === 'long') return `${prefix}In-Depth Summary`;
  return kind === 'pdf' ? 'PDF Content' : 'Article';
}
