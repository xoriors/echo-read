const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

content = content.replace(
  `<span className="bg-blue-600 text-white rounded-sm px-0.5 shadow-sm transition-all duration-75">`,
  `<span id="active-highlight-word" className="bg-blue-600 text-white rounded-sm px-0.5 shadow-sm transition-all duration-75">`
);

content = content.replace(
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
        }`,
  `        if (autoScrollRef.current) {
            const activeEl = document.getElementById("active-highlight-word");
            if (activeEl) {
                const elRect = activeEl.getBoundingClientRect();
                const targetY = elRect.top + window.scrollY - (window.innerHeight / 2) + (elRect.height / 2);
                window.scrollTo({ top: targetY });
            } else if (articleTextRef.current) {
                // Fallback to proportional if no highlight span (e.g. if highlighting disabled)
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
            }
        }`
);

fs.writeFileSync('App.tsx', content);
