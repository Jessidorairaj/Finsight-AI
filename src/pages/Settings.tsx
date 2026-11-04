import React, { useState } from 'react';
import {
  User,
  Sliders,
  DollarSign,
  Palette,
  Shield,
  Download,
  RotateCcw,
  Server,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useFinancial } from '../context/FinancialContext';
import { api } from '../services/api';

export const Settings: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const {
    transactions,
    budgets,
    goals,
    bills,
    documents,
    resetToSampleData,
  } = useFinancial();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [monthlyIncome, setMonthlyIncome] = useState(String(user?.monthlyIncome || 0));
  const [currency, setCurrency] = useState('₹ INR');
  const [apiUrl, setApiUrl] = useState(
    import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
  );
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState<'idle' | 'connected' | 'offline'>('idle');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const isDark = theme === 'dark';

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      name,
      email,
      monthlyIncome: parseFloat(monthlyIncome) || 48500,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleTestBackend = async () => {
    setIsTestingApi(true);
    try {
      const health = await api.checkHealth();
      if (health && health.status === 'ok') {
        setApiStatus('connected');
      } else {
        setApiStatus('offline');
      }
    } catch {
      setApiStatus('offline');
    } finally {
      setIsTestingApi(false);
    }
  };

  const handleExportAllData = () => {
    const dataToExport = {
      user,
      app: 'FinSight AI',
      exportedAt: new Date().toISOString(),
      metadata: 'Personalized expense forecasting & financial intelligence',
      data: {
        transactions,
        budgets,
        goals,
        bills,
        documents,
      }
    };
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finsight_backup_${Date.now()}.json`;
    link.click();
  };

  const handleResetData = () => {
    if (window.confirm('Reset all transaction entries, budgets, and goals back to the default sample dataset?')) {
      resetToSampleData();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {savedSuccess && (
        <div className="bg-[#00E5BE] text-[#080e1a] px-4 py-2.5 rounded-xl font-bold text-xs shadow-xl flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4" />
          <span>Settings & data storage updated successfully.</span>
        </div>
      )}

      {/* Profile & Baseline Section */}
      <div
        className={`p-6 rounded-2xl border ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-2.5 pb-4 border-b border-inherit mb-5">
          <User className="w-5 h-5 text-[#00E5BE]" />
          <div>
            <h3 className="text-base font-bold">Profile & Financial Baseline</h3>
            <p className="text-xs text-slate-400">Manage user identity and monthly earnings baseline</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                  isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                }`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                  isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Monthly Net Income Baseline (₹)
              </label>
              <input
                type="number"
                value={monthlyIncome}
                onChange={e => setMonthlyIncome(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                  isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                }`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Base Currency Symbol
              </label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                  isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <option value="₹ INR">₹ INR (Indian Rupee - Primary)</option>
                <option value="$ USD">$ USD (US Dollar)</option>
                <option value="€ EUR">€ EUR (Euro)</option>
                <option value="£ GBP">£ GBP (British Pound)</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20"
            >
              Save Profile Changes
            </button>
          </div>
        </form>
      </div>

      {/* Appearance & Theme Section */}
      <div
        className={`p-6 rounded-2xl border ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-2.5 pb-4 border-b border-inherit mb-5">
          <Palette className="w-5 h-5 text-[#00E5BE]" />
          <div>
            <h3 className="text-base font-bold">Theme & Appearance</h3>
            <p className="text-xs text-slate-400">Toggle between the signature dark navy fintech theme and clean light mode</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`p-4 rounded-xl border text-left transition-all ${
              theme === 'dark'
                ? 'bg-[#0a2c35] border-[#00E5BE] text-white shadow-lg shadow-teal-950/40'
                : 'bg-slate-500/10 border-transparent text-slate-400'
            }`}
          >
            <div className="w-6 h-6 rounded-full bg-[#00E5BE] mb-2" />
            <p className="text-xs font-bold">Dark Navy Theme (Default)</p>
            <p className="text-[11px] text-slate-400 mt-1">Deep navy background with neon cyan and teal accents</p>
          </button>

          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`p-4 rounded-xl border text-left transition-all ${
              theme === 'light'
                ? 'bg-teal-50 border-teal-500 text-slate-900 shadow-md'
                : 'bg-slate-500/10 border-transparent text-slate-400'
            }`}
          >
            <div className="w-6 h-6 rounded-full bg-slate-300 border border-slate-400 mb-2" />
            <p className="text-xs font-bold">Light Slate Theme</p>
            <p className="text-[11px] text-slate-500 mt-1">Crisp white backgrounds with readable typography</p>
          </button>
        </div>
      </div>

      {/* Python FastAPI Backend Bridge Config */}
      <div
        className={`p-6 rounded-2xl border ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-2.5 pb-4 border-b border-inherit mb-4">
          <Server className="w-5 h-5 text-sky-400" />
          <div>
            <h3 className="text-base font-bold">Python FastAPI Backend Connection</h3>
            <p className="text-xs text-slate-400">
              Configure endpoints for machine learning forecasting and LLM generation microservices
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1">
              REST API Root Endpoint URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                className={`flex-1 px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                  isDark ? 'bg-[#0a1120] border-slate-800 text-white' : 'bg-slate-50 border-slate-200'
                }`}
              />
              <button
                type="button"
                onClick={handleTestBackend}
                disabled={isTestingApi}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-200 hover:text-white"
              >
                {isTestingApi ? 'Probing...' : 'Test Connection'}
              </button>
            </div>
          </div>

          {apiStatus === 'connected' && (
            <div className="p-3 rounded-xl bg-[#00E5BE]/10 border border-[#00E5BE]/30 text-teal-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#00E5BE]" />
              <span>
                Backend server verified: Express /api/health responding with status "ok" (Service: FinSight AI API).
              </span>
            </div>
          )}
          {apiStatus === 'offline' && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span>
                Server endpoint currently unreachable. Operating seamlessly in offline mode with localStorage data.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Data Export & Privacy */}
      <div
        className={`p-6 rounded-2xl border ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-2.5 pb-4 border-b border-inherit mb-4">
          <Shield className="w-5 h-5 text-purple-400" />
          <div>
            <h3 className="text-base font-bold">Data Privacy & Sovereignty</h3>
            <p className="text-xs text-slate-400">Download your personal financial dataset or reset storage state</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportAllData}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-200 hover:text-white flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download All Data (JSON)</span>
          </button>
          <button
            type="button"
            onClick={handleResetData}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo State</span>
          </button>
        </div>
      </div>
    </div>
  );
};
