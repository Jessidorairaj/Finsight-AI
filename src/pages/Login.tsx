import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';

export const Login: React.FC = () => {
  const { login, register } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [isRegister, setIsRegister] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDark = theme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isRegister && (!displayName || displayName.trim() === '')) {
      setError('Please provide your full name.');
      return;
    }

    if (!email || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters in length.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isRegister) {
        // Register new account via POST /api/auth/register
        const res = await register(email.trim(), password, displayName.trim());
        if (!res.success) {
          setError(res.error || 'Failed to register account.');
          setIsSubmitting(false);
          return;
        }
        const destination = (location.state as any)?.from?.pathname || '/';
        navigate(destination);
      } else {
        // Sign in via POST /api/auth/login
        const res = await login(email.trim(), password);
        if (!res.success) {
          setError(res.error || 'Invalid email or password.');
          setIsSubmitting(false);
          return;
        }

        if (res.user?.role === 'admin') {
          navigate('/admin');
        } else {
          const destination = (location.state as any)?.from?.pathname || '/';
          navigate(destination);
        }
      }
    } catch {
      setError('An unexpected error occurred while communicating with the server.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center p-4 relative ${
        isDark ? 'bg-[#080e1a] text-slate-100' : 'bg-[#f8fafc] text-slate-800'
      }`}
    >
      {/* Top Bar with theme toggle */}
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Brand Lockup */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#00bfa5] to-[#0ea5e9] flex items-center justify-center shadow-xl shadow-teal-500/25 mx-auto">
            <span className="text-white font-extrabold text-3xl tracking-tighter">F</span>
          </div>
          <div className="flex items-center justify-center text-2xl font-bold tracking-tight">
            <span>FinSight</span>
            <span className="text-[#00E5BE] ml-1 font-extrabold">AI</span>
          </div>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Personalized Expense Forecasting and Financial Intelligence
          </p>
        </div>

        {/* Card */}
        <div
          className={`p-8 rounded-3xl border shadow-2xl transition-all ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200'
          }`}
        >
          <div className="mb-4">
            <h2 className="text-lg font-bold text-white">
              {isRegister ? 'Create FinSight Account' : 'Sign In'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isRegister
                ? 'Register your account to access your private financial workspace.'
                : 'Enter your verified credentials to access your financial dashboard.'}
            </p>
          </div>

          {/* Truthful Server Authentication Banner */}
          <div className="mb-5 p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs leading-relaxed flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#00E5BE] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white">Backend Authentication Active: </span>
              Secured by Express server sessions, bcrypt password hashing, HTTP-only cookies, and Neon PostgreSQL user isolation.
            </div>
          </div>

          {error && (
            <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Enter your full name"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-xs border focus:outline-none ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                    }`}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-xs border focus:outline-none ${
                    isDark
                      ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full pl-10 pr-10 py-2.5 rounded-xl text-xs border focus:outline-none ${
                    isDark
                      ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/25 flex items-center justify-center gap-1.5 transition-transform active:scale-95 disabled:opacity-50 mt-2"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-[#080e1a] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isRegister ? 'Create Account' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Toggle between Sign In and Registration */}
          <div className="pt-5 mt-5 border-t border-inherit text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className="text-xs font-semibold text-slate-400 hover:text-[#00E5BE] transition-colors"
            >
              {isRegister
                ? 'Already have an account? Sign In →'
                : "Don't have an account yet? Create Account →"}
            </button>
          </div>
        </div>

        {/* Tagline Footer */}
        <p className="text-center text-xs text-slate-500">
          “Don’t just track where your money went — understand where it’s going.”
        </p>
      </div>
    </div>
  );
};
