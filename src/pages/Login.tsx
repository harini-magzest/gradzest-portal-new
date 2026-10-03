import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { GraduationCap, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Show success message when redirected from email verification
  useEffect(() => {
    if (searchParams.get('verified') === '1') toast.success('Email verified! You can now sign in.');
  }, []);

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
      // Show the server's reason (wrong password, account locked, too many attempts…)
      toast.error(result.message || 'Invalid email or password.');
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
      toast.error(result.message || 'Login failed. Please make sure the server is running and the database is seeded.');
    }
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

  const anyLoading = submitting;

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
