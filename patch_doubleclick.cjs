const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

const oldHandleSeekStart = `  const handleSeekStart = () => {
    if (duration > 0) {
        setIsSeeking(true);
    }
  };`;

const newHandleSeekStart = `  const handleSeekStart = () => {
    if (duration > 0) {
        setIsSeeking(true);
    }
  };

  const handleTextDoubleClick = useCallback(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || !articleTextRef.current) return;
      
      const range = selection.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(articleTextRef.current);
      preCaretRange.setEnd(range.startContainer, range.startOffset);
      const clickIndex = preCaretRange.toString().length;
      
      if (clickIndex >= 0 && clickIndex <= articleText.length) {
          const chunks = textChunksRef.current || [];
          let charsBefore = 0;
          let targetChunkIndex = 0;
          let targetCharInChunk = 0;
          
          for (let i = 0; i < chunks.length; i++) {
              const chunkLen = chunks[i].length;
              if (clickIndex < charsBefore + chunkLen || i === chunks.length - 1) {
                  targetChunkIndex = i;
                  targetCharInChunk = clickIndex - charsBefore;
                  break;
              }
              charsBefore += chunkLen;
          }
          
          const startProgress = chunks[targetChunkIndex] && chunks[targetChunkIndex].length > 0 ? targetCharInChunk / chunks[targetChunkIndex].length : 0;
          playChunk(targetChunkIndex, 0, startProgress);
      }
      
      selection.removeAllRanges();
  }, [articleText, playChunk]);`;

content = content.replace(oldHandleSeekStart, newHandleSeekStart);
fs.writeFileSync('App.tsx', content);
