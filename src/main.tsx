import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Tier 1 Google Maps Platform quota & auth monitor
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};
const _origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  _origConsoleError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

function showFatalOverlay(title: string, detail: string) {
  if (document.getElementById('aim-runtime-recovery')) return;
  const box = document.createElement('div');
  box.id = 'aim-runtime-recovery';
  box.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:#0b1322;color:#f1f5f9;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;';

  const card = document.createElement('div');
  card.style.cssText =
    'max-width:420px;background:#0f172a;border:1px solid rgba(251,191,36,0.45);border-radius:16px;padding:20px;text-align:center;';

  const h = document.createElement('div');
  h.style.cssText =
    'font-size:12px;font-weight:800;letter-spacing:0.08em;color:#fcd34d;text-transform:uppercase;margin-bottom:8px;';
  h.textContent = title;

  const p = document.createElement('div');
  p.style.cssText =
    'font-size:12px;color:#cbd5e1;font-family:monospace;word-break:break-word;margin-bottom:14px;';
  p.textContent = detail;

  const btn = document.createElement('button');
  btn.textContent = 'Reload Match';
  btn.style.cssText =
    'padding:8px 16px;border-radius:8px;border:none;background:#22d3ee;color:#020617;font-weight:800;font-size:12px;cursor:pointer;';
  btn.onclick = () => window.location.reload();

  card.append(h, p, btn);
  box.appendChild(card);
  document.body.appendChild(box);
}

window.addEventListener('error', (event) => {
  if (event?.message && !event.message.includes('ResizeObserver') && !event.message.includes('WebSocket')) {
    showFatalOverlay('Runtime Error Detected', event.message);
  }
});

const rootEl = document.getElementById('root');
if (rootEl) {
  try {
    createRoot(rootEl).render(<App />);
  } catch (err) {
    showFatalOverlay(
      'Application Mount Error',
      err instanceof Error ? err.message : 'Unable to mount AIM Volleyball'
    );
  }
}
