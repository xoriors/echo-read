const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

content = content.replace(
  `const [textChunks, setTextChunks] = useState<string[]>([]);`,
  `const [textChunks, setTextChunks] = useState<string[]>([]);
  const textChunksRef = useRef<string[]>([]);`
);

content = content.replace(
  `const playChunk = useCallback(async (index: number, startTime: number = 0) => {
    if (!textChunks || index >= textChunks.length || index < 0) {
        stopAudio(true);
        return;
    }
    setCurrentChunkIndex(index);
    setStatusMessage(\`Playing part \${index + 1} of \${textChunks.length}...\`);`,
  `const playChunk = useCallback(async (index: number, startTime: number = 0) => {
    const chunks = textChunksRef.current;
    if (!chunks || index >= chunks.length || index < 0) {
        stopAudio(true);
        return;
    }
    setCurrentChunkIndex(index);
    setStatusMessage(\`Playing part \${index + 1} of \${chunks.length}...\`);`
);

content = content.replace(
  `    if (!audioChunksCache.current[index]) {
        await generateChunkAudio(textChunks[index], index, selectedVoice);
    }`,
  `    if (!audioChunksCache.current[index]) {
        await generateChunkAudio(chunks[index], index, selectedVoice);
    }`
);

content = content.replace(
  `    if (index + 1 < textChunks.length) {
        generateChunkAudio(textChunks[index + 1], index + 1, selectedVoice);
    }
  }, [textChunks, selectedVoice, playAudio, stopAudio, handleError]);`,
  `    if (index + 1 < chunks.length) {
        generateChunkAudio(chunks[index + 1], index + 1, selectedVoice);
    }
  }, [selectedVoice, playAudio, stopAudio, handleError]);`
);

content = content.replace(
  `  const generateAndPlayAudio = useCallback(async (text: string, startTime: number) => {
    try {
        const chunks = chunkText(text);
        setTextChunks(chunks);
        audioChunksCache.current = {};
        isGeneratingChunkRef.current = {};
        
        // Let state update before playing
        setTimeout(() => {
            // Need to pass chunks explicitly if state is slow, but state will be updated next render.
            // Actually, playChunk relies on textChunks state. Since it's async, let's just use the ref or wait.
        }, 0);`,
  `  const generateAndPlayAudio = useCallback(async (text: string, startTime: number) => {
    try {
        const chunks = chunkText(text);
        setTextChunks(chunks);
        textChunksRef.current = chunks;
        audioChunksCache.current = {};
        isGeneratingChunkRef.current = {};
        
        setTimeout(() => {
            playChunk(0, Math.max(0, startTime));
        }, 0);`
);

content = content.replace(
  `        if (newTime >= duration) {
            // Handle next chunk logic here
            stopAudio(true); // Temp, will fix via regex later if needed
        } else {`,
  `        if (newTime >= duration) {
            const chunks = textChunksRef.current;
            if (currentChunkIndex + 1 < chunks.length) {
                 playChunk(currentChunkIndex + 1, 0);
            } else {
                 stopAudio(true);
            }
        } else {`
);

fs.writeFileSync('App.tsx', content);
