import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Menu, X, ChevronDown, LogOut, User, LayoutDashboard,
  Bell, Calendar, FileText, Tag, CheckCheck, ChevronUp, GraduationCap,
  Sun, Moon, UserPlus,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useAuthModal } from "../context/AuthModalContext";
import { useNotifications, AppNotification } from "../context/NotificationContext";
import { useTheme } from "../context/ThemeContext";

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  meeting: <Calendar className="w-4 h-4 text-[#0d1b4b]" />,
  application: <FileText className="w-4 h-4 text-emerald-600" />,
  discount: <Tag className="w-4 h-4 text-amber-500" />,
  lead: <UserPlus className="w-4 h-4 text-purple-600" />,
};

const NOTIF_COLORS: Record<string, string> = {
  meeting: "bg-blue-50",
  application: "bg-emerald-50",
  discount: "bg-amber-50",
  lead: "bg-purple-50",
};

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const { open } = useAuthModal();
  const { notifications, unreadCount, markRead, markAllRead, dismiss, clearAll } = useNotifications();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const updateScrollButtons = () => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  };

  useEffect(() => {
    if (notifOpen) setTimeout(updateScrollButtons, 50);
    else { setCanScrollUp(false); setCanScrollDown(false); }
  }, [notifOpen, notifications]);

  const scrollList = (dir: "up" | "down") => {
    listRef.current?.scrollBy({ top: dir === "down" ? 160 : -160, behavior: "smooth" });
    setTimeout(updateScrollButtons, 200);
  };

  function handleNotifClick(n: AppNotification) {
    markRead(n.id);
    setNotifOpen(false);
    if (n.link) navigate(n.link);
  }

  const handleLogout = () => {
    logout();
    navigate("/");
    setProfileOpen(false);
  };

  const dashboardPath =
    user?.role === "counselor" ? "/counselor" :
    user?.role === "admin" ? (user.isAppTeam ? "/appteam" : "/admin") : "/student";

  const displayName = (user?.role === "admin" && location.pathname.startsWith("/appteam"))
    ? "Applications"
    : user?.name ?? "";

  const scrollToHowItWorks = (e: React.MouseEvent) => {
    setMenuOpen(false);
    if (location.pathname === "/") {
      e.preventDefault();
      document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const navLinks = [
    { to: "/", label: "Home", active: location.pathname === "/" },
    { to: "/universities", label: "Browse Programs", active: location.pathname === "/universities" },
    { to: "/resources", label: "Resources", active: location.pathname.startsWith("/resources") },
  ];

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">

          {/* Logo + nav links */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2 mr-8">
              <div className="w-9 h-9 bg-[#0d1b4b] rounded-xl flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-extrabold tracking-tight select-none">
                <span className="text-[#0d1b4b]">Grad</span><span className="text-blue-500">zest</span>
              </span>
            </Link>

            <div className="hidden md:flex items-stretch h-16">
              {navLinks.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`relative flex items-center px-4 text-sm font-medium transition-colors border-b-2 ${
                    link.active
                      ? "text-[#0d1b4b] border-[#0d1b4b]"
                      : "text-gray-500 border-transparent hover:text-gray-900 hover:border-gray-300"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <a
                href="/#how-it-works"
                onClick={scrollToHowItWorks}
                className="flex items-center px-4 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-gray-900 hover:border-gray-300 transition-colors"
              >
                How It Works
              </a>
              {isAuthenticated && (
                <Link
                  to={dashboardPath}
                  className={`relative flex items-center px-4 text-sm font-medium transition-colors border-b-2 ${
                    location.pathname.startsWith(dashboardPath)
                      ? "text-[#0d1b4b] border-[#0d1b4b]"
                      : "text-gray-500 border-transparent hover:text-gray-900 hover:border-gray-300"
                  }`}
                >
                  Dashboard
                </Link>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            {isAuthenticated && (
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setNotifOpen(!notifOpen)}
                  className="relative p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  aria-label="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <span className="text-sm font-semibold text-gray-900">Notifications</span>
                      <div className="flex items-center gap-3">
                        {unreadCount > 0 && (
                          <button type="button" onClick={markAllRead}
                            className="flex items-center gap-1 text-xs text-[#0d1b4b] hover:underline font-medium">
                            <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button type="button" onClick={clearAll}
                            className="text-xs text-red-500 hover:underline font-medium">
                            Clear all
                          </button>
                        )}
                      </div>
                    </div>

                    {canScrollUp && (
                      <button type="button" onClick={() => scrollList("up")} aria-label="Scroll up"
                        className="w-full flex items-center justify-center py-1.5 bg-gray-50 hover:bg-gray-100 border-b border-gray-100 transition-colors">
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      </button>
                    )}

                    <div ref={listRef} onScroll={updateScrollButtons}
                      className="max-h-80 overflow-y-auto divide-y divide-gray-50 scroll-smooth">
                      {notifications.length === 0 ? (
                        <div className="py-10 text-center text-sm text-gray-400">
                          <Bell className="w-7 h-7 mx-auto mb-2 text-gray-300" />
                          No notifications yet
                        </div>
                      ) : (
                        notifications.map(n => {
                          const priority = (n as any).priority || 'normal';
                          const priorityDot = priority === 'urgent' ? 'bg-red-500' : priority === 'normal' ? 'bg-blue-500' : 'bg-gray-400';
                          const bgColor = !n.read ? (priority === 'urgent' ? 'bg-red-50/50' : 'bg-blue-50/40') : '';
                          return (
                          <div key={n.id}
                            className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${bgColor}`}
                            onClick={() => handleNotifClick(n)}>
                            <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${NOTIF_COLORS[n.type]}`}>
                              {NOTIF_ICONS[n.type]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-xs font-semibold leading-snug ${!n.read ? "text-gray-900" : "text-gray-700"}`}>
                                  {n.title}
                                </p>
                                <button type="button" aria-label="Dismiss notification" onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                                  className="text-gray-300 hover:text-gray-500 flex-shrink-0 mt-0.5">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                              <div className="flex items-center justify-between mt-1">
                                <p className="text-[10px] text-gray-400">{timeAgo(n.timestamp)}</p>
                                {n.link && <span className="text-[10px] font-semibold text-blue-500">View →</span>}
                              </div>
                            </div>
                            {!n.read && <span className={`mt-1.5 w-2 h-2 ${priorityDot} rounded-full flex-shrink-0 animate-pulse`} />}
                          </div>
                          );
                        })
                      )}
                    </div>

                    {canScrollDown && (
                      <button type="button" onClick={() => scrollList("down")} aria-label="Scroll down"
                        className="w-full flex items-center justify-center py-1.5 bg-gray-50 hover:bg-gray-100 border-t border-gray-100 transition-colors">
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Auth area */}
            {isAuthenticated ? (
              <div className="relative">
                <button type="button" onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="w-8 h-8 bg-[#0d1b4b] rounded-full flex items-center justify-center text-white text-sm font-semibold">
                    {displayName.charAt(0)}
                  </div>
                  <span className="hidden md:block text-sm font-medium text-gray-700">
                    {displayName.split(" ")[0]}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
                    <div className="px-4 py-2.5 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                      <p className="text-xs text-gray-400 capitalize mt-0.5">{user?.role}</p>
                    </div>
                    <Link to={dashboardPath} onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                      <LayoutDashboard className="w-4 h-4 text-gray-400" /> Dashboard
                    </Link>
                    {user?.role === "student" && (
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
            ) : (
              <>
                <button type="button" onClick={() => open("login")}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                  Log In
                </button>
                <button type="button" onClick={() => open("register")}
                  className="hidden md:block bg-[#0d1b4b] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#152258] transition-colors">
                  Get Started
                </button>
              </>
            )}

            <button type="button" aria-label="Toggle dark mode" onClick={toggleTheme}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button type="button" aria-label="Toggle menu" onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden pb-3 pt-2 border-t border-gray-100">
            <div className="space-y-0.5">
              <Link to="/" onClick={() => setMenuOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Home</Link>
              <Link to="/universities" onClick={() => setMenuOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Browse Programs</Link>
              <Link to="/resources" onClick={() => setMenuOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Resources</Link>
              <a href="/#how-it-works" onClick={scrollToHowItWorks}
                className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">How It Works</a>
              {isAuthenticated ? (
                <>
                  <Link to={dashboardPath} onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Dashboard</Link>
                  <button type="button" onClick={handleLogout}
                    className="block w-full text-left px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">Sign Out</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => { setMenuOpen(false); open("login"); }}
                    className="block w-full text-left px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Log In</button>
                  <button type="button" onClick={() => { setMenuOpen(false); open("register"); }}
                    className="block w-full text-left px-3 py-2.5 text-sm font-semibold text-[#0d1b4b] hover:bg-blue-50 rounded-lg">Get Started</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
