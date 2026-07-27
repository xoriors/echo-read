const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

content = content.replace(
  '<p ref={articleTextRef} className="text-gray-300 leading-relaxed whitespace-pre-wrap transition-all duration-200" style={{ fontSize: `${fontSize}px` }}>',
  '<p ref={articleTextRef} onDoubleClick={handleTextDoubleClick} title="Double-click anywhere in the text to play from that position" className="text-gray-300 leading-relaxed whitespace-pre-wrap transition-all duration-200" style={{ fontSize: `${fontSize}px` }}>'
);

content = content.replace(
  '<div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 scroll-smooth">',
  '<div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 scroll-smooth">\n          {articleText && (\n              <div className="mb-4 text-sm text-gray-500 italic text-center select-none">\n                  Double-click anywhere in the text to play audio from that position.\n              </div>\n          )}'
);

fs.writeFileSync('App.tsx', content);
