import React, { useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export const ProtectedLayout: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { theme } = useTheme();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  // Show non-flicker loading screen while session is being verified against /api/auth/me
  if (isLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          theme === 'dark' ? 'bg-[#080e1a] text-slate-100' : 'bg-[#f8fafc] text-slate-800'
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#00E5BE] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Restoring secure session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Guard admin route against non-admin roles
  if (location.pathname === '/admin' && user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  // Get contextual page titles
  const getPageMeta = (pathname: string) => {
    switch (pathname) {
      case '/transactions':
        return { title: 'Transactions Ledger', subtitle: 'Review, filter, categorize, and export your spending' };
      case '/analytics':
        return { title: 'Financial Analytics', subtitle: 'Multi-month trends, category comparisons, and baseline shifts' };
      case '/forecast':
        return { title: 'Predictive Expense Forecast', subtitle: 'Time-series ML forecasting models and scenario simulation' };
      case '/budgets':
        return { title: 'Category Budgets', subtitle: 'Manage envelope limits and track spending pace' };
      case '/goals':
        return { title: 'Financial Savings Goals', subtitle: 'Target milestones, compound growth, and funding timelines' };
      case '/insights':
        return { title: 'AI Insights & Anomaly Detection', subtitle: 'Automated spending patterns and recurring audits' };
      case '/ai-assistant':
        return { title: 'FinSight Conversational Copilot', subtitle: 'Ask contextual financial questions grounded in your ledger' };
      case '/documents':
        return { title: 'Receipt & Document OCR', subtitle: 'Upload invoices and bills for automated field extraction' };
      case '/settings':
        return { title: 'System & Profile Settings', subtitle: 'Currency, preferences, data export, and FastAPI endpoints' };
      case '/admin':
        return { title: 'System Administration & Model Health', subtitle: 'Registered users, inference latencies, and service telemetry' };
      default:
        return {}; // Use default "Good evening, Jessi!" for Dashboard
    }
  };

  const { title, subtitle } = getPageMeta(location.pathname);

  return (
    <div
      className={`min-h-screen flex ${
        theme === 'dark' ? 'bg-[#080e1a] text-slate-100' : 'bg-[#f8fafc] text-slate-800'
      }`}
    >
      {/* Sidebar */}
      <Sidebar
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Workspace */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        <Topbar
          onMenuClick={() => setMobileSidebarOpen(true)}
          title={title}
          subtitle={subtitle}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
