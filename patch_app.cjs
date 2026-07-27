const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

content = content.replace(
  `const chunkText = (text: string, maxLen = 600) => {`,
  `const chunkText = (text: string, maxLen = 2500) => {`
);

fs.writeFileSync('App.tsx', content);
