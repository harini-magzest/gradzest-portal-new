import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, ShieldOff, Copy, Download, Check, Loader2, KeyRound, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

// Two-step verification with an authenticator app, for whoever is signed in (staff or student). The whole flow lives here:
// turn on (password, scan the QR code, confirm a code, save the recovery codes), then turn off or make new recovery codes
// (both ask for the password and a current code again, so a stolen session alone cannot undo it).

type Status = { enabled: boolean; enabledAt: string | null; recoveryCodesRemaining: number; hasPassword: boolean };
type Step = 'idle' | 'password' | 'scan' | 'codes' | 'disable' | 'regenerate';

const inputCls = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500';
const primaryBtn = 'inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const ghostBtn = 'px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors';

// "ABCD EFGH ..." so a key typed in by hand is easier to read and check
const groupKey = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

// The QR code is drawn in the browser from the otpauth link. The key never goes to a third-party QR service.
function QrImage({ text }: { text: string }) {
  return (
    <div className="p-2 rounded-xl border border-gray-200 bg-white">
      <QRCodeSVG value={text} size={160} marginSize={0} role="img" aria-label="QR code to add Gradzest to your authenticator app" />
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* clipboard blocked: the text is on screen to copy by hand */ }
  };
  return (
    <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900">
      {done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{done ? 'Copied' : label}
    </button>
  );
}

function Shell({ enabled, children }: { enabled?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-1">
        {enabled ? <ShieldCheck className="w-5 h-5 text-green-600" /> : <ShieldOff className="w-5 h-5 text-gray-400" />}
        <h2 className="text-base font-bold text-gray-900">Two-Step Verification</h2>
        {enabled !== undefined && (
          <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {enabled ? 'On' : 'Off'}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export default function TwoFactorCard() {
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setStatus(await api.account.twoFactor.status()); setLoadError(''); }
    catch (e: any) { setLoadError(e?.message || 'Could not load your two-step verification settings.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const reset = () => { setStep('idle'); setPassword(''); setCode(''); setSetup(null); setError(''); };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e: any) { setError(e?.message || 'Something went wrong. Please try again.'); } finally { setBusy(false); }
  };

  const startSetup = (e: React.FormEvent) => { e.preventDefault(); run(async () => { setSetup(await api.account.twoFactor.setup(password)); setPassword(''); setCode(''); setStep('scan'); }); };
  const confirmSetup = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
    const res = await api.account.twoFactor.enable(code);
    setRecoveryCodes(res.recoveryCodes); setSaved(false); setSetup(null); setCode(''); setStep('codes');
    await load(); refreshUser();
  }); };
  const turnOff = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
    await api.account.twoFactor.disable(password, code); reset(); await load(); refreshUser();
  }); };
  const newCodes = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
    const res = await api.account.twoFactor.newRecoveryCodes(password, code);
    setRecoveryCodes(res.recoveryCodes); setSaved(false); setPassword(''); setCode(''); setStep('codes'); await load();
  }); };

  const download = () => {
    const body = `Gradzest recovery codes\nEach code works once. Keep them somewhere safe and private.\n\n${recoveryCodes.join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'gradzest-recovery-codes.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  // A plain value, not a component: a component defined here would get a new identity on every keystroke and remount the inputs.
  const errorLine = error ? <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p> : null;

  if (loadError) return <Shell enabled={status?.enabled}><p role="alert" className="text-sm text-red-600 mt-3">{loadError}</p></Shell>;
  if (!status) return <Shell><div className="flex items-center gap-2 text-sm text-gray-400 mt-3"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div></Shell>;

  // The recovery codes are shown once and must be saved before leaving.
  if (step === 'codes') {
    return (
      <Shell enabled={status?.enabled}>
        <div className="mt-3 space-y-4">
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-800">Save these recovery codes now. They are shown only once. Each one signs you in once if you lose your phone.</p>
          </div>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm bg-gray-50 border border-gray-200 rounded-xl p-4" aria-label="Recovery codes">
            {recoveryCodes.map(c => <li key={c} className="tracking-wider text-gray-800">{c}</li>)}
          </ul>
          <div className="flex items-center gap-4">
            <CopyButton text={recoveryCodes.join('\n')} label="Copy all" />
            <button type="button" onClick={download} className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900">
              <Download className="w-3.5 h-3.5" />Download .txt
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} className="rounded border-gray-300" />
            I have saved these codes somewhere safe
          </label>
          <button type="button" disabled={!saved} onClick={() => { setRecoveryCodes([]); reset(); }} className={primaryBtn}>Done</button>
        </div>
      </Shell>
    );
  }

  if (step === 'password') {
    return (
      <Shell enabled={status?.enabled}>
        <form onSubmit={startSetup} className="mt-3 space-y-3 max-w-sm">
          <p className="text-sm text-gray-500">Confirm your password to start.</p>
          <input type="password" autoComplete="current-password" autoFocus value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="Current password" aria-label="Current password" />
          {errorLine}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !password} className={primaryBtn}>{busy ? 'Checking…' : 'Continue'}</button>
            <button type="button" onClick={reset} className={ghostBtn}>Cancel</button>
          </div>
        </form>
      </Shell>
    );
  }

  if (step === 'scan' && setup) {
    return (
      <Shell enabled={status?.enabled}>
        <form onSubmit={confirmSetup} className="mt-3 space-y-4">
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).</li>
            <li>Scan this code, or choose "enter a key" and type the key below.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <QrImage text={setup.otpauthUri} />
            <div className="space-y-3 min-w-0">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Key for manual entry</p>
                <p className="font-mono text-sm tracking-wider text-gray-800 break-all select-all">{groupKey(setup.secret)}</p>
                <CopyButton text={setup.secret} label="Copy key" />
              </div>
              <div className="max-w-[12rem]">
                <label htmlFor="tf-confirm-code" className="block text-xs font-medium text-gray-500 mb-1">6-digit code</label>
                <input id="tf-confirm-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={7} value={code} onChange={e => setCode(e.target.value)}
                  className={`${inputCls} text-center font-mono tracking-widest text-lg`} placeholder="123 456" />
              </div>
            </div>
          </div>
          {errorLine}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6} className={primaryBtn}>{busy ? 'Verifying…' : 'Turn on'}</button>
            <button type="button" onClick={reset} className={ghostBtn}>Cancel</button>
          </div>
        </form>
      </Shell>
    );
  }

  if (step === 'disable' || step === 'regenerate') {
    const disabling = step === 'disable';
    return (
      <Shell enabled={status?.enabled}>
        <form onSubmit={disabling ? turnOff : newCodes} className="mt-3 space-y-3 max-w-sm">
          <p className="text-sm text-gray-500">
            {disabling ? 'To turn this off, confirm your password and a current code.' : 'New recovery codes replace the old ones, which stop working. Confirm your password and a current code.'}
          </p>
          <input type="password" autoComplete="current-password" autoFocus value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="Current password" aria-label="Current password" />
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={20} value={code} onChange={e => setCode(e.target.value)} className={`${inputCls} font-mono`} placeholder="6-digit code (or a recovery code)" aria-label="Verification code" />
          {errorLine}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !password || !code.trim()}
              className={disabling ? 'inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors' : primaryBtn}>
              {busy ? 'Working…' : disabling ? 'Turn off' : 'Make new codes'}
            </button>
            <button type="button" onClick={reset} className={ghostBtn}>Cancel</button>
          </div>
        </form>
      </Shell>
    );
  }

  // idle
  if (status.enabled) {
    const low = status.recoveryCodesRemaining <= 3;
    return (
      <Shell enabled={status?.enabled}>
        <div className="mt-3 space-y-4">
          <p className="text-sm text-gray-500">
            Signing in asks for a code from your authenticator app{status.enabledAt ? `, on since ${new Date(status.enabledAt).toLocaleDateString()}` : ''}.
          </p>
          <div className={`flex items-center gap-2 text-sm rounded-xl px-3 py-2 border ${low ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
            <KeyRound className="w-4 h-4 flex-shrink-0" />
            {status.recoveryCodesRemaining} recovery code{status.recoveryCodesRemaining === 1 ? '' : 's'} left{low ? '. Make new ones soon.' : '.'}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setStep('regenerate'); setError(''); }} className="px-4 py-2 text-sm font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors">New recovery codes</button>
            <button type="button" onClick={() => { setStep('disable'); setError(''); }} className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">Turn off</button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell enabled={status?.enabled}>
      <div className="mt-3 space-y-4">
        <p className="text-sm text-gray-500">When this is on, signing in needs your password and a 6-digit code from an authenticator app on your phone. Someone who learns your password still cannot get in.</p>
        {!status.hasPassword
          ? <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">This account has no password yet. Use "Forgot password" on the sign-in page to create one first.</p>
          : <button type="button" onClick={() => { setStep('password'); setError(''); }} className={primaryBtn}><ShieldCheck className="w-4 h-4" />Turn on</button>}
      </div>
    </Shell>
  );
}
