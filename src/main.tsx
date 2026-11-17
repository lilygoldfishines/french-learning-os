import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { lang } from './i18n';
import { handleAuthRedirect, isAuthRedirect } from './sync/auto';
import { keepUpToDate } from './pwaUpdate';

document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';

const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// An email link opened into an already-running tab: reload so it is handled at start-up.
// Registered before the router mounts, so it sees the link before the router redirects the address.
const reloadOnAuthLink = () => { if (isAuthRedirect()) window.location.reload(); };
window.addEventListener('popstate', reloadOnAuthLink); // fires before hashchange, and before the router reacts
window.addEventListener('hashchange', reloadOnAuthLink);

keepUpToDate();

// Opened from a confirmation / password-reset email: let Supabase read the link before the router rewrites it.
if (isAuthRedirect()) handleAuthRedirect().catch(() => {}).finally(render);
else render();
