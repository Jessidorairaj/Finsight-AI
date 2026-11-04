import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  TrendingUp,
  LineChart,
  Wallet,
  Target,
  Sparkles,
  Bot,
  FileText,
  Settings,
  ShieldCheck,
  ChevronDown,
  LogOut,
  UserCheck,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, logout, switchRole } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [profileMenuOpen, setProfileMenuOpen] = React.useState(false);

  const navItems = [
    { name: 'Overview', path: '/', icon: LayoutDashboard },
    { name: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
    { name: 'Analytics', path: '/analytics', icon: TrendingUp },
    { name: 'Forecast', path: '/forecast', icon: LineChart },
    { name: 'Budgets', path: '/budgets', icon: Wallet },
    { name: 'Goals', path: '/goals', icon: Target },
    { name: 'Insights', path: '/insights', icon: Sparkles },
    { name: 'AI Assistant', path: '/ai-assistant', icon: Bot },
    { name: 'Documents', path: '/documents', icon: FileText },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleToggleRole = () => {
    if (user?.role === 'admin') {
      switchRole('user');
      navigate('/');
    } else {
      switchRole('admin');
      navigate('/admin');
    }
    setProfileMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 flex flex-col transition-all duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${
          theme === 'dark'
            ? 'bg-[#0a1120] border-r border-[#152238] text-slate-300'
            : 'bg-white border-r border-slate-200 text-slate-700 shadow-sm'
        }`}
      >
        {/* Logo and Brand */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-inherit">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00bfa5] to-[#0ea5e9] flex items-center justify-center shadow-lg shadow-teal-500/20">
              <span className="text-white font-extrabold text-xl tracking-tighter">F</span>
            </div>
            <div>
              <div className="flex items-center text-xl font-bold tracking-tight">
                <span className={theme === 'dark' ? 'text-white' : 'text-slate-900'}>FinSight</span>
                <span className="text-[#00E5BE] ml-1 font-extrabold">AI</span>
              </div>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-1.5">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? theme === 'dark'
                        ? 'bg-[#0a2c35] text-[#00E5BE] shadow-sm shadow-teal-950/50 border border-[#00E5BE]/30'
                        : 'bg-[#e6fffa] text-[#00a887] font-semibold border border-teal-200 shadow-sm'
                      : theme === 'dark'
                      ? 'text-slate-400 hover:text-white hover:bg-[#111d35]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.name}</span>
              </NavLink>
            );
          })}

          {/* Admin Dashboard Entry link - visible only to verified administrators */}
          {user?.role === 'admin' && (
            <div className="pt-3 mt-3 border-t border-inherit">
              <NavLink
                to="/admin"
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? theme === 'dark'
                        ? 'bg-purple-950/60 text-purple-300 border border-purple-500/40'
                        : 'bg-purple-50 text-purple-700 border border-purple-200'
                      : theme === 'dark'
                      ? 'text-purple-400/80 hover:text-purple-300 hover:bg-[#111d35]'
                      : 'text-purple-700 hover:text-purple-900 hover:bg-purple-50'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Admin Console</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold bg-purple-500/20 text-purple-400">
                  ADMIN
                </span>
              </NavLink>
            </div>
          )}
        </nav>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-inherit relative">
          <button
            type="button"
            onClick={() => setProfileMenuOpen(prev => !prev)}
            className={`w-full flex items-center justify-between p-2 rounded-xl transition-colors text-left ${
              theme === 'dark'
                ? 'hover:bg-[#111d35]'
                : 'hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#00E5BE]/20 border border-[#00E5BE]/40 text-[#00E5BE] font-bold text-xs flex items-center justify-center shrink-0">
                {user?.avatarInitials || (user?.name ? user.name.slice(0, 2).toUpperCase() : 'U')}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-semibold truncate ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  {user?.name || 'Account'}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {user?.email || 'user@example.com'}
                </p>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
          </button>

          {/* Profile Dropdown Menu */}
          {profileMenuOpen && (
            <div
              className={`absolute bottom-20 left-4 right-4 rounded-xl border p-2 shadow-xl z-50 ${
                theme === 'dark'
                  ? 'bg-[#0f1a2e] border-slate-800 text-slate-200'
                  : 'bg-white border-slate-200 text-slate-800'
              }`}
            >
              <div className="px-3 py-2 text-xs border-b border-inherit mb-1">
                <span className="text-slate-400">Active Role: </span>
                <span className="font-semibold text-[#00E5BE] uppercase">{user?.role}</span>
              </div>

              <button
                type="button"
                onClick={handleToggleRole}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg hover:bg-slate-500/10 transition-colors text-left"
              >
                <UserCheck className="w-3.5 h-3.5 text-[#00E5BE]" />
                <span>Switch to {user?.role === 'admin' ? 'User (Jessi)' : 'Admin Mode'}</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors text-left mt-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
