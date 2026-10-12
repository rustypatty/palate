import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { SharedPage } from './SharedPage';

// The shared list (loved/index.html): its own small page, without the app, its storage or its offline worker.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SharedPage />
  </StrictMode>,
);
