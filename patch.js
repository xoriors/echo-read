const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');

let newContent = content.replace(
  `const [articleText, setArticleText] = useState<string>('');`,
  `const [articleText, setArticleText] = useState<string>('');
  const [textChunks, setTextChunks] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const audioChunksCache = useRef<Record<number, AudioBuffer>>({});
  const isGeneratingChunkRef = useRef<Record<number, boolean>>({});`
);

newContent = newContent.replace(
  `const generateAndPlayAudio = useCallback(async (text: string, startTime: number) => {`,
  `const generateChunkAudio = async (chunkText: string, index: number, voice: string) => {
    if (audioChunksCache.current[index] || isGeneratingChunkRef.current[index]) return;
    isGeneratingChunkRef.current[index] = true;
    try {
        const base64Audio = await generateSpeech(chunkText, voice);
        const audioData = decode(base64Audio);
        if (!audioContextRef.current) {
             audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const audioBuffer = await decodeAudioData(audioData, audioContextRef.current, 24000, 1);
        audioChunksCache.current[index] = audioBuffer;
    } catch (e) {
        console.error("Failed to generate chunk", index, e);
    } finally {
        isGeneratingChunkRef.current[index] = false;
    }
  };

  const playChunk = useCallback(async (index: number, startTime: number = 0) => {
    if (index >= textChunks.length || index < 0) {
        stopAudio(true);
        return;
    }
    setCurrentChunkIndex(index);
    setStatusMessage(\`Playing part \${index + 1} of \${textChunks.length}...\`);
    
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
    }
    
    // Wait for the chunk to be ready
    setPlaybackState(PlaybackState.Buffering);
    if (!audioChunksCache.current[index]) {
        await generateChunkAudio(textChunks[index], index, selectedVoice);
    }
    
    const audioBuffer = audioChunksCache.current[index];
    if (!audioBuffer) {
        handleError(\`Failed to load audio for part \${index + 1}\`);
        return;
    }
    
    audioBufferRef.current = audioBuffer;
    setDuration(audioBuffer.duration);
    lastVoiceUsedRef.current = selectedVoice;
    
    playAudio(startTime);
    
    // Pre-generate the next chunk in the background
    if (index + 1 < textChunks.length) {
        generateChunkAudio(textChunks[index + 1], index + 1, selectedVoice);
    }
  }, [textChunks, selectedVoice, playAudio, stopAudio, handleError]);

  const generateAndPlayAudio = useCallback(async (text: string, startTime: number) => {`
);

newContent = newContent.replace(
  `const chunkText = (text: string, maxLen = 600) => {
      const chunks = [];
      let current = '';
      const sentences = text.match(/[^.!?\\n]+[.!?\\n]+/g) || [text];
      for (const s of sentences) {
          if (current.length + s.length > maxLen && current.length > 0) {
              chunks.push(current.trim());
              current = s;
          } else {
              current += ' ' + s;
          }
      }
      if (current.trim()) chunks.push(current.trim());
      return chunks;
  };`,
  ""
);

newContent = newContent.replace(
  `  const generateAndPlayAudio = useCallback(async (text: string, startTime: number) => {
    try {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            gainNodeRef.current = audioContextRef.current.createGain();
            gainNodeRef.current.connect(audioContextRef.current.destination);
        }

        const base64Audio = await generateSpeech(text, selectedVoice);
        const audioData = decode(base64Audio);
        const audioBuffer = await decodeAudioData(audioData, audioContextRef.current, 24000, 1);
        
        audioBufferRef.current = audioBuffer;
        setDuration(audioBuffer.duration);
        lastVoiceUsedRef.current = selectedVoice;

        if (startTime >= 0) {
            playAudio(startTime);
        } else {
             // If startTime is negative, it means we just changed voice, don't auto-play
            setPlaybackState(PlaybackState.Paused);
            setCurrentTime(Math.abs(startTime));
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred during audio generation.';
        handleError(message);
    }
  }, [selectedVoice, playAudio, handleError]);`,
  `  const chunkText = (text: string, maxLen = 600) => {
      const chunks = [];
      let current = '';
      const sentences = text.match(/[^.!?\\n]+[.!?\\n]+/g) || [text];
      for (const s of sentences) {
          if (current.length + s.length > maxLen && current.length > 0) {
              chunks.push(current.trim());
              current = s;
          } else {
              current += ' ' + s;
          }
      }
      if (current.trim()) chunks.push(current.trim());
      return chunks;
  };

  const generateAndPlayAudio = useCallback(async (text: string, startTime: number) => {
    try {
        const chunks = chunkText(text);
        setTextChunks(chunks);
        audioChunksCache.current = {};
        isGeneratingChunkRef.current = {};
        
        // Wait a tick for textChunks state to update, or just use the local variable
        setTimeout(() => {
            playChunk(0, Math.max(0, startTime));
        }, 0);
        
    } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred during audio generation.';
        handleError(message);
    }
  }, [playChunk]);`
);


newContent = newContent.replace(
  `        if (newTime >= duration) {
            stopAudio(true);
        } else {`,
  `        if (newTime >= duration) {
            if (currentChunkIndex + 1 < textChunks.length) {
                 playChunk(currentChunkIndex + 1, 0);
            } else {
                 stopAudio(true);
            }
        } else {`
);


newContent = newContent.replace(
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
                        disabled={!canControlPlayback || currentChunkIndex + 1 >= textChunks.length}
                        aria-label="Next Part"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path fillRule="evenodd" d="M16.28 11.47a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06-1.06L14.69 12 7.72 5.03a.75.75 0 0 1 1.06-1.06l7.5 7.5Z" clipRule="evenodd" /></svg>
                    </button>
                </div>
                <div className="text-center text-xs text-gray-400 mt-1">Part {currentChunkIndex + 1} of {textChunks.length || 1}</div>
                <div className="flex items-center space-x-4">`
);

// We need to pass playChunk to useEffect dependencies where generateAndPlayAudio was used
newContent = newContent.replace(
    /generateAndPlayAudio/g,
    "generateAndPlayAudio"
);

fs.writeFileSync('App.tsx', newContent);
