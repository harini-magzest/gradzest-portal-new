import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GraduationCap, CheckCircle, AlertCircle, Loader } from 'lucide-react';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    // The server redirects GET /api/auth/verify-email to /login?verified=1
    // This page is only shown if the user lands on /verify-email without a token
    setStatus('error');
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="inline-flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-[#0d1b4b] rounded-2xl flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <span className="text-3xl font-extrabold tracking-tight select-none">
            <span className="text-[#0d1b4b]">Grad</span><span className="text-blue-500">zest</span>
          </span>
        </div>
        {status === 'loading' && (
          <>
            <Loader className="w-10 h-10 text-[#0d1b4b] animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Verifying your email…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Email Verified!</h2>
            <p className="text-gray-500 text-sm mb-6">Your account is now active. You can sign in.</p>
            <Link to="/login" className="block w-full bg-[#0d1b4b] text-white py-3 rounded-xl font-semibold hover:bg-[#152258] transition-colors text-sm text-center">
              Sign In
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Link</h2>
            <p className="text-gray-500 text-sm mb-6">This verification link is missing or has expired.</p>
            <Link to="/login" className="block w-full bg-[#0d1b4b] text-white py-3 rounded-xl font-semibold hover:bg-[#152258] transition-colors text-sm text-center">
              Back to Login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
