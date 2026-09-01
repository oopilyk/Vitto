import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setIdGenerator } from '@vitto/core';
import App from './App';
import './styles.css';

// Give the shared domain the browser's id generator.
setIdGenerator(() => crypto.randomUUID());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
