import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, GraduationCap, User, MessageSquare, BookOpen, CalendarDays, FileText, Zap, Globe, Video, Ticket } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { loginRedirect } from '../../lib/loginRedirect';
import DashboardSidebar from '../../components/DashboardSidebar';
import DashboardTopbar from '../../components/DashboardTopbar';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';
import EmailVerificationBanner from '../../components/EmailVerificationBanner';

type NavIcon = React.ComponentType<{ className?: string }> | string;

const navItems: { to: string; label: string; icon: NavIcon; end?: boolean; mobileHide?: boolean }[] = [
  { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/student/applications', label: 'Applications', icon: FileText },
  { to: '/student/countries', label: 'Countries', icon: Globe },
  { to: '/student/universities', label: 'Universities', icon: GraduationCap },
  { to: '/student/courses', label: 'Courses', icon: BookOpen, mobileHide: true },
  { to: '/student/activities', label: 'Activities', icon: CalendarDays },
  { to: '/student/meetings', label: 'Meetings', icon: Video },
  { to: '/student/events', label: 'Events', icon: Ticket, mobileHide: true },
  { to: '/student/learning', label: 'Learning Hub', icon: Zap, mobileHide: true },
  { to: '/student/chat', label: 'Chat', icon: MessageSquare },
  { to: '/student/profile', label: 'My Profile', icon: User },
];

function NavIcon({ icon, size }: { icon: NavIcon; size: 'sm' | 'md' }) {
  if (typeof icon === 'string') {
    return <span className={size === 'md' ? 'text-xl leading-none' : 'text-base leading-none'}>{icon}</span>;
  }
  const Icon = icon;
  return <Icon className={size === 'md' ? 'w-5 h-5' : 'w-4 h-4'} />;
}

export default function StudentLayout() {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const unreadCount = useUnreadMessages();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#0d1b4b] border-t-transparent rounded-full animate-spin"></div></div>;
  if (!isAuthenticated) return <Navigate to={loginRedirect(location)} />;
  if (user?.role !== 'student') return <Navigate to={loginRedirect(location)} />;

  const sidebarItems = navItems.map(item => ({
    to: item.to, label: item.label, end: item.end,
    icon: (typeof item.icon === 'string' ? GraduationCap : item.icon) as React.ComponentType<{ className?: string }>,
    badge: item.label === 'Chat' ? unreadCount : undefined,
  }));

  return (
    <div className="min-h-screen bg-blue-50">
      <DashboardTopbar workspaceLabel="Student workspace" />
      <EmailVerificationBanner />
      <div className="flex">
        {/* Sidebar */}
        <DashboardSidebar navItems={sidebarItems} />

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40">
          {navItems.filter(item => !item.mobileHide).map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex-1 flex flex-col items-center py-3 text-xs gap-1 ${isActive ? 'text-[#0d1b4b]' : 'text-gray-500'}`}>
              <div className="relative">
                <NavIcon icon={item.icon} size="md" />
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
