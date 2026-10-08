import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import ZestIcon from '../../components/zest/ZestIcon';
import { LayoutDashboard, Users, UserCog, FileText, GraduationCap, BookOpen, CalendarDays, MessageSquare, Activity, BarChart2, Globe, Settings, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { loginRedirect } from '../../lib/loginRedirect';
import DashboardSidebar from '../../components/DashboardSidebar';
import DashboardTopbar from '../../components/DashboardTopbar';
import type { SearchConfig } from '../../components/dashboards/GlobalSearch';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';
import { useNewLeadCount } from '../../hooks/useNewLeadCount';
import SkipLink from '../../components/SkipLink';

type NavIcon = React.ComponentType<{ className?: string }> | string;

// appTeamHidden: the backend already blocks Application Team accounts (role 'admin' with
// isAppTeam) from these routes (see adminOnly in automation.js/roles.js/zest.js) — hidden here
// too so the sidebar doesn't offer a link that just 403s for them.
const navItems: { to: string; label: string; icon: NavIcon; end?: boolean; appTeamHidden?: boolean }[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/counselors', label: 'Team', icon: UserCog },
  { to: '/admin/students', label: 'Students', icon: Users },
  { to: '/admin/applications', label: 'Applications', icon: FileText },
  { to: '/admin/countries', label: 'Countries & Visa', icon: Globe },
  { to: '/admin/universities', label: 'Universities', icon: GraduationCap },
  { to: '/admin/courses', label: 'Courses', icon: BookOpen },
  { to: '/admin/activities', label: 'Activities', icon: CalendarDays },
  { to: '/admin/privacy', label: 'Data requests', icon: ShieldCheck },
  { to: '/admin/live-feed', label: 'Live Feed', icon: Activity },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart2, appTeamHidden: true },
  { to: '/admin/zest', label: 'Zest', icon: GraduationCap, appTeamHidden: true },
  { to: '/admin/chat', label: 'Chat', icon: MessageSquare },
  { to: '/admin/settings', label: 'Settings', icon: Settings, appTeamHidden: true },
];

// Everything the top search can open: students, team, universities, courses, the sidebar pages and each Settings section
const search: SearchConfig = {
  basePath: '/admin/students',
  teamLink: t => t.kind === 'counselor' ? `/admin/counselors/${t.id}/performance` : `/admin/counselors?view=${t.id}`,
  pages: [
    ...navItems.map(item => ({ label: item.label, to: item.to })),
    ...[
      ['company', 'Company Profile'], ['profile', 'My Profile'], ['password', 'Password & Security'],
      ['users', 'Users and Controls'], ['automation', 'Automation'], ['whatsapp', 'WhatsApp / SMS'],
      ['google-cal', 'Google Calendar'], ['export', 'Export & Backup'], ['danger', 'Danger Zone'],
    ].map(([key, label]) => ({ label, to: `/admin/settings?section=${key}`, hint: 'Settings' })),
    { label: 'Roles', to: '/admin/settings?section=users&tab=roles', hint: 'Settings · Users and Controls' },
    { label: 'Application Board', to: '/admin/application-board', hint: 'Applications' },
  ],
};

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

  const visibleItems = navItems.filter(item => !(item.appTeamHidden && user?.isAppTeam));

  const sidebarItems = visibleItems.map(item => ({
    to: item.to, label: item.label, end: item.end,
    icon: item.icon as React.ComponentType<{ className?: string }>,
    badge: item.label === 'Chat' ? unreadCount : item.label === 'Students' ? newLeads : undefined,
  }));

  return (
    <div className="min-h-screen bg-purple-50">
      <SkipLink />
      <DashboardTopbar workspaceLabel="Admin workspace" search={search} />
      <div className="flex">
        <DashboardSidebar navItems={sidebarItems} />

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40">
          {visibleItems.map(item => (
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

        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 p-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
