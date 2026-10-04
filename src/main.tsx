import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { prunePhotos } from './db';
import { captureSignInLink, startCloud } from './lib/cloud';
import './styles.css';

// A sign-in link from the email: take its tokens out of the address first.
captureSignInLink();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Ask the browser not to evict the collection under storage pressure.
navigator.storage?.persist?.().catch(() => {});
// Clean up photos from abandoned add/edit forms.
prunePhotos().catch(() => {});
// Sync wines with the online copy when signed in.
startCloud();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
