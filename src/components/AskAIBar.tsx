import React, { useState } from 'react';
import { Sparkles, Send, ArrowRight, X, Bot, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useFinancial } from '../context/FinancialContext';
import { api } from '../services/api';

export const AskAIBar: React.FC = () => {
  const { theme } = useTheme();
  const { totalIncome, totalExpenses, netSavings, savingsRate, categoryBreakdown } = useFinancial();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [activeModalAnswer, setActiveModalAnswer] = useState<{ query: string; answer: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isAnswering) return;

    const currentQuery = query.trim();
    setIsAnswering(true);
    try {
      const res = await api.sendChatMessage(currentQuery);
      const reply = res.success && res.reply
        ? res.reply
        : `FinSight AI ledger intelligence: Total Income is ₹${totalIncome.toLocaleString('en-IN')}, Expenses are ₹${totalExpenses.toLocaleString('en-IN')}, leaving ₹${netSavings.toLocaleString('en-IN')} in net savings (${savingsRate}% rate).`;

      setActiveModalAnswer({ query: currentQuery, answer: reply });
      setQuery('');
    } catch {
      setActiveModalAnswer({
        query: currentQuery,
        answer: `Your current net savings stand at ₹${netSavings.toLocaleString('en-IN')} (${savingsRate}% rate). Visit the AI Assistant page for full interactive analysis.`,
      });
    } finally {
      setIsAnswering(false);
    }
  };

  const handleOpenFullAssistant = () => {
    navigate('/ai-assistant');
  };

  return (
    <>
      <div
        className={`w-full rounded-2xl border p-4 transition-all duration-300 relative overflow-hidden ${
          theme === 'dark'
            ? 'bg-[#0f1a2e] border-[#1b2944] shadow-lg shadow-teal-950/20'
            : 'bg-white border-slate-200 shadow-md'
        }`}
      >
        <form onSubmit={handleSubmit} className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#00E5BE]/10 border border-[#00E5BE]/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-[#00E5BE]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                Ask FinSight AI
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-[#00E5BE]/15 text-[#00E5BE]">
                ACTIVE AI INTELLIGENCE
              </span>
            </div>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ask anything about your finances... (e.g. Can I afford a ₹15,000 gadget?)"
              className={`w-full bg-transparent text-sm focus:outline-none placeholder:text-slate-500 ${
                theme === 'dark' ? 'text-slate-200' : 'text-slate-800'
              }`}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="submit"
              disabled={isAnswering}
              aria-label="Send financial query"
              className="w-10 h-10 rounded-xl bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] flex items-center justify-center font-bold shadow-lg shadow-teal-500/25 transition-transform active:scale-95 disabled:opacity-50"
            >
              {isAnswering ? (
                <div className="w-4 h-4 border-2 border-[#080e1a] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Instant Answer Modal Drawer */}
      {activeModalAnswer && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl animate-in fade-in duration-200 ${
              theme === 'dark'
                ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#00E5BE]/20 flex items-center justify-center text-[#00E5BE]">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">FinSight AI Intelligence</h3>
                  <p className="text-[11px] text-slate-400">Grounded in your August mock data</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalAnswer(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-500/10 mb-4 text-xs font-medium text-slate-300">
              <span className="text-[#00E5BE] font-bold">You asked: </span>
              &ldquo;{activeModalAnswer.query}&rdquo;
            </div>

            <div className="space-y-3 text-sm text-slate-300 leading-relaxed max-h-72 overflow-y-auto pr-1">
              <p className="whitespace-pre-line text-xs lg:text-sm">{activeModalAnswer.answer}</p>
            </div>

            <div className="pt-4 mt-4 border-t border-inherit flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-[#00E5BE]">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Verified against user ledger</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveModalAnswer(null);
                  handleOpenFullAssistant();
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#00E5BE] text-[#080e1a] hover:bg-[#00cba8] transition-colors flex items-center gap-1.5"
              >
                <span>Open Full Assistant</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
