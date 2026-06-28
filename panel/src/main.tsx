import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './lib/push';

import './styles/tokens.css';
import './styles/base.css';

const el = document.getElementById('root');
if (!el) throw new Error('No #root in index.html');

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker and subscribe to push notifications.
// This only runs on HTTPS (or localhost for dev) and only after the user
// grants notification permission.
void registerServiceWorker();
