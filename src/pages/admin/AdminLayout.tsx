import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, UserCog, Shield, FileText, GraduationCap, BookOpen, CalendarDays, MessageSquare, Activity, BarChart2, Globe } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
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
  { to: '/admin/live-feed', label: 'Live Feed', icon: Activity },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart2 },
  { to: '/admin/chat', label: 'Chat', icon: MessageSquare },
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
  const unreadCount = useUnreadMessages();
  const newLeads = useNewLeadCount();
  if (loading) return <div className="min-h-screen flex items-center justify-center dark:bg-gray-900"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.role !== 'admin') return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-purple-50 dark:bg-gray-900">
      <Navbar />
      <div className="flex">
        <aside className="hidden md:flex flex-col items-center w-24 shrink-0 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto bg-gradient-to-b from-purple-950 to-indigo-950 py-4 gap-1">
          <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center mb-3 flex-shrink-0" title={`${user.name} · Admin Portal`}>
            <Shield className="w-5 h-5 text-white" />
          </div>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="flex flex-col items-center gap-1 w-20 py-2 rounded-2xl hover:bg-purple-900/40 transition-colors group flex-shrink-0"
            >
              {({ isActive }) => (
                <>
                  <div className={`relative w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${
                    isActive ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-md' : 'text-purple-200/70 group-hover:text-white'
                  }`}>
                    <NavIcon icon={item.icon} size="md" />
                    {item.label === 'Chat' && unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-purple-950" />
                    )}
                    {item.label === 'Students' && newLeads > 0 && (
                      <span title={newLeads + ' new lead' + (newLeads > 1 ? 's' : '')}
                        className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-purple-950">
                        {newLeads > 99 ? '99+' : newLeads}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium text-center leading-tight px-0.5 ${isActive ? 'text-white' : 'text-purple-200/70 group-hover:text-white'}`}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </aside>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex z-40">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex-1 flex flex-col items-center py-3 text-xs gap-1 ${isActive ? 'text-purple-600' : 'text-gray-500 dark:text-gray-400'}`}>
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
