const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

content = content.replace(
  `    window.addEventListener('speech-status', handleSpeechStatus);
    return () => window.removeEventListener('speech-status', handleSpeechStatus);
  }, []);`,
  `    window.addEventListener('speech-status', handleSpeechStatus);
    window.addEventListener('app-status', handleSpeechStatus);
    return () => {
        window.removeEventListener('speech-status', handleSpeechStatus);
        window.removeEventListener('app-status', handleSpeechStatus);
    };
  }, []);`
);

fs.writeFileSync('App.tsx', content);
