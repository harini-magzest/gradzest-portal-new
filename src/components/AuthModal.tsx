import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { X, GraduationCap, Eye, EyeOff, AlertCircle, UserPlus, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';
import { api, setApiToken } from '../api';
import { getReferral, clearReferral } from '../lib/referral';
import PasswordStrengthBar from './PasswordStrengthBar';
import { checkPasswordStrength } from '../utils/passwordStrength';
import TwoFactorStep from './TwoFactorStep';

export default function AuthModal() {
  const { isOpen, tab, close, setTab } = useAuthModal();
  const { login, verifyTwoFactor, refreshUser } = useAuth();
  // Set once the password was right on an account with two-step verification: the popup then asks for the code.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [codeError, setCodeError] = useState('');
  const navigate = useNavigate();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Development only. These are the seeded demo logins (server/seed.js); they must never be in a production bundle,
  // so both the data and the UI below sit behind import.meta.env.DEV, which the build folds to `false` and removes.
  // No password is kept in the code: VITE_DEMO_PASSWORD (.env.local) fills it in, otherwise type the one the seed printed.
  const DEMO_PASSWORD = import.meta.env.DEV ? (import.meta.env.VITE_DEMO_PASSWORD || '') : '';
  const DEMO_ACCOUNTS = import.meta.env.DEV ? [
    { label: 'Student', email: 'aryan@example.com', color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
    { label: 'Counselor', email: 'kavitha@eduabroad.com', color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' },
    { label: 'Admin', email: 'admin@eduabroad.com', color: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100' },
  ] : [];

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPw, setShowRegPw] = useState(false);
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  if (!isOpen) return null;

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close();
  };

  const switchTab = (t: 'login' | 'register') => {
    setTab(t);
    setChallenge(null);
    setCodeError('');
    setLoginError('');
    setRegError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    const result = await login(loginEmail, loginPassword);
    setLoginLoading(false);
    if (result.success) {
      finishSignIn(result.role, result.isAppTeam);
    } else if (result.twoFactor) {
      setCodeError('');
      setChallenge(result.twoFactor.challengeToken);
    } else {
      setLoginError('Invalid email or password. Please try again.');
    }
  };

  const finishSignIn = (role: string, isAppTeam?: boolean) => {
    setChallenge(null);
    setLoginPassword('');
    close();
    if (role === 'admin') navigate(isAppTeam ? '/appteam' : '/admin');
    else if (role === 'counselor') navigate('/counselor');
    else navigate('/student');
  };

  const handleCode = async (code: string) => {
    if (!challenge) return;
    setLoginLoading(true);
    setCodeError('');
    const result = await verifyTwoFactor(challenge, code);
    setLoginLoading(false);
    if (result.success) {
      finishSignIn(result.role, result.isAppTeam);
    } else if (result.twoFactor === undefined && result.code === 'CHALLENGE_EXPIRED') {
      // The five minutes ran out: back to the password.
      setChallenge(null);
      setLoginError(result.message || 'Your sign-in session expired. Please sign in again.');
    } else {
      setCodeError((result.twoFactor === undefined && result.message) || 'That code did not work. Please try again.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    const strength = checkPasswordStrength(regPassword);
    if (!strength.valid) { setRegError('Password must be 8+ characters with an uppercase letter, a number, and a special character.'); return; }
    if (regPassword !== regConfirm) { setRegError('Passwords do not match.'); return; }
    setRegLoading(true);
    try {
      const { token } = await api.auth.register({ name: regName, email: regEmail, password: regPassword, ref: getReferral() });
      clearReferral();
      setApiToken(token);
      await refreshUser();
      close();
      navigate('/student');
    } catch (err: any) {
      setRegError(err.message || 'Registration failed. Please try again.');
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-[#0d1b4b] rounded-xl flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-extrabold tracking-tight select-none">
              <span className="text-[#0d1b4b]">Grad</span><span className="text-blue-500">zest</span>
            </span>
          </div>
          <button aria-label="Close"
            type="button"
            onClick={close}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 pb-4">
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => switchTab('login')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                tab === 'login' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <LogIn className="w-4 h-4" /> Sign In
            </button>
            <button
              type="button"
              onClick={() => switchTab('register')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                tab === 'register' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <UserPlus className="w-4 h-4" /> Create Account
            </button>
          </div>
        </div>

        <div className="px-6 pb-6">
          {/* SECOND STEP: the sign-in code, after the password was right on an account that has two-step verification */}
          {tab === 'login' && challenge && (
            <TwoFactorStep
              submitting={loginLoading} error={codeError} onSubmit={handleCode}
              onBack={() => { setChallenge(null); setCodeError(''); setLoginPassword(''); }}
            />
          )}

          {/* LOGIN FORM */}
          {tab === 'login' && !challenge && (
            <form onSubmit={handleLogin} className="space-y-4">
              <p className="text-sm text-gray-500">Welcome back! Sign in to your account.</p>
              {/* Demo accounts — development only (see DEMO_ACCOUNTS) */}
              {import.meta.env.DEV && <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-xs font-medium text-gray-500 mb-2">Try a demo account</p>
                <div className="flex gap-2 flex-wrap">
                  {DEMO_ACCOUNTS.map(acc => (
                    <button
                      key={acc.label}
                      type="button"
                      onClick={() => { setLoginEmail(acc.email); setLoginPassword(DEMO_PASSWORD); setLoginError(''); }}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${acc.color}`}
                    >
                      {acc.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Click a role to auto-fill credentials, then sign in.</p>
              </div>}
              {loginError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-red-700 text-sm">{loginError}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <input
                  type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="your@email.com" required autoFocus
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <Link
                    to="/forgot-password"
                    onClick={close}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showLoginPw ? 'text' : 'password'} value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm pr-12"
                    placeholder="••••••••" required
                  />
                  <button type="button" onClick={() => setShowLoginPw(!showLoginPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showLoginPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit" disabled={loginLoading}
                className="w-full bg-[#0d1b4b] text-white py-3 rounded-xl font-semibold hover:bg-[#152258] transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loginLoading ? 'Signing in...' : 'Sign In'}
              </button>
              <p className="text-center text-sm text-gray-500">
                New here?{' '}
                <button type="button" onClick={() => switchTab('register')} className="text-blue-600 font-medium hover:underline">
                  Create a free account
                </button>
              </p>
            </form>
          )}

          {/* REGISTER FORM */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <p className="text-sm text-gray-500 mb-4">Join 50,000+ students. Free to sign up.</p>
              {regError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-red-700 text-sm">{regError}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                <input
                  type="text" value={regName} onChange={e => setRegName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Your full name" required autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <input
                  type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="your@email.com" required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showRegPw ? 'text' : 'password'} value={regPassword} onChange={e => setRegPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm pr-12"
                    placeholder="Min. 8 characters" required minLength={8}
                  />
                  <button type="button" onClick={() => setShowRegPw(!showRegPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showRegPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrengthBar password={regPassword} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
                <input
                  type="password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Repeat your password" required
                />
              </div>
              <button
                type="submit" disabled={regLoading}
                className="w-full bg-[#0d1b4b] text-white py-3 rounded-xl font-semibold hover:bg-[#152258] transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {regLoading ? 'Creating account...' : 'Create Free Account'}
              </button>
              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <button type="button" onClick={() => switchTab('login')} className="text-blue-600 font-medium hover:underline">
                  Sign in
                </button>
              </p>
              <p className="text-center text-xs text-gray-400 border-t border-gray-100 pt-3">
                Counselor or staff?{' '}
                <span className="text-gray-500 font-medium">Accounts are created by your administrator.</span>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
