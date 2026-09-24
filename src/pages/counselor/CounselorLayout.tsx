import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, MessageSquare, GraduationCap, User, BookOpen, CalendarDays, FileText, Zap, UserCog, Globe } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';

type NavIcon = React.ComponentType<{ className?: string }> | string;

const navItems: { to: string; label: string; icon: NavIcon; end?: boolean; mobileHide?: boolean }[] = [
  { to: '/counselor', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/counselor/students', label: 'Students', icon: Users },
  { to: '/counselor/applications', label: 'Applications', icon: FileText },
  { to: '/counselor/countries', label: 'Countries', icon: Globe },
  { to: '/counselor/universities', label: 'Universities', icon: GraduationCap },
  { to: '/counselor/courses', label: 'Courses', icon: BookOpen, mobileHide: true },
  { to: '/counselor/activities', label: 'Activities', icon: CalendarDays },
  { to: '/counselor/learning', label: 'Learning Hub', icon: Zap, mobileHide: true },
  { to: '/counselor/chat', label: 'Chat', icon: MessageSquare },
  { to: '/counselor/profile', label: 'My Profile', icon: User },
];

function NavIcon({ icon, size }: { icon: NavIcon; size: 'sm' | 'md' }) {
  if (typeof icon === 'string') {
    return <span className={size === 'md' ? 'text-xl leading-none' : 'text-base leading-none'}>{icon}</span>;
  }
  const Icon = icon;
  return <Icon className={size === 'md' ? 'w-5 h-5' : 'w-4 h-4'} />;
}

export default function CounselorLayout() {
  const { user, isAuthenticated, loading } = useAuth();
  const unreadCount = useUnreadMessages();
  if (loading) return <div className="min-h-screen flex items-center justify-center dark:bg-gray-900"><div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div></div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.role !== 'counselor') return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-green-50 dark:bg-gray-900">
      <Navbar />
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col items-center w-24 shrink-0 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto bg-gradient-to-b from-green-950 to-teal-950 py-4 gap-1">
          <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center mb-3 flex-shrink-0" title={`${user.name} · Counselor Portal`}>
            <UserCog className="w-5 h-5 text-white" />
          </div>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="flex flex-col items-center gap-1 w-20 py-2 rounded-2xl hover:bg-green-900/40 transition-colors group flex-shrink-0"
            >
              {({ isActive }) => (
                <>
                  <div className={`relative w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${
                    isActive ? 'bg-gradient-to-br from-green-500 to-teal-600 text-white shadow-md' : 'text-green-200/70 group-hover:text-white'
                  }`}>
                    <NavIcon icon={item.icon} size="md" />
                    {item.label === 'Chat' && unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-green-950" />
                    )}
                  </div>
                  <span className={`text-[10px] font-medium text-center leading-tight px-0.5 ${isActive ? 'text-white' : 'text-green-200/70 group-hover:text-white'}`}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </aside>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex z-40">
          {navItems.filter(item => !item.mobileHide).map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex-1 flex flex-col items-center py-3 text-xs gap-1 ${isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
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
