import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, UserCog, FileText, GraduationCap, BookOpen, CalendarDays, MessageSquare, Activity, BarChart2, Globe, Settings, Sparkles, Video } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { loginRedirect } from '../../lib/loginRedirect';
import DashboardSidebar from '../../components/DashboardSidebar';
import DashboardTopbar from '../../components/DashboardTopbar';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';
import { useNewLeadCount } from '../../hooks/useNewLeadCount';

type NavIcon = React.ComponentType<{ className?: string }> | string;

const navItems: { to: string; label: string; icon: NavIcon; end?: boolean }[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/counselors', label: 'Team', icon: UserCog },
  { to: '/admin/students', label: 'Students', icon: Users },
  { to: '/admin/applications', label: 'Applications', icon: FileText },
  { to: '/admin/countries', label: 'Countries & Visa', icon: Globe },
  { to: '/admin/universities', label: 'Universities', icon: GraduationCap },
  { to: '/admin/courses', label: 'Courses', icon: BookOpen },
  { to: '/admin/activities', label: 'Activities', icon: CalendarDays },
  { to: '/admin/meetings', label: 'Meetings', icon: Video },
  { to: '/admin/live-feed', label: 'Live Feed', icon: Activity },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart2 },
  { to: '/admin/zest', label: 'Zest', icon: Sparkles },
  { to: '/admin/chat', label: 'Chat', icon: MessageSquare },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

function NavIcon({ icon, size }: { icon: NavIcon; size: 'sm' | 'md' }) {
  if (typeof icon === 'string') {
    return <span className={size === 'md' ? 'text-xl leading-none' : 'text-base leading-none'}>{icon}</span>;
  }
  const Icon = icon;
  return <Icon className={size === 'md' ? 'w-5 h-5' : 'w-4 h-4'} />;
}

export default function AdminLayout() {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const unreadCount = useUnreadMessages();
  const newLeads = useNewLeadCount();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>;
  if (!isAuthenticated) return <Navigate to={loginRedirect(location)} />;
  if (user?.role !== 'admin') return <Navigate to={loginRedirect(location)} />;

  const sidebarItems = navItems.map(item => ({
    to: item.to, label: item.label, end: item.end,
    icon: item.icon as React.ComponentType<{ className?: string }>,
    badge: item.label === 'Chat' ? unreadCount : item.label === 'Students' ? newLeads : undefined,
  }));

  return (
    <div className="min-h-screen bg-purple-50">
      <DashboardTopbar workspaceLabel="Admin workspace" />
      <div className="flex">
        <DashboardSidebar navItems={sidebarItems} />

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex-1 flex flex-col items-center py-3 text-xs gap-1 ${isActive ? 'text-purple-600' : 'text-gray-500'}`}>
              <div className="relative">
                <NavIcon icon={item.icon} size="md" />
                {item.label === 'Students' && newLeads > 0 && (
                  <span className="absolute -top-1.5 -right-3 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {newLeads > 99 ? '99+' : newLeads}
                  </span>
                )}
                {item.label === 'Chat' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-white" />
                )}
              </div>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 min-w-0 p-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
