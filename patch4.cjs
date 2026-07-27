const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

content = content.replace(
  `                    <button onClick={() => stopAudio(true)} className="text-gray-300 hover:text-white transition-transform transform hover:scale-110 disabled:text-gray-600" disabled={!canControlPlayback}>
                        <StopIcon />
                    </button>
                </div>
                <div className="flex items-center space-x-4">`,
  `                    <button onClick={() => stopAudio(true)} className="text-gray-300 hover:text-white transition-transform transform hover:scale-110 disabled:text-gray-600" disabled={!canControlPlayback}>
                        <StopIcon />
                    </button>
                    <button 
                        onClick={() => playChunk(currentChunkIndex + 1, 0)} 
                        className="text-gray-300 hover:text-white transition-transform transform hover:scale-110 disabled:text-gray-600 ml-2" 
                        disabled={!canControlPlayback || currentChunkIndex + 1 >= (textChunks?.length || 1)}
                        aria-label="Next Part"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path fillRule="evenodd" d="M16.28 11.47a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06-1.06L14.69 12 7.72 5.03a.75.75 0 0 1 1.06-1.06l7.5 7.5Z" clipRule="evenodd" /></svg>
                    </button>
                </div>
                {textChunks && textChunks.length > 1 && (
                    <div className="text-center text-xs text-gray-400 mt-1 mb-2">Part {currentChunkIndex + 1} of {textChunks.length}</div>
                )}
                <div className="flex items-center space-x-4">`
);

fs.writeFileSync('App.tsx', content);
