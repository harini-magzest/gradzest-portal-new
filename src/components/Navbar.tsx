import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, X, ChevronDown, LogOut, User, LayoutDashboard, GraduationCap } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useAuthModal } from "../context/AuthModalContext";
import NotificationBell from "./NotificationBell";

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const { open } = useAuthModal();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

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
    e.preventDefault();
    setMenuOpen(false);
    if (location.pathname === "/") {
      document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate({ pathname: "/", hash: "#how-it-works" });
    }
  };

  const navLinks = [
    { to: "/", label: "Home", active: location.pathname === "/" },
    { to: "/universities", label: "Browse Programs", active: location.pathname === "/universities" },
    { to: "/resources", label: "Resources", active: location.pathname.startsWith("/resources") },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
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
            {isAuthenticated && <NotificationBell />}

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
