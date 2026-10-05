import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { loginRedirect } from '../../lib/loginRedirect';

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

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to={loginRedirect(location)} />;
  if (user?.role !== 'admin' || user?.isAppTeam) return <Navigate to={loginRedirect(location)} />;

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-purple-600/20 rounded-lg flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-purple-400" />
            </div>
            <span className="text-sm font-semibold text-gray-100 tracking-wide">Security Operations Center</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400">{user?.name} · analyst</span>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-100 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
