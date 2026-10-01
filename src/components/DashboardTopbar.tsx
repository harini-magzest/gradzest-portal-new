import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, ChevronDown, User, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import { usePortalName } from '../hooks/usePortalName';

const ICON_BTN = 'w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors flex-shrink-0';

export default function DashboardTopbar({
  workspaceLabel,
}: {
  workspaceLabel: string;
}) {
  const { user, logout } = useAuth();
  // Staff see their role from the Roles tree (e.g. "Associate Counsellor HO workspace")
  const { workspace } = usePortalName();
  const label = user?.role === 'counselor' || user?.role === 'admin' ? workspace : workspaceLabel;
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
    setProfileOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 flex items-stretch h-16">
      {/* Left cell */}
      <Link to="/" className="hidden md:flex items-center gap-2.5 w-56 shrink-0 px-5 border-r border-gray-100">
        <div className="w-10 h-10 bg-[#0d1b4b] rounded-xl flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        <div className="leading-tight min-w-0">
          <p className="text-xl font-extrabold tracking-tight truncate">
            <span className="text-[#0d1b4b]">Grad</span><span className="text-blue-500">zest</span>
          </p>
          <p className="text-[11px] text-gray-400 truncate">{label}</p>
        </div>
      </Link>

      {/* Right cell */}
      <div className="flex-1 flex items-center px-4 md:px-6 min-w-0">
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <NotificationBell buttonClassName={`relative ${ICON_BTN}`} />

          <div className="relative" ref={profileRef}>
            <button type="button" onClick={() => setProfileOpen(v => !v)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="w-8 h-8 bg-[#0d1b4b] rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                {(user?.name || '?').charAt(0)}
              </div>
              <span className="hidden lg:block text-sm font-medium text-gray-700 truncate max-w-[8rem]">
                {user?.name?.split(' ')[0]}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">{user?.role}</p>
                </div>
                {user?.role === 'student' && (
                  <Link to="/student/profile" onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <User className="w-4 h-4 text-gray-400" /> My Profile
                  </Link>
                )}
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <button type="button" onClick={handleLogout}
                    className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
