import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  User,
  Send,
  Sparkles,
  HelpCircle,
  CheckCircle,
  RefreshCw,
  CornerDownLeft,
  ShieldCheck,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useFinancial } from '../context/FinancialContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  grounded?: boolean;
  engineUsed?: 'gemini' | 'grounded-engine';
}

export const AIAssistant: React.FC = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const {
    totalIncome,
    totalExpenses,
    netSavings,
    savingsRate,
    categoryBreakdown,
  } = useFinancial();

  const userName = user?.name || 'there';
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm_intro',
      sender: 'assistant',
      text: `Hello ${userName}! I am your FinSight AI financial intelligence co-pilot. I am continuously grounded in your database ledger (Total Income: ₹${totalIncome.toLocaleString('en-IN')}, Expenses: ₹${totalExpenses.toLocaleString('en-IN')}, Net Savings: ₹${netSavings.toLocaleString('en-IN')}, Savings Rate: ${savingsRate}%).\n\nAsk me anything about your spending summaries, category budgets, savings goals, upcoming bills, or whether you can afford an upcoming expense.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      grounded: true,
      engineUsed: 'gemini',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isDark = theme === 'dark';

  // Mode Selector State (Persisted in localStorage)
  const [chatMode, setChatMode] = useState<'auto' | 'gemini' | 'engine'>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('finsight_chat_mode');
      if (saved === 'gemini' || saved === 'engine' || saved === 'auto') {
        return saved;
      }
    }
    return 'auto';
  });

  const handleSetChatMode = (newMode: 'auto' | 'gemini' | 'engine') => {
    setChatMode(newMode);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('finsight_chat_mode', newMode);
    }
  };

  const promptSuggestions = [
    "What were my total expenses this month?",
    "How much did I earn last month?",
    "How much is left after last month's expenses?",
    "How much did I spend on food this month?",
    "Am I over budget?",
    "Can I afford a ₹15,000 gadget this month?",
    "Show my upcoming bills and recurring payments",
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userText = textToSend.trim();
    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);
    setErrorMessage(null);

    // Format validated chat history for backend (last 6 messages)
    const historyPayload = messages
      .filter(m => m.id !== 'm_intro')
      .slice(-6)
      .map(m => ({
        role: m.sender as 'user' | 'assistant',
        content: m.text,
      }));

    try {
      const res = await api.sendChatMessage(userText, historyPayload, undefined, chatMode);

      if (res.success && res.reply) {
        const assistantMsg: Message = {
          id: `ai_${Date.now()}`,
          sender: 'assistant',
          text: res.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          grounded: res.grounded !== false,
          engineUsed: res.engineUsed || 'grounded-engine',
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        const errorText = res.error || 'Failed to connect to financial intelligence service.';
        setErrorMessage(errorText);
        const assistantErrorMsg: Message = {
          id: `ai_err_${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ **Unable to complete request in ${chatMode.toUpperCase()} mode**: ${errorText}\n\nPlease try asking again or switch to another mode (e.g. "FinSight Engine" or "Auto").`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          grounded: false,
        };
        setMessages(prev => [...prev, assistantErrorMsg]);
      }
    } catch (err) {
      const errStr = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setErrorMessage(errStr);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto flex flex-col h-[calc(100vh-160px)]">
      {/* Top Advisory Banner */}
      <div
        className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#00E5BE]/20 text-[#00E5BE] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <span>FinSight AI Grounded Conversational Copilot</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00E5BE]/10 text-[#00E5BE] uppercase font-semibold">
                Mode: {chatMode.toUpperCase()}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Grounded in your active live ledger (Income: ₹{totalIncome.toLocaleString('en-IN')}, Expenses: ₹{totalExpenses.toLocaleString('en-IN')}).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          {/* Mode Selector Segmented Control */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-900/80 border border-slate-700/60 shadow-inner">
            <button
              type="button"
              onClick={() => handleSetChatMode('auto')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                chatMode === 'auto'
                  ? 'bg-[#00E5BE] text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Auto: Use Gemini AI when available, with automatic failover to FinSight Engine"
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => handleSetChatMode('gemini')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                chatMode === 'gemini'
                  ? 'bg-[#00E5BE] text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Gemini: Require Gemini AI (returns clear error if unavailable)"
            >
              Gemini
            </button>
            <button
              type="button"
              onClick={() => handleSetChatMode('engine')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                chatMode === 'engine'
                  ? 'bg-[#00E5BE] text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="FinSight Engine: Deterministic, database-grounded financial engine"
            >
              FinSight Engine
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              setMessages([
                {
                  id: 'm_intro_reset',
                  sender: 'assistant',
                  text: 'Conversation reset. Ready for your next query regarding your current finances.',
                  timestamp: 'Just now',
                  grounded: true,
                },
              ])
            }
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 shrink-0 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="Reset conversation"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>

      {/* Suggested Questions Quick Strip */}
      <div className="shrink-0 flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-[11px] font-semibold text-slate-400 shrink-0">Try asking:</span>
        {promptSuggestions.map((q, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(q)}
            className={`text-xs px-3 py-1.5 rounded-xl border transition-all text-left whitespace-nowrap shrink-0 ${
              isDark
                ? 'bg-[#0f1a2e] border-slate-800 text-slate-300 hover:border-[#00E5BE] hover:text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:border-teal-500 shadow-sm'
            }`}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Chat Messages Log */}
      <div
        className={`flex-1 overflow-y-auto rounded-2xl border p-5 space-y-4 ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        {messages.map(m => {
          const isAI = m.sender === 'assistant';
          return (
            <div
              key={m.id}
              className={`flex items-start gap-3 ${isAI ? 'justify-start' : 'justify-end'}`}
            >
              {isAI && (
                <div className="w-8 h-8 rounded-xl bg-[#00E5BE]/20 text-[#00E5BE] border border-[#00E5BE]/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-xl rounded-2xl p-4 text-xs leading-relaxed ${
                  isAI
                    ? isDark
                      ? 'bg-[#0a1120] border border-slate-800 text-slate-200'
                      : 'bg-slate-50 border border-slate-200 text-slate-800'
                    : 'bg-[#00E5BE] text-[#080e1a] font-medium shadow-md shadow-teal-500/10'
                }`}
              >
                <p className="whitespace-pre-line">{m.text}</p>
                <div className="mt-2 flex items-center justify-between text-[10px] opacity-70">
                  <span>{m.timestamp}</span>
                  {isAI && (
                    <div className="flex items-center gap-2">
                      {m.grounded && (
                        <span className="flex items-center gap-1 text-[#00E5BE] font-semibold">
                          <CheckCircle className="w-3 h-3" />
                          <span>Ledger Grounded</span>
                        </span>
                      )}
                      {m.engineUsed && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-slate-300 border border-slate-700/50 flex items-center gap-1">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              m.engineUsed === 'gemini' ? 'bg-[#00E5BE]' : 'bg-amber-400'
                            }`}
                          />
                          {m.engineUsed === 'gemini' ? 'Gemini' : 'FinSight Engine'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {!isAI && (
                <div className="w-8 h-8 rounded-xl bg-slate-700 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  {(user?.name || user?.email || 'U').slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#00E5BE]/20 text-[#00E5BE] flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-3 rounded-2xl bg-slate-500/10 text-xs text-slate-400 flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-[#00E5BE] border-t-transparent rounded-full animate-spin" />
              <span>Analyzing live database ledger & computing scenarios...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error alert if request failed */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-slate-400 hover:text-white text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Input Box Footer */}
      <form
        onSubmit={e => {
          e.preventDefault();
          handleSendMessage(inputText);
        }}
        className={`p-3 rounded-2xl border flex items-center gap-3 shrink-0 ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder="Ask a question about your spending, budget, or forecast..."
          className={`flex-1 bg-transparent text-xs px-3 py-2 focus:outline-none placeholder:text-slate-500 ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}
        />

        <button
          type="submit"
          disabled={!inputText.trim() || isLoading}
          className="px-4 py-2.5 rounded-xl bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] font-bold text-xs flex items-center gap-1.5 transition-transform active:scale-95 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
