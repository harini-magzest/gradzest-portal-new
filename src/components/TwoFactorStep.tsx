import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, AlertCircle } from 'lucide-react';

interface Props {
  /** Sends the code; the parent decides what a good or bad answer means and passes any message back as `error`. */
  onSubmit: (code: string) => void | Promise<void>;
  /** Back to the email and password step. */
  onBack: () => void;
  submitting: boolean;
  error?: string;
}

// The second sign-in step: a 6-digit code from the authenticator app, or one of the recovery codes saved when two-factor
// sign-in was turned on. Used by the login page and the sign-in popup.
export default function TwoFactorStep({ onSubmit, onBack, submitting, error }: Props) {
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [useRecovery]);

  // A wrong code is cleared so the next attempt starts fresh, and the person is put back in the box.
  useEffect(() => { if (error) { setCode(''); inputRef.current?.focus(); } }, [error]);

  const ready = useRecovery ? code.replace(/[\s-]/g, '').length >= 12 : code.replace(/\s/g, '').length === 6;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ready && !submitting) onSubmit(code.trim());
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Two-step verification">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-3 bg-blue-50 rounded-2xl flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-blue-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Two-step verification</h2>
        <p className="text-sm text-gray-500 mt-1">
          {useRecovery
            ? 'Enter one of the recovery codes you saved when you turned this on. Each works once.'
            : 'Open your authenticator app and enter the 6-digit code for Gradzest.'}
        </p>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div>
        <label htmlFor="two-factor-code" className="block text-sm font-medium text-gray-700 mb-1.5">
          {useRecovery ? 'Recovery code' : 'Verification code'}
        </label>
        <input
          id="two-factor-code" ref={inputRef} value={code} onChange={e => setCode(e.target.value)}
          inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code" spellCheck={false}
          maxLength={useRecovery ? 20 : 7}
          placeholder={useRecovery ? 'xxxx-xxxx-xxxx' : '123 456'}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-center text-lg tracking-widest font-mono"
        />
      </div>

      <button type="submit" disabled={!ready || submitting}
        className="w-full bg-[#0d1b4b] text-white py-3 rounded-xl font-semibold hover:bg-[#152258] transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed">
        {submitting ? 'Verifying...' : 'Verify and sign in'}
      </button>

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => { setUseRecovery(v => !v); setCode(''); }} className="text-blue-600 hover:underline">
          {useRecovery ? 'Use my authenticator app' : 'Use a recovery code'}
        </button>
        <button type="button" onClick={onBack} className="text-gray-500 hover:text-gray-700 hover:underline">Back to sign in</button>
      </div>
    </form>
  );
}
