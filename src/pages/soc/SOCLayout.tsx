import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../api';
import { loginRedirect } from '../../lib/loginRedirect';
import SkipLink from '../../components/SkipLink';

// Deliberately separate from AdminLayout — its own route tree at /soc, not
// nested under /admin and not listed in the admin sidebar. Also does NOT
// reuse the shared site Navbar, which carries consumer-facing links (Home,
// Browse Programs, Resources) and the "Admin" profile badge — neither
// belongs on an analyst tool that's meant to feel standalone, not like a
// page wearing the rest of the site's chrome. Still gated to admin accounts
// (same underlying permission as the rest of the admin area), just not
// presented as part of that portal.
export default function SOCLayout() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const location = useLocation();
  const isAdmin = isAuthenticated && user?.role === 'admin' && !user?.isAppTeam;
  // Being an admin isn't enough: only the SOC owner may use it. Ask the server before drawing anything, so anyone else is sent
  // back to their own area instead of seeing an empty SOC full of refused requests. Only an explicit refusal (403) sends
  // them away; a network hiccup lets the page draw and its own requests report the problem.
  const [access, setAccess] = useState<'checking' | 'ok' | 'denied'>('checking');
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    api.soc.access()
      .then(() => { if (live) setAccess('ok'); })
      .catch(err => { if (live) setAccess(err instanceof ApiError && err.status === 403 ? 'denied' : 'ok'); });
    return () => { live = false; };
  }, [isAdmin]);

  if (loading || (isAdmin && access === 'checking')) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to={loginRedirect(location)} />;
  if (!isAdmin) return <Navigate to={loginRedirect(location)} />;
  if (access === 'denied') return <Navigate to="/admin" replace />;

  return (
    <div className="min-h-screen bg-gray-950">
      <SkipLink />
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-purple-600/20 rounded-lg flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-purple-400" />
            </div>
            <span className="text-sm font-semibold text-gray-100 tracking-wide">Gradzest SOC</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400">{user?.name} · analyst</span>
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-100 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="max-w-6xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
