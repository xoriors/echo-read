const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

content = content.replace(
  `const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState<boolean>(true);`,
  `const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState<boolean>(false);`
);

content = content.replace(
  `const autoScrollRef = useRef<boolean>(true);`,
  `const autoScrollRef = useRef<boolean>(false);`
);

content = content.replace(
  `const [isHighlightingEnabled, setIsHighlightingEnabled] = useState<boolean>(true);`,
  `const [isHighlightingEnabled, setIsHighlightingEnabled] = useState<boolean>(false);`
);

fs.writeFileSync('App.tsx', content);
