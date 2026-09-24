import React from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { LayoutDashboard, Layers, Users, UserCog, FolderOpen, CalendarDays, Briefcase } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';

const navItems: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean }[] = [
  { to: '/board', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/board/applications', label: 'Applications', icon: Layers },
  { to: '/board/students', label: 'Students', icon: Users },
  { to: '/board/counselors', label: 'Counselors', icon: UserCog },
  { to: '/board/documents', label: 'Documents', icon: FolderOpen },
  { to: '/board/activities', label: 'Activities', icon: CalendarDays },
];

export default function BoardLayout() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.role !== 'admin') return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="flex">
        <aside className="hidden md:flex flex-col items-center w-24 shrink-0 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto bg-gradient-to-b from-indigo-950 to-blue-950 py-4 gap-1">
          <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center mb-3 flex-shrink-0" title={`${user?.name} · Board View`}>
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className="flex flex-col items-center gap-1 w-20 py-2 rounded-2xl hover:bg-indigo-900/40 transition-colors group flex-shrink-0"
            >
              {({ isActive }) => (
                <>
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${
                    isActive ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md' : 'text-indigo-200/70 group-hover:text-white'
                  }`}>
                    <Icon className="w-5 h-5 flex-shrink-0" />
                  </div>
                  <span className={`text-[10px] font-medium text-center leading-tight px-0.5 ${isActive ? 'text-white' : 'text-indigo-200/70 group-hover:text-white'}`}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </aside>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex-1 flex flex-col items-center py-2.5 text-[10px] gap-1 font-medium ${isActive ? 'text-indigo-700' : 'text-gray-400'}`}>
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 min-w-0 p-6 pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
