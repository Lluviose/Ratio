import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './longpress-guard.css'
import App from './App.tsx'
import './pwa'

// Prevent gesture zooming (pinch-to-zoom)
document.addEventListener('gesturestart', function(e) {
  e.preventDefault();
});

// Prevent double-tap zooming
let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
  const now = (new Date()).getTime();
  if (now - lastTouchEnd <= 300) {
    event.preventDefault();
  }
  lastTouchEnd = now;
}, false);

const isCoarsePointer =
  window.matchMedia?.('(pointer: coarse)').matches ?? navigator.maxTouchPoints > 0;

const isTextEditingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;

  const closest = target.closest('input, textarea, [contenteditable]');
  if (!closest) return false;

  if (closest instanceof HTMLInputElement) {
    const type = (closest.type || 'text').toLowerCase();
    const nonTextTypes = new Set([
      'button',
      'checkbox',
      'color',
      'file',
      'hidden',
      'image',
      'radio',
      'range',
      'reset',
      'submit',
    ]);
    return !closest.disabled && !nonTextTypes.has(type);
  }

  if (closest instanceof HTMLTextAreaElement) return !closest.disabled;

  return (closest as HTMLElement).isContentEditable;
};

if (isCoarsePointer) {
  // Disallow long-press context menus (copy/paste) outside of text inputs.
  document.addEventListener(
    'contextmenu',
    (event: MouseEvent) => {
      if (!isTextEditingTarget(event.target)) event.preventDefault();
    },
    { capture: true },
  );

  // Disallow long-press text selection outside of editable fields.
  document.addEventListener(
    'selectstart',
    (event: Event) => {
      if (!isTextEditingTarget(event.target)) event.preventDefault();
    },
    { capture: true },
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
