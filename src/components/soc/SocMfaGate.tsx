import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { ShieldCheck, KeyRound, Copy, Download, Lock, Loader2, Smartphone, AlertTriangle } from 'lucide-react';
import { api, setSocToken } from '../../api';

type Status = { required: boolean; enrolled: boolean; verified: boolean; lockedUntil: string | null; ttlMinutes: number; recoveryCodesLeft: number };

const card = 'w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl';
const inputCls = 'w-full px-3.5 py-2.5 bg-gray-950 border border-gray-700 rounded-xl text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500';
const btnCls = 'w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2';

function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-[60vh] flex items-center justify-center"><div className={card}>{children}</div></div>;
}

// Gates the whole SOC behind the owner's authenticator app. First visit: enrol (password, add the key to an authenticator
// app, confirm a code, save recovery codes). After that: enter a 6-digit code (or a recovery code) to open the SOC for a
// short window; when the window ends — or the server says the step-up expired — the code is asked for again.
export default function SocMfaGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  // enrolment
  const [password, setPassword] = useState('');
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  // verification
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [copied, setCopied] = useState('');
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try { setStatus(await api.socAuth.status()); setError(''); }
    catch (e: any) { setError(e.message || 'Could not check two-factor status'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // The server refused a SOC call because the step-up is missing/expired: go back to the code prompt.
  useEffect(() => {
    const onMfa = () => { setSocToken(null); setExpiresAt(null); setCode(''); void refresh(); };
    window.addEventListener('soc:mfa', onMfa);
    return () => window.removeEventListener('soc:mfa', onMfa);
  }, [refresh]);

  const armExpiry = useCallback((iso: string) => {
    const at = new Date(iso).getTime();
    setExpiresAt(at);
    if (expiryTimer.current) clearTimeout(expiryTimer.current);
    expiryTimer.current = setTimeout(() => { setSocToken(null); setExpiresAt(null); setCode(''); void refresh(); }, Math.max(1000, at - Date.now()));
  }, [refresh]);
  useEffect(() => () => { if (expiryTimer.current) clearTimeout(expiryTimer.current); }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e: any) { setError(e.message || 'Something went wrong'); }
    setBusy(false);
  };

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard unavailable */ }
  };

  if (!status) {
    return error
      ? <Shell><p className="text-sm text-red-400">{error}</p><button type="button" onClick={refresh} className={`${btnCls} mt-4`}>Retry</button></Shell>
      : <Shell><div className="flex justify-center py-6"><Loader2 className="w-6 h-6 text-purple-400 animate-spin" /></div></Shell>;
  }

  // ── open: requirement off, or already verified ────────────────────────────
  if (!status.required || (status.verified && !recoveryCodes)) {
    const minsLeft = expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 60000)) : null;
    return (
      <>
        {status.required && (
          <div className="mb-4 flex items-center justify-between text-xs text-gray-400 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-green-400" /> Two-factor verified{minsLeft !== null ? ` · locks again in about ${minsLeft} min` : ''}</span>
            <button type="button" className="flex items-center gap-1 font-semibold text-gray-300 hover:text-white"
              onClick={() => run(async () => { await api.socAuth.logout(); setSocToken(null); setExpiresAt(null); await refresh(); })}>
              <Lock className="w-3 h-3" /> Lock SOC now
            </button>
          </div>
        )}
        {children}
      </>
    );
  }

  // ── just enrolled: show the recovery codes exactly once ───────────────────
  if (recoveryCodes) {
    const text = recoveryCodes.join('\n');
    return (
      <Shell>
        <div className="flex items-center gap-2 mb-3"><ShieldCheck className="w-5 h-5 text-green-400" /><h2 className="text-base font-bold text-gray-100">Two-factor is on</h2></div>
        <p className="text-xs text-gray-400 mb-3">Save these recovery codes somewhere safe and offline (a password manager or a printout). Each works <b>once</b> if you lose your phone. They are <b>never shown again</b>.</p>
        <div className="grid grid-cols-2 gap-2 mb-3 font-mono text-sm text-gray-100">
          {recoveryCodes.map(c => <span key={c} className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1.5 text-center">{c}</span>)}
        </div>
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => copy(text, 'codes')} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2"><Copy className="w-3.5 h-3.5" />{copied === 'codes' ? 'Copied' : 'Copy'}</button>
          <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(`Gradzest SOC recovery codes\n\n${text}\n`)}`} download="gradzest-soc-recovery-codes.txt"
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2"><Download className="w-3.5 h-3.5" /> Download</a>
        </div>
        <label className="flex items-start gap-2 text-xs text-gray-300 mb-4"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} className="mt-0.5" /> I have saved these codes</label>
        <button type="button" disabled={!saved} onClick={() => { setRecoveryCodes(null); void refresh(); }} className={btnCls}>Open the SOC</button>
      </Shell>
    );
  }

  // ── not enrolled: set up the authenticator app ────────────────────────────
  if (!status.enrolled) {
    return (
      <Shell>
        <div className="flex items-center gap-2 mb-1"><Smartphone className="w-5 h-5 text-purple-400" /><h2 className="text-base font-bold text-gray-100">Set up two-factor authentication</h2></div>
        <p className="text-xs text-gray-400 mb-4">The SOC holds confidential records, so signing in is not enough. You will add an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…) and enter a code from it each time you open the SOC.</p>
        {error && <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2 mb-3">{error}</p>}
        {!setupData ? (
          <form onSubmit={e => { e.preventDefault(); void run(async () => { setSetupData(await api.socAuth.setup(password)); setPassword(''); }); }} className="space-y-3">
            <label className="block text-xs text-gray-400">Confirm your password to continue
              <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            <button type="submit" disabled={busy || !password} className={btnCls}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Continue</button>
          </form>
        ) : (
          <form onSubmit={e => { e.preventDefault(); void run(async () => { const r = await api.socAuth.confirm(code); setSocToken(r.socToken); armExpiry(r.expiresAt); setRecoveryCodes(r.recoveryCodes); setCode(''); setSetupData(null); }); }} className="space-y-3">
            <p className="text-xs text-gray-300"><b>1.</b> In your authenticator app choose “Add account” → “Enter a setup key”, and enter:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-purple-300 tracking-wider break-all">{setupData.secret.match(/.{1,4}/g)?.join(' ')}</code>
              <button type="button" onClick={() => copy(setupData.secret, 'secret')} className="text-xs font-semibold text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg px-2.5 py-2">{copied === 'secret' ? 'Copied' : <Copy className="w-3.5 h-3.5" />}</button>
            </div>
            <p className="text-[11px] text-gray-500">On a phone you can also <a href={setupData.otpauthUrl} className="text-purple-400 underline">tap here to open it in your authenticator app</a>. Choose “time-based”.</p>
            <p className="text-xs text-gray-300"><b>2.</b> Enter the 6-digit code it shows:</p>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus value={code} onChange={e => setCode(e.target.value.replace(/[^\d ]/g, ''))} placeholder="123456" className={`${inputCls} text-center text-lg tracking-[0.4em]`} />
            <button type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6} className={btnCls}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Confirm and turn on</button>
          </form>
        )}
      </Shell>
    );
  }

  // ── enrolled, not verified: ask for a code ────────────────────────────────
  const locked = status.lockedUntil && new Date(status.lockedUntil) > new Date();
  return (
    <Shell>
      <div className="flex items-center gap-2 mb-1"><KeyRound className="w-5 h-5 text-purple-400" /><h2 className="text-base font-bold text-gray-100">Open the SOC</h2></div>
      <p className="text-xs text-gray-400 mb-4">{useRecovery ? 'Enter one of your recovery codes.' : 'Enter the 6-digit code from your authenticator app.'}</p>
      {locked && <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-900 rounded-lg px-3 py-2 mb-3 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />Locked after too many wrong codes until {new Date(status.lockedUntil!).toLocaleTimeString('en-IN')}.</p>}
      {error && <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2 mb-3">{error}</p>}
      <form onSubmit={e => { e.preventDefault(); void run(async () => {
        const r = await api.socAuth.verify(useRecovery ? { recoveryCode: code } : { code });
        setSocToken(r.socToken); armExpiry(r.expiresAt); setCode(''); await refresh();
      }).then(() => refresh()); }} className="space-y-3">
        <input autoFocus value={code} onChange={e => setCode(useRecovery ? e.target.value : e.target.value.replace(/[^\d ]/g, ''))}
          inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code" maxLength={useRecovery ? 12 : 7}
          placeholder={useRecovery ? 'XXXXX-XXXXX' : '123456'} className={`${inputCls} text-center text-lg tracking-[0.3em]`} />
        <button type="submit" disabled={busy || !code.trim() || !!locked} className={btnCls}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Verify</button>
      </form>
      <button type="button" onClick={() => { setUseRecovery(v => !v); setCode(''); setError(''); }} className="mt-3 text-xs text-gray-400 hover:text-gray-200 underline">
        {useRecovery ? 'Use my authenticator app instead' : 'I lost my phone — use a recovery code'}
      </button>
    </Shell>
  );
}
