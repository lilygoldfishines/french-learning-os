import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { lang } from './i18n';
import { handleAuthRedirect, isAuthRedirect } from './sync/auto';

document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';

const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// Opened from a confirmation / password-reset email: let Supabase read the link before the router rewrites it.
if (isAuthRedirect()) handleAuthRedirect().catch(() => {}).finally(render);
else render();
