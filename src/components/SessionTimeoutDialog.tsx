import { useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSessionTimeout } from '../hooks/useSessionTimeout';
import { useT } from '../i18n/LanguageContext';

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// The courtesy before a timed sign-out. One minute before the idle limit: a dialog that asks whether the person is still there.
// Five minutes before the hard end of the session: a small banner that says it is ending (it cannot be extended; they must sign
// in again). The server enforces both limits whether or not this is shown (server/lib/sessionPolicy.js).
export default function SessionTimeoutDialog() {
  const { user, session, logout, extendSession } = useAuth();
  const { t } = useT();
  const { warning, stayActive } = useSessionTimeout({
    enabled: !!user && !!session,
    idleMs: session?.idleTimeoutMs ?? 0,
    expiresAt: session?.expiresAt ?? null,
    onIdleTimeout: () => logout('idle'),
    onExpired: () => logout('expired'),
    onKeepAlive: () => { void extendSession(); },
  });

  const stayRef = useRef<HTMLButtonElement>(null);
  const idle = warning?.kind === 'idle';
  useEffect(() => { if (idle) stayRef.current?.focus(); }, [idle]);

  // Escape means "I'm still here", the safe reading of an accidental key press
  useEffect(() => {
    if (!idle) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stayActive(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idle, stayActive]);

  if (!user || !warning) return null;

  if (warning.kind === 'ending') {
    return (
      <div role="status" className="fixed bottom-4 left-4 z-9998 max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-lg">
        <p>{t('session.endingBody', { time: mmss(warning.secondsLeft) })}</p>
        <button type="button" onClick={() => logout()} className="mt-2 font-semibold text-amber-900 underline underline-offset-2">
          {t('session.signOut')}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-9998 flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-idle-title"
        aria-describedby="session-idle-body"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100"><Clock className="h-5 w-5 text-amber-700" aria-hidden="true" /></span>
          <h2 id="session-idle-title" className="text-lg font-bold text-gray-900">{t('session.idleTitle')}</h2>
        </div>
        <p id="session-idle-body" className="mb-5 text-sm text-gray-600">{t('session.idleBody', { time: mmss(warning.secondsLeft) })}</p>
        <div className="flex gap-3">
          <button ref={stayRef} type="button" onClick={stayActive} className="flex-1 rounded-lg bg-[#0d1b4b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#152258]">
            {t('session.stay')}
          </button>
          <button type="button" onClick={() => logout()} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {t('session.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}
