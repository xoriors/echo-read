const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

content = content.replace(
  `  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);`,
  `  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const currentChunkIndexRef = useRef(0);`
);

content = content.replace(
  `    setCurrentChunkIndex(index);
    setStatusMessage(\`Playing part \${index + 1} of \${chunks.length}...\`);`,
  `    setCurrentChunkIndex(index);
    currentChunkIndexRef.current = index;
    setStatusMessage(\`Playing part \${index + 1} of \${chunks.length}...\`);`
);

content = content.replace(
  `            if (currentChunkIndex + 1 < chunks.length) {
                 playChunk(currentChunkIndex + 1, 0);`,
  `            if (currentChunkIndexRef.current + 1 < chunks.length) {
                 playChunk(currentChunkIndexRef.current + 1, 0);`
);

content = content.replace(
  `Part {currentChunkIndex + 1} of {textChunks.length || 1}`,
  `Part {currentChunkIndex + 1} of {textChunks?.length || 1}`
);

fs.writeFileSync('App.tsx', content);
