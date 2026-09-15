import React from 'react';

const REPO = 'https://github.com/xoriors/echo-read';

/**
 * Which build this is, in the page footer.
 *
 * Exists so "did the latest code deploy?" is answered by looking, not by
 * comparing asset hashes in a terminal. The SHA links to its commit, so the
 * check is: read it here, read `main` on GitHub, see if they match.
 *
 * `-dirty` means the build came from a working tree with uncommitted changes,
 * so the commit it names is not exactly what is running.
 */
export function BuildStamp(): React.JSX.Element {
  const { sha, builtAt } = __BUILD_INFO__;
  const commit = sha.replace(/-dirty$/, '');
  const isCommit = /^[0-9a-f]{7,40}$/.test(commit);
  const when = builtAt.slice(0, 16).replace('T', ' ');

  return (
    <footer className="mt-10 mb-2 text-center text-xs text-muted select-text">
      <span>Build </span>
      {isCommit ? (
        <a
          href={`${REPO}/commit/${commit}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono underline decoration-dotted underline-offset-2 hover:text-fg"
          title={`Open commit ${commit} on GitHub`}
        >
          {sha}
        </a>
      ) : (
        <span className="font-mono">{sha}</span>
      )}
      <span title={builtAt}> · {when} UTC</span>
    </footer>
  );
}
