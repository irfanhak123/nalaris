import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import './styles/tokens.css';
import './styles/base.css';

const el = document.getElementById('root');
if (!el) throw new Error('No #root in index.html');

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
