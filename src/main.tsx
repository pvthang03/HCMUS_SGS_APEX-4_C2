import React from 'react';
import ReactDOM from 'react-dom/client';
import { TideCloakContextProvider } from '@tidecloak/react';
import { App } from './App';

// The adapter (public/tidecloak.json) is exported from TideCloak by scripts/bootstrap-tidecloak.sh.
// useDPoP goes inside the config object (Invariant I-12): every token is bound to a browser key.
async function start() {
  const res = await fetch('/tidecloak.json');
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  if (!res.ok) {
    root.render(<p style={{ padding: '2rem' }}>Missing public/tidecloak.json. Run the TideCloak bootstrap first (see README).</p>);
    return;
  }
  const tcConfig = await res.json();
  root.render(
    <React.StrictMode>
      <TideCloakContextProvider config={{ ...tcConfig, useDPoP: { mode: 'strict', alg: 'ES256' } }}>
        <App />
      </TideCloakContextProvider>
    </React.StrictMode>
  );
}

start();
