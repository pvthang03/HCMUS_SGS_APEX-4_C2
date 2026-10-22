import React from 'react';
import ReactDOM from 'react-dom/client';
import { TideCloakContextProvider } from '@tidecloak/react';
import { App } from './App';
import { SimApp } from './sim/SimApp';

// The adapter (public/tidecloak.json) is exported from TideCloak by scripts/bootstrap-tidecloak.sh.
// useDPoP goes inside the config object (Invariant I-12): every token is bound to a browser key.
async function start() {
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  const health = await fetch('/api/health').then((r) => r.json()).catch(() => null);
  if (health?.mode === 'sim') {
    root.render(<React.StrictMode><SimApp /></React.StrictMode>);
    return;
  }
  const res = await fetch('/tidecloak.json');
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
