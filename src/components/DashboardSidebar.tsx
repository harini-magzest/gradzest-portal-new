import { useState } from 'react';
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
  const [tooltip, setTooltip] = useState<{ label: string; top: number; left: number } | null>(null);

  const showTooltip = (e: React.FocusEvent<HTMLElement> | React.MouseEvent<HTMLElement>, label: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTooltip({ label, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hideTooltip = () => setTooltip(null);

  return (
    <aside className="hidden md:flex flex-col items-center w-20 shrink-0 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto bg-white border-r border-gray-100">
      <nav className="flex-1 py-4 space-y-1">
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end}
            onMouseEnter={e => showTooltip(e, item.label)}
            onMouseLeave={hideTooltip}
            onFocus={e => showTooltip(e, item.label)}
            onBlur={hideTooltip}
            className={({ isActive }) => `relative flex items-center justify-center w-12 h-12 rounded-xl transition-colors ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
            {({ isActive }) => (
              <>
                <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-600'}`} />
                {!!item.badge && (
                  <span className="absolute -top-1 -right-1 text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center bg-red-500 text-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
                {item.dot && !item.badge && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Name tooltip — rendered fixed to the viewport so it isn't clipped by the sidebar's scroll area */}
      {tooltip && (
        <div className="fixed z-[60] -translate-y-1/2 pointer-events-none whitespace-nowrap rounded-lg bg-gray-900 text-white text-xs font-medium px-2.5 py-1.5 shadow-lg"
          style={{ top: tooltip.top, left: tooltip.left }}>
          {tooltip.label}
        </div>
      )}
    </aside>
  );
}
