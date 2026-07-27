const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

content = content.replace(
  `        if (autoScrollRef.current && articleTextRef.current) {
            const progress = Math.min(newTime / duration, 1);
            const absoluteTop = articleTextRef.current.getBoundingClientRect().top + window.scrollY;
            const textHeight = articleTextRef.current.offsetHeight;
            const targetY = absoluteTop + (textHeight * progress);
            window.scrollTo({ top: targetY - (window.innerHeight / 2) });
        }`,
  `        if (autoScrollRef.current && articleTextRef.current) {
            const chunks = textChunksRef.current || [];
            let charsBefore = 0;
            const currentIndex = currentChunkIndexRef.current;
            for (let i = 0; i < currentIndex; i++) {
                charsBefore += chunks[i]?.length || 0;
            }
            const currentChunkChars = chunks[currentIndex]?.length || 0;
            let totalChunkChars = 0;
            for (let i = 0; i < chunks.length; i++) {
                totalChunkChars += chunks[i]?.length || 0;
            }
            const progressInChunk = duration > 0 ? Math.min(newTime / duration, 1) : 0;
            const activeCharIndexInChunk = Math.floor(progressInChunk * currentChunkChars);
            const overallProgress = totalChunkChars > 0 ? (charsBefore + activeCharIndexInChunk) / totalChunkChars : 0;

            const absoluteTop = articleTextRef.current.getBoundingClientRect().top + window.scrollY;
            const textHeight = articleTextRef.current.offsetHeight;
            const targetY = absoluteTop + (textHeight * overallProgress);
            window.scrollTo({ top: targetY - (window.innerHeight / 2) });
        }`
);

content = content.replace(
  `  const renderHighlightedText = () => {
    if (!articleText) return null;
    if (duration === 0 || !isHighlightingEnabled) {
      return <>{articleText}</>;
    }
    
    const progress = Math.min(currentTime / duration, 1);
    const totalChars = articleText.length;
    let activeCharIndex = Math.min(Math.floor(progress * totalChars), totalChars - 1);
    if (activeCharIndex < 0) activeCharIndex = 0;`,
  `  const renderHighlightedText = () => {
    if (!articleText) return null;
    if (duration === 0 || !isHighlightingEnabled) {
      return <>{articleText}</>;
    }
    
    const chunks = textChunksRef.current || [];
    let charsBefore = 0;
    const currentIndex = currentChunkIndexRef.current;
    for (let i = 0; i < currentIndex; i++) {
        charsBefore += chunks[i]?.length || 0;
    }
    const currentChunkChars = chunks[currentIndex]?.length || 0;
    let totalChunkChars = 0;
    for (let i = 0; i < chunks.length; i++) {
        totalChunkChars += chunks[i]?.length || 0;
    }
    const progressInChunk = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
    const activeCharIndexInChunk = Math.floor(progressInChunk * currentChunkChars);
    const overallProgress = totalChunkChars > 0 ? (charsBefore + activeCharIndexInChunk) / totalChunkChars : 0;

    const totalChars = articleText.length;
    let activeCharIndex = Math.min(Math.floor(overallProgress * totalChars), totalChars - 1);
    if (activeCharIndex < 0) activeCharIndex = 0;`
);

fs.writeFileSync('App.tsx', content);
