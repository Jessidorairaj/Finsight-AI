import React, { useState, useEffect } from 'react';
import {
  Users,
  Activity,
  Server,
  Cpu,
  Layers,
  CheckCircle,
  Clock,
  ShieldAlert,
  ArrowUpRight,
  TrendingUp,
  Database
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { AdminStats, mockRecentRegistrations } from '../data/mockData';

export const AdminDashboard: React.FC = () => {
  const { theme } = useTheme();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const isDark = theme === 'dark';

  useEffect(() => {
    const fetchStats = async () => {
      const data = await api.getAdminStats();
      setStats(data);
      setLoading(false);
    };
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Admin Notice Banner */}
      <div
        className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
          isDark
            ? 'bg-[#0f1a2e] border-purple-500/30 text-purple-200'
            : 'bg-purple-50 border-purple-200 text-purple-900 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300">
              System Administration Console (Privacy Sandboxed)
            </h3>
            <p className="text-xs text-slate-300">
              Aggregated platform telemetry and ML service latency. Individual user transactions are strictly encrypted and anonymized.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 uppercase">
          Service Cluster: AP-SOUTH-1
        </span>
      </div>

      {/* Primary Telemetry Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Registered Users</p>
              <h3 className="text-2xl font-bold tabular-nums mt-0.5">
                {stats?.totalRegisteredUsers.toLocaleString() || '1,420'}
              </h3>
            </div>
          </div>
          <p className="text-xs text-[#00E5BE] font-semibold mt-2.5 flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+14.2% month-over-month</span>
          </p>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00E5BE]/10 text-[#00E5BE] flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Active DAU / MAU</p>
              <h3 className="text-2xl font-bold tabular-nums mt-0.5">
                {stats?.activeUsers.toLocaleString() || '892'}
              </h3>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2.5">62.8% 30-day engagement ratio</p>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Processed Transactions</p>
              <h3 className="text-2xl font-bold tabular-nums mt-0.5">
                {stats?.transactionsProcessed.toLocaleString() || '54,310'}
              </h3>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2.5">Across banking & statement ingest</p>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-300 flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Avg Inference Latency</p>
              <h3 className="text-2xl font-bold tabular-nums mt-0.5">
                {stats?.avgInferenceTimeMs || 42} ms
              </h3>
            </div>
          </div>
          <p className="text-xs text-[#00E5BE] font-semibold mt-2.5">Sub-50ms SLA Target</p>
        </div>
      </div>

      {/* Microservice Health Status */}
      <div
        className={`p-6 rounded-2xl border ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <h3 className="text-base font-bold tracking-tight mb-1">Microservices & AI Models Health</h3>
        <p className="text-xs text-slate-400 mb-4">Live operational heartbeat for the FinSight intelligence stack</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-500/10 border border-inherit">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white">XGBoost Transaction Categorizer</span>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-[#00E5BE]/20 text-[#00E5BE]">
                ONLINE
              </span>
            </div>
            <p className="text-xs text-slate-400">Classification Accuracy: 98.4%</p>
            <p className="text-[11px] text-slate-500 mt-1">Trained on 42,000 Indian UPI descriptions</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-500/10 border border-inherit">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white">Prophet / LSTM Forecaster</span>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-[#00E5BE]/20 text-[#00E5BE]">
                ONLINE
              </span>
            </div>
            <p className="text-xs text-slate-400">Mean Absolute Error: ₹284.10</p>
            <p className="text-[11px] text-slate-500 mt-1">95% confidence intervals enabled</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-500/10 border border-inherit">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white">Document OCR Engine (Tesseract)</span>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-[#00E5BE]/20 text-[#00E5BE]">
                HEALTHY
              </span>
            </div>
            <p className="text-xs text-slate-400">Pipeline Queue: 0 pending</p>
            <p className="text-[11px] text-slate-500 mt-1">Average extraction runtime: 1.2s</p>
          </div>
        </div>
      </div>

      {/* Recent User Registrations (Privacy-safe) */}
      <div
        className={`p-6 rounded-2xl border ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-inherit mb-3">
          <div>
            <h3 className="text-base font-bold tracking-tight">Recent User Registrations</h3>
            <p className="text-xs text-slate-400">Anonymized user audit log (no individual ledger contents shown)</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-inherit">
                <th className="py-2.5 px-3">User ID</th>
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Email Domain</th>
                <th className="py-2.5 px-3">Registration Time</th>
                <th className="py-2.5 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-inherit">
              {mockRecentRegistrations.map(r => (
                <tr key={r.id} className="hover:bg-slate-500/5">
                  <td className="py-3 px-3 font-mono text-slate-400">{r.id}</td>
                  <td className="py-3 px-3 font-bold text-white">{r.name}</td>
                  <td className="py-3 px-3 text-slate-300">{r.email}</td>
                  <td className="py-3 px-3 text-slate-400">{r.joined}</td>
                  <td className="py-3 px-3 text-right">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#00E5BE]/20 text-[#00E5BE]">
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
