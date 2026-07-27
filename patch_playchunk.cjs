const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

const oldPlayChunk = `  const playChunk = useCallback(async (index: number, startTime: number = 0) => {
    const chunks = textChunksRef.current;
    if (!chunks || index >= chunks.length || index < 0) {
        stopAudio(true);
        return;
    }
    setCurrentChunkIndex(index);
    currentChunkIndexRef.current = index;
    setStatusMessage(\`Playing part \${index + 1} of \${chunks.length}...\`);
    
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
    }
    
    // Wait for the chunk to be ready
    setPlaybackState(PlaybackState.Buffering);
    if (!audioChunksCache.current[index]) {
        await generateChunkAudio(chunks[index], index, selectedVoice);
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
    if (index + 1 < chunks.length) {
        generateChunkAudio(chunks[index + 1], index + 1, selectedVoice);
    }
  }, [selectedVoice, playAudio, stopAudio, handleError]);`;

const newPlayChunk = `  const playChunk = useCallback(async (index: number, startTime: number = 0, startProgress?: number) => {
    const chunks = textChunksRef.current;
    if (!chunks || index >= chunks.length || index < 0) {
        stopAudio(true);
        return;
    }
    setCurrentChunkIndex(index);
    currentChunkIndexRef.current = index;
    setStatusMessage(\`Playing part \${index + 1} of \${chunks.length}...\`);
    
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
    }
    
    // Wait for the chunk to be ready
    setPlaybackState(PlaybackState.Buffering);
    if (!audioChunksCache.current[index]) {
        await generateChunkAudio(chunks[index], index, selectedVoice);
    }
    
    const audioBuffer = audioChunksCache.current[index];
    if (!audioBuffer) {
        handleError(\`Failed to load audio for part \${index + 1}\`);
        return;
    }
    
    audioBufferRef.current = audioBuffer;
    setDuration(audioBuffer.duration);
    lastVoiceUsedRef.current = selectedVoice;
    
    let calculatedStartTime = startTime;
    if (startProgress !== undefined) {
        calculatedStartTime = startProgress * audioBuffer.duration;
        setCurrentTime(calculatedStartTime);
        pausedTimeRef.current = calculatedStartTime;
    }
    
    playAudio(calculatedStartTime);
    
    // Pre-generate the next chunk in the background
    if (index + 1 < chunks.length) {
        generateChunkAudio(chunks[index + 1], index + 1, selectedVoice);
    }
  }, [selectedVoice, playAudio, stopAudio, handleError]);`;

content = content.replace(oldPlayChunk, newPlayChunk);
fs.writeFileSync('App.tsx', content);
