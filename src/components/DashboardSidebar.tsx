import { NavLink } from 'react-router-dom';

export type SidebarNavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  badge?: number;
  dot?: boolean;
};

export default function DashboardSidebar({
  navItems,
}: {
  navItems: SidebarNavItem[];
}) {
  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto bg-white border-r border-gray-100">
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors group ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
            {({ isActive }) => (
              <>
                <item.icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                <span className={`flex-1 truncate ${isActive ? 'text-blue-700 font-semibold' : 'text-gray-600 group-hover:text-gray-900'}`}>
                  {item.label}
                </span>
                {!!item.badge && (
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
                {item.dot && !item.badge && (
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
