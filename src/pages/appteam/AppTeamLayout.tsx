import React from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Layers, Users, UserCog, CalendarDays, Activity, MessageSquare, GraduationCap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { loginRedirect } from '../../lib/loginRedirect';
import DashboardSidebar from '../../components/DashboardSidebar';
import DashboardTopbar from '../../components/DashboardTopbar';
import SkipLink from '../../components/SkipLink';

const navItems: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean }[] = [
  { to: '/appteam',              label: 'Dashboard',    icon: LayoutDashboard, end: true },
  { to: '/appteam/applications', label: 'Applications', icon: Layers },
  { to: '/appteam/students',     label: 'Students',     icon: Users },
  { to: '/appteam/counselors',   label: 'Counselors',   icon: UserCog },
  { to: '/appteam/chat',         label: 'Chat',         icon: MessageSquare },
  { to: '/appteam/activities',   label: 'Activities',   icon: CalendarDays },
  { to: '/appteam/live-feed',    label: 'Live Feed',    icon: Activity },
  { to: '/appteam/learning',     label: 'Learning Hub', icon: GraduationCap },
];

export default function AppTeamLayout() {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to={loginRedirect(location)} />;
  if (user?.role !== 'admin') return <Navigate to={loginRedirect(location)} />;

  return (
    <div className="min-h-screen bg-orange-50">
      <SkipLink />
      <DashboardTopbar workspaceLabel="Application Team workspace" />
      <div className="flex">

        {/* Sidebar */}
        <DashboardSidebar navItems={navItems} />

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-2.5 text-[10px] gap-1 font-medium ${isActive ? 'text-orange-600' : 'text-gray-400'}`
              }>
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 p-6 pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
