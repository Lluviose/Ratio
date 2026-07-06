import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './longpress-guard.css'
import App from './App.tsx'
import { RootErrorBoundary } from './components/RootErrorBoundary.tsx'
import { storageKernel } from './lib/storageKernel'
import './pwa'

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

// Prevent gesture zooming (pinch-to-zoom)
document.addEventListener('gesturestart', function(e) {
  if (!isTextEditingTarget(e.target) && e.cancelable) e.preventDefault();
});

// Prevent double-tap zooming
let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
  if (!isCoarsePointer || isTextEditingTarget(event.target)) {
    lastTouchEnd = 0;
    return;
  }

  const now = (new Date()).getTime();
  if (now - lastTouchEnd <= 300 && event.cancelable) {
    event.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

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

// 存储内核水合完成（IndexedDB → 内存，含首次迁移）后才挂载 React：
// 组件树里的所有同步读（useLocalStorageState 等）由此保证读到权威数据。
// ready 永不 reject（IDB 不可用时内部回退 localStorage 后照常 resolve）。
void storageKernel.ready.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </StrictMode>,
  )
})
