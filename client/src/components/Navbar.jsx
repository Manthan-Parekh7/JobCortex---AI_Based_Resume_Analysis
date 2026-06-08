import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import { Menu, X, Sun, Moon } from "lucide-react"; // icons for mobile menu
import { Link, useNavigate, useLocation } from "react-router-dom";
import { BarLoader } from "react-spinners";
import { useState } from "react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, DropdownMenuPortal } from "./ui/dropdown-menu";

const Navbar = ({ onCandidateLoginClick }) => {
  const { user, loading, logout } = useAuth();
  const { setTheme } = useTheme();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation(); // Get current location

  const handleLogout = () => {
    logout();
  };

  const candidateLinks = [
    { href: "/jobs", label: "Find Jobs" },
    { href: "/applications", label: "My Applications" },
    { href: "/resume-analysis", label: "Resume Analysis" },
    { href: "/edit-profile", label: "My Profile" },
  ];

  const recruiterLinks = [
    { href: "/recruiter/post-job", label: "Post Job" },
    { href: "/recruiter/company-profile", label: "Company Profile" },
    { href: "/recruiter/applications", label: "Job Applications" },
  ];

  const currentLinks = user?.role === "recruiter"
    ? recruiterLinks
    : user?.role === "candidate"
      ? candidateLinks
      : []; // Show no links if user has no role (onboarding state)

  const getLinkClasses = (href) => {
    const baseClasses = "font-medium transition-all duration-300 px-3 py-2 rounded-xl relative overflow-hidden";
    const activeClasses = "text-primary bg-primary/10 shadow-sm border border-primary/20";
    const inactiveClasses = "text-foreground/80 hover:text-primary hover:bg-primary/5 hover:shadow-sm";

    // Handle root path specifically
    if (href === "/") {
      return `${baseClasses} ${location.pathname === href ? activeClasses : inactiveClasses}`;
    }

    // For other paths, check if the current path starts with the link's href
    // This handles nested routes like /recruiter/post-job when /recruiter is active
    if (location.pathname.startsWith(href) && href !== "/") {
      return `${baseClasses} ${activeClasses}`;
    }
    return `${baseClasses} ${inactiveClasses}`;
  };

  const logoHref = user?.role === "recruiter" ? "/recruiter" : "/";

  return (
    <nav className="fixed top-0 left-0 right-0 backdrop-blur-xl bg-background/80 border-b border-border/50 px-4 md:px-6 py-4 flex justify-between items-center z-50 transition-all duration-300 shadow-sm">
      {/* Logo */}
      <Link to={logoHref} className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent cursor-pointer select-none hover:scale-105 transition-transform duration-300">
        JobCortex
      </Link>

      {/* Desktop links */}
      <div className="hidden md:flex gap-8">
        {!loading &&
          user &&
          currentLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={getLinkClasses(link.href)}
            >
              {link.label}
            </Link>
          ))}
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-4">
        {loading && (
          <div className="flex items-center">
            <BarLoader color="#36d7b7" height={4} width={40} />
          </div>
        )}

        {!loading && !user && (
          <div className="hidden md:flex items-center gap-4">
            <Button
              onClick={onCandidateLoginClick}
              variant="default"
              size="sm"
              className="font-semibold shadow-lg hover:shadow-xl rounded-xl px-6 py-2 transition-all duration-300 hover:scale-105"
            >
              Login / Signup
            </Button>
          </div>
        )}

        {!loading && user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-12 w-12 rounded-full p-0 hover:shadow-lg transition-all duration-300 hover:scale-105">
                {user.image ? (
                  <div
                    className="h-full w-full rounded-full bg-cover bg-center border-2 border-primary/20 hover:border-primary/40 transition-colors"
                    style={{ backgroundImage: `url(${user.image})` }}
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-muted text-foreground flex items-center justify-center text-lg font-bold border-2 border-border hover:border-border/60 transition-colors">
                    {user.username?.[0]?.toUpperCase()}
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 border-border bg-card/95 backdrop-blur-xl rounded-2xl shadow-2xl p-2" align="end" forceMount>
              <DropdownMenuLabel className="font-normal p-4">
                <div className="flex flex-col space-y-2">
                  <p className="text-sm font-semibold leading-none text-foreground">{user.username}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border/50" />
              <DropdownMenuItem asChild className="rounded-xl m-1 cursor-pointer hover:bg-accent/50 transition-colors">
                <Link to={user.role === 'recruiter' ? '/recruiter/profile' : '/edit-profile'} className="w-full">My Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="rounded-xl m-1 cursor-pointer hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors">
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Theme Toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-accent/50 transition-all duration-300 hover:scale-105">
              <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-border bg-card/95 backdrop-blur-xl rounded-2xl shadow-xl">
            <DropdownMenuItem onClick={() => setTheme("light")} className="rounded-xl cursor-pointer hover:bg-accent/50 transition-colors">
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")} className="rounded-xl cursor-pointer hover:bg-accent/50 transition-colors">
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")} className="rounded-xl cursor-pointer hover:bg-accent/50 transition-colors">
              System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 rounded-xl text-foreground hover:bg-accent/50 transition-all duration-300 hover:scale-105"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
        >
          {isMobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      {isMobileOpen && (
        <div className="absolute top-full left-0 right-0 bg-background/95 backdrop-blur-xl border-b border-border shadow-2xl md:hidden rounded-b-2xl mx-2">
          <div className="flex flex-col items-center py-6 space-y-4 w-full px-4">
            {!loading &&
              user &&
              currentLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`${getLinkClasses(link.href)} w-full text-center`}
                  onClick={() => setIsMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            {!loading && !user && (
              <div className="flex flex-col gap-4 w-full">
                <Button
                  onClick={() => { onCandidateLoginClick(); setIsMobileOpen(false); }}
                  variant="default"
                  size="sm"
                  className="font-semibold shadow-lg rounded-xl w-full py-3 transition-all duration-300 hover:scale-105"
                >
                  Login / Signup
                </Button>
              </div>
            )}
            {!loading && user && (
              <div className="flex flex-col gap-4 w-full">
                <div className="text-center py-2">
                  <span className="text-foreground font-semibold">
                    Hi, {user.username}
                  </span>
                </div>
                {user.role === "recruiter" && (
                  <Button
                    onClick={() => { navigate("/recruiter/post-job"); setIsMobileOpen(false); }}
                    variant="default"
                    size="sm"
                    className="font-semibold shadow-lg rounded-xl w-full py-3 transition-all duration-300 hover:scale-105"
                  >
                    Post Job
                  </Button>
                )}
                <Button
                  onClick={() => { handleLogout(); setIsMobileOpen(false); }}
                  variant="outline"
                  size="sm"
                  className="font-semibold rounded-xl w-full py-3 border-border hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-all duration-300"
                >
                  Logout
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;