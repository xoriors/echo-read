import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './adapters/inbound/react/App';
import { ContainerProvider } from './adapters/inbound/react/ContainerContext';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element to mount to');

createRoot(rootElement).render(
  <React.StrictMode>
    <ContainerProvider>
      <App />
    </ContainerProvider>
  </React.StrictMode>,
);
