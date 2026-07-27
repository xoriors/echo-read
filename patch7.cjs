const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

const oldHighlight = `  const renderHighlightedText = () => {
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
    if (activeCharIndex < 0) activeCharIndex = 0;

    const tokens = articleText.split(/(\\s+)/);
    let currentCharCount = 0;
    
    return tokens.map((token, i) => {
      const isWord = /\\S/.test(token);
      let isHighlighted = false;
      
      if (isWord) {
        const start = currentCharCount;
        const end = currentCharCount + token.length;
        if (activeCharIndex >= start && activeCharIndex < end) {
          isHighlighted = true;
        }
      }
      
      currentCharCount += token.length;
      
      if (isHighlighted) {
         return (
            <span key={i} className="bg-blue-600/60 text-white rounded-sm px-0.5 transition-colors duration-150">
              {token}
            </span>
         );
      }
      return <span key={i}>{token}</span>;
    });
  };`;

const newHighlight = `  const renderHighlightedText = () => {
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
    if (activeCharIndex < 0) activeCharIndex = 0;

    let currentIndexInText = activeCharIndex;
    // Look backwards for nearest word char if on space
    while (currentIndexInText > 0 && !/\\S/.test(articleText[currentIndexInText])) {
        currentIndexInText--;
    }
    
    let start = currentIndexInText;
    while (start > 0 && /\\S/.test(articleText[start - 1])) {
        start--;
    }
    let end = currentIndexInText;
    while (end < articleText.length && /\\S/.test(articleText[end])) {
        end++;
    }

    const before = articleText.slice(0, start);
    const active = articleText.slice(start, end);
    const after = articleText.slice(end);

    return (
        <>
            {before}
            {active && (
                <span className="bg-blue-600 text-white rounded-sm px-0.5 shadow-sm transition-all duration-75">
                    {active}
                </span>
            )}
            {after}
        </>
    );
  };`;

content = content.replace(oldHighlight, newHighlight);
fs.writeFileSync('App.tsx', content);
