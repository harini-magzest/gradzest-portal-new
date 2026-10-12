import { useState } from 'react';
import { MailWarning, X, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_ORIGIN } from '../api';

export default function EmailVerificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // Only show for unverified students; social-login users have emailVerified=true already
  if (!user || (user as any).emailVerified !== false || dismissed) return null;

  const handleResend = async () => {
    setResending(true);
    try {
      await fetch(`${API_ORIGIN}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      setResent(true);
    } catch {}
    setResending(false);
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-3">
      <MailWarning className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <p className="text-sm text-amber-800 flex-1">
        Please verify your email address to unlock all features.{' '}
        {resent ? (
          <span className="text-green-700 font-medium">Verification email sent!</span>
        ) : (
          <button
            onClick={handleResend}
            disabled={resending}
            className="font-medium underline hover:no-underline disabled:opacity-60"
          >
            {resending ? 'Sending…' : 'Resend verification email'}
          </button>
        )}
      </p>
      <button onClick={() => setDismissed(true)} className="p-1 hover:bg-amber-100 rounded transition-colors">
        <X className="w-4 h-4 text-amber-600" />
      </button>
    </div>
  );
}
