import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './views/App/App.tsx';
import './views/global-styles/index.css';

// @heroui/react's toast queue wraps every update in document.startViewTransition(), which the
// browser rejects with InvalidStateError whenever a toast fires while the tab is hidden (e.g. the
// "Connecté à ThymioSuite" toast firing while another window has focus). The toast still renders —
// only the animation is skipped — so this is harmless, but the rejection is otherwise unhandled
// and spams the console. There's no app-level hook to override the queue's wrapUpdate, so it's
// silenced here instead.
window.addEventListener('unhandledrejection', event => {
  if (
    event.reason instanceof DOMException &&
    event.reason.name === 'InvalidStateError' &&
    /view transition was skipped/i.test(event.reason.message)
  ) {
    event.preventDefault();
  }
});

// @xyflow/react (the decision tree canvas) watches node/pane sizes via ResizeObserver, and the
// step-7 algorithm auto-build fires many rapid, back-to-back layout changes (nodes sliding in,
// fitView adjusting) as it grows the tree. That's exactly the pattern that trips the browser's
// ResizeObserver loop-protection, which reports it as a genuine `error` event on window even
// though nothing actually failed — the observer just gets debounced to the next frame. Harmless,
// but spams the console every time, so it's silenced here the same way as the toast rejection above.
window.addEventListener('error', event => {
  if (event.message === 'ResizeObserver loop completed with undelivered notifications.') {
    event.stopImmediatePropagation();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
