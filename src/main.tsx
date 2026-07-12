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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
