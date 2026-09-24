import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { GraduationCap, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, API_ORIGIN } from '../api';
import { useToast } from '../context/ToastContext';

// SVG icons for social providers
function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-800" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#1877F2" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const { login, loginWithToken } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Show success message when redirected from email verification
  useEffect(() => {
    if (searchParams.get('verified') === '1') toast.success('Email verified! You can now sign in.');
  }, []);

  // Handle GitHub OAuth callback — server sets a refresh cookie and redirects here
  useEffect(() => {
    const socialLogin = searchParams.get('social_login');
    const role = searchParams.get('role');
    const oauthError = searchParams.get('error');

    if (oauthError) {
      const messages: Record<string, string> = {
        github_not_configured: 'GitHub login is not configured on this server.',
        github_token_failed: 'GitHub authentication failed. Please try again.',
        github_failed: 'GitHub login failed. Please try again.',
      };
      toast.error(messages[oauthError] || 'Social login failed.');
      return;
    }

    if (socialLogin === '1' && role) {
      api.auth.refresh().then(async token => {
        if (token) {
          await loginWithToken(token);
          redirectAfterLogin(role);
        } else {
          toast.error('Social login failed. Please try again.');
        }
      });
    }
  }, [searchParams, loginWithToken, navigate]);

  function redirectAfterLogin(role: string, isAppTeam?: boolean) {
    if (role === 'admin') navigate(isAppTeam ? '/appteam' : '/admin');
    else if (role === 'counselor') navigate('/counselor');
    else navigate('/student');
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.success) {
      const redirectTo = searchParams.get('redirect');
      if (redirectTo) navigate(redirectTo);
      else redirectAfterLogin(result.role!, result.isAppTeam);
    } else if (result.code === 'EMAIL_NOT_VERIFIED') {
      toast.error('Please verify your email before logging in. Check your inbox or request a new verification link.');
    } else {
      toast.error('Invalid email or password.');
    }
  };

  const loginAs = async (demoEmail: string, demoPassword: string, redirectTo?: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setSubmitting(true);
    const result = await login(demoEmail, demoPassword);
    setSubmitting(false);
    if (result.success) {
      if (redirectTo) navigate(redirectTo);
      else redirectAfterLogin(result.role!, result.isAppTeam);
    } else {
      toast.error('Login failed. Please make sure the server is running and the database is seeded.');
    }
  };

  // GitHub — server-side redirect flow
  const handleGitHub = () => {
    setSocialLoading('github');
    window.location.href = `${API_ORIGIN}/api/auth/github`;
  };

  // Facebook — uses FB JS SDK (loaded separately)
  const handleFacebook = () => {
    const FB = (window as any).FB;
    if (!FB) {
      toast.error('Facebook SDK not loaded. Add VITE_FACEBOOK_APP_ID to your .env and reload.');
      return;
    }
    setSocialLoading('facebook');
    FB.login(async (response: any) => {
      if (response.authResponse) {
        try {
          const data = await api.auth.facebookLogin(
            response.authResponse.accessToken,
            response.authResponse.userID
          );
          loginWithToken(data.token);
          redirectAfterLogin(data.user.role);
        } catch (err: any) {
          toast.error(err.message || 'Facebook login failed.');
        }
      } else {
        toast.error('Facebook sign-in was cancelled.');
      }
      setSocialLoading(null);
    }, { scope: 'public_profile,email' });
  };

  const demoAccounts = {
    admin: [
      { email: 'admin@eduabroad.com', password: 'admin123', name: 'Admin', initials: 'AD' },
    ],
    counselors: [
      { email: 'kavitha@eduabroad.com', password: 'counselor123', name: 'Dr. Kavitha Reddy', initials: 'KR' },
      { email: 'rajesh@eduabroad.com', password: 'counselor123', name: 'Mr. Rajesh Kumar', initials: 'RK' },
    ],
    students: [
      { email: 'aryan@example.com', password: 'student123', name: 'Aryan Sharma', initials: 'AS' },
      { email: 'priya@example.com', password: 'student123', name: 'Priya Patel', initials: 'PP' },
      { email: 'rashid@example.com', password: 'student123', name: 'Mohammed Al-Rashid', initials: 'MA' },
      { email: 'lan@example.com', password: 'student123', name: 'Nguyen Thi Lan', initials: 'NL' },
      { email: 'sara@example.com', password: 'student123', name: 'Sara Ahmed', initials: 'SA' },
    ],
  };

  const anyLoading = submitting || !!socialLoading;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-[#0d1b4b] rounded-2xl flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-7 h-7 text-white" />
              </div>
              <span className="text-3xl font-extrabold tracking-tight select-none">
                <span className="text-[#0d1b4b]">Grad</span><span className="text-blue-500">zest</span>
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome Back</h1>
            <p className="text-gray-500 mt-2 text-sm">Sign in to access your dashboard</p>
          </div>

          {/* Social Login Buttons */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <button
              type="button"
              onClick={handleGitHub}
              disabled={anyLoading}
              className="flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Sign in with GitHub"
            >
              {socialLoading === 'github'
                ? <span className="w-5 h-5 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
                : <GitHubIcon />}
              <span className="text-xs font-medium text-gray-700 hidden sm:block">GitHub</span>
            </button>

            <button
              type="button"
              onClick={handleFacebook}
              disabled={anyLoading}
              className="flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-blue-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Sign in with Facebook"
            >
              {socialLoading === 'facebook'
                ? <span className="w-5 h-5 border-2 border-gray-300 border-t-[#1877F2] rounded-full animate-spin" />
                : <FacebookIcon />}
              <span className="text-xs font-medium text-gray-700 hidden sm:block">Facebook</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-gray-400 font-medium">or sign in with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0d1b4b] text-sm"
                placeholder="your@email.com" required autoComplete="email"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <Link to="/forgot-password" className="text-xs text-[#0d1b4b] hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0d1b4b] text-sm pr-12"
                  placeholder="••••••••" required autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={anyLoading} className="w-full bg-[#0d1b4b] text-white py-3 rounded-xl font-semibold hover:bg-[#152258] transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed">
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
            <Link
              to="/forgot-password"
              className="block w-full text-center py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
            >
              Forgot Password?
            </Link>
          </form>

          {import.meta.env.DEV && <div className="mt-8">
            <p className="text-center text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">Demo Accounts</p>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-purple-600 mb-2">Admin</p>
                <div className="grid grid-cols-1 gap-2">
                  {demoAccounts.admin.map(a => (
                    <button key={a.email} type="button" onClick={() => loginAs(a.email, a.password)} disabled={anyLoading}
                      className="flex items-center gap-3 p-3 border border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-bold text-xs flex-shrink-0">{a.initials}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{a.name}</p>
                        <p className="text-xs text-gray-400 truncate">{a.email}</p>
                      </div>
                      <span className="text-xs text-purple-600 font-medium whitespace-nowrap">Click to login →</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-orange-600 mb-2">Application Team</p>
                <div className="grid grid-cols-1 gap-2">
                  {demoAccounts.admin.map(a => (
                    <button key={`appteam-${a.email}`} type="button" onClick={() => loginAs(a.email, a.password, '/appteam')} disabled={anyLoading}
                      className="flex items-center gap-3 p-3 border border-orange-200 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed">
                      <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-700 font-bold text-xs flex-shrink-0">AT</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800">App Team Portal</p>
                        <p className="text-xs text-gray-400 truncate">{a.email}</p>
                      </div>
                      <span className="text-xs text-orange-600 font-medium whitespace-nowrap">Click to login →</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-green-600 mb-2">Counselors</p>
                <div className="grid grid-cols-1 gap-2">
                  {demoAccounts.counselors.map(a => (
                    <button key={a.email} type="button" onClick={() => loginAs(a.email, a.password)} disabled={anyLoading}
                      className="flex items-center gap-3 p-3 border border-green-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-xs flex-shrink-0">{a.initials}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{a.name}</p>
                        <p className="text-xs text-gray-400 truncate">{a.email}</p>
                      </div>
                      <span className="text-xs text-green-600 font-medium whitespace-nowrap">Click to login →</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#0d1b4b] mb-2">Students</p>
                <div className="grid grid-cols-1 gap-2">
                  {demoAccounts.students.map(a => (
                    <button key={a.email} type="button" onClick={() => loginAs(a.email, a.password)} disabled={anyLoading}
                      className="flex items-center gap-3 p-3 border border-blue-200 rounded-lg hover:border-sky-500 hover:bg-sky-50 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed">
                      <div className="w-8 h-8 bg-[#f0f4ff] rounded-full flex items-center justify-center text-[#0d1b4b] font-bold text-xs flex-shrink-0">{a.initials}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{a.name}</p>
                        <p className="text-xs text-gray-400 truncate">{a.email}</p>
                      </div>
                      <span className="text-xs text-[#0d1b4b] font-medium whitespace-nowrap">Click to login →</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>}

          <p className="text-center text-sm text-gray-500 mt-6">
            Don't have an account?{' '}
            <Link to="/" className="text-[#0d1b4b] font-medium hover:underline">Contact us</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
