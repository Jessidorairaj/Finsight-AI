import React, { useState, useRef, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  Download,
  Upload,
  Trash2,
  Edit2,
  Check,
  X,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  RefreshCw,
  FileText,
  Loader2,
  Database,
  ArrowDownToLine,
  Archive,
  Repeat,
  Play,
  Pause,
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useFinancial } from '../context/FinancialContext';
import { Transaction, RecurringTransaction } from '../data/mockData';
import { parseCSVStatement, getSampleBankCSV, CSVParseSummary } from '../services/csvParser';
import { formatStandardDate, isTransactionInSelectedMonth, getCurrentMonthLabel, parseTransactionDate } from '../utils/dateUtils';

export const Transactions: React.FC = () => {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const {
    transactions,
    selectedMonth,
    setSelectedMonth,
    availableMonths,
    transactionsLoading,
    transactionsError,
    refreshTransactions,
    localRecoveryStatus,
    importLocalTransactionsToCloud,
    addTransaction,
    addTransactions,
    updateTransaction,
    deleteTransaction,
    recurringTransactions,
    recurringLoading,
    recurringError,
    refreshRecurringTransactions,
    addRecurringTransaction,
    updateRecurringTransaction,
    toggleRecurringTransactionStatus,
    processRecurringTransaction,
    deleteRecurringTransaction,
  } = useFinancial();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'income' | 'expense'>('All');
  const [monthFilterMode, setMonthFilterMode] = useState<'selected' | 'all'>('selected');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  // Local Historical Data Recovery State
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isImportingLocal, setIsImportingLocal] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [hasDismissedRecovery, setHasDismissedRecovery] = useState(false);

  // Delete Confirmation Modal State
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Async Mutation & Action States
  const [isSaving, setIsSaving] = useState(false);
  const [isCommittingCSV, setIsCommittingCSV] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    currentBatch: number;
    totalBatches: number;
    processedCount: number;
    totalCount: number;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Genuine CSV Import State
  const [csvSummary, setCsvSummary] = useState<CSVParseSummary | null>(null);
  const [isParsingCSV, setIsParsingCSV] = useState(false);
  const [csvFileError, setCsvFileError] = useState<string | null>(null);
  const [excludeDuplicates, setExcludeDuplicates] = useState(true);
  const [importSuccessToast, setImportSuccessToast] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeReadIdRef = useRef<number>(0);
  const [fileInputKey, setFileInputKey] = useState<number>(0);

  // Form state & Validation
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState<Transaction['category']>('Food & Dining');
  const [formType, setFormType] = useState<'income' | 'expense'>('expense');
  const [formDate, setFormDate] = useState(() => formatStandardDate(new Date()));
  const [formPaymentMethod, setFormPaymentMethod] = useState('UPI');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');

  // View mode switcher: All Transactions vs Recurring Schedules
  const [ledgerView, setLedgerView] = useState<'transactions' | 'recurring'>('transactions');

  // Recurring Transactions State & Form
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringTransaction | null>(null);
  const [recName, setRecName] = useState('');
  const [recDesc, setRecDesc] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recType, setRecType] = useState<'income' | 'expense'>('expense');
  const [recCategory, setRecCategory] = useState('Bills & Utilities');
  const [recFreq, setRecFreq] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [recStartDate, setRecStartDate] = useState(() => formatStandardDate(new Date()));
  const [recEndDate, setRecEndDate] = useState('');
  const [recNextDueDate, setRecNextDueDate] = useState(() => formatStandardDate(new Date()));
  const [recAutoCreate, setRecAutoCreate] = useState(false);
  const [recStatus, setRecStatus] = useState<'active' | 'paused'>('active');
  const [recFormError, setRecFormError] = useState<string | null>(null);
  const [isSavingRec, setIsSavingRec] = useState(false);

  // Process / Generate Confirmation Modal State
  const [confirmProcessItem, setConfirmProcessItem] = useState<RecurringTransaction | null>(null);
  const [isProcessingRec, setIsProcessingRec] = useState(false);

  // Delete Recurring Modal State
  const [deletingRecItem, setDeletingRecItem] = useState<RecurringTransaction | null>(null);
  const [isDeletingRec, setIsDeletingRec] = useState(false);

  const isDark = theme === 'dark';

  const categories = [
    'All',
    'Food & Dining',
    'Shopping',
    'Bills & Utilities',
    'Transport',
    'Entertainment',
    'Healthcare',
    'Others',
    'Income'
  ];

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter(tx => {
        const matchesMonth =
          monthFilterMode === 'all' || selectedMonth === 'All Time' || isTransactionInSelectedMonth(tx.date, selectedMonth);

        const matchesSearch =
          tx.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tx.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (tx.notes && tx.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (tx.date && tx.date.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesCategory = categoryFilter === 'All' || tx.category === categoryFilter;
        const matchesType = typeFilter === 'All' || tx.type === typeFilter;

        return matchesMonth && matchesSearch && matchesCategory && matchesType;
      })
      .sort((a, b) => {
        const da = parseTransactionDate(a.date)?.getTime() || 0;
        const db = parseTransactionDate(b.date)?.getTime() || 0;
        if (db !== da) return db - da;
        return (b.id || '').localeCompare(a.id || '');
      });
  }, [transactions, monthFilterMode, selectedMonth, searchQuery, categoryFilter, typeFilter]);

  const totalFilteredIncome = Number(filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + Number(t.amount || 0), 0)
    .toFixed(2));

  const totalFilteredExpense = Number(filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount || 0), 0)
    .toFixed(2));

  const handleOpenAddModal = (txToEdit?: Transaction) => {
    if (txToEdit) {
      setEditingTx(txToEdit);
      setFormName(txToEdit.name);
      setFormAmount(String(txToEdit.amount));
      setFormCategory(txToEdit.category);
      setFormType(txToEdit.type);
      setFormDate(txToEdit.date);
      setFormPaymentMethod(txToEdit.paymentMethod || 'UPI');
      setFormNotes(txToEdit.notes || '');
    } else {
      setEditingTx(null);
      setFormName('');
      setFormAmount('');
      setFormCategory('Food & Dining');
      setFormType('expense');
      setFormDate(formatStandardDate(new Date()));
      setFormPaymentMethod('UPI');
      setFormNotes('');
    }
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Please enter a merchant or transaction name.');
      return;
    }
    const parsedAmount = parseFloat(formAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Please enter a valid positive numeric amount.');
      return;
    }

    const parsedDate = parseTransactionDate(formDate);
    if (!formDate.trim() || !parsedDate) {
      setFormError('Please enter a valid date (e.g. "21 Aug 2026" or "2026-08-21").');
      return;
    }
    const standardDate = formatStandardDate(parsedDate);

    setIsSaving(true);
    setFormError('');
    try {
      if (editingTx) {
        await updateTransaction(editingTx.id, {
          name: formName.trim(),
          amount: parsedAmount,
          category: formCategory,
          type: formType,
          date: standardDate,
          paymentMethod: formPaymentMethod,
          notes: formNotes.trim(),
        });
      } else {
        await addTransaction({
          name: formName.trim(),
          amount: parsedAmount,
          category: formCategory,
          type: formType,
          date: standardDate,
          paymentMethod: formPaymentMethod,
          notes: formNotes.trim(),
          status: 'Completed',
        });
      }
      setIsAddModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save transaction.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenDeleteModal = (tx: Transaction) => {
    setDeleteError(null);
    setDeletingTx(tx);
  };

  const handleConfirmDelete = async () => {
    if (!deletingTx) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteTransaction(deletingTx.id);
      setDeletingTx(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete transaction.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const tx = transactions.find(t => t.id === id) || ({ id, name, amount: 0, category: 'Others', date: '', type: 'expense', status: 'Completed' } as Transaction);
    handleOpenDeleteModal(tx);
  };

  const handleOpenAddRecurring = () => {
    setEditingRecurring(null);
    setRecName('');
    setRecDesc('');
    setRecAmount('');
    setRecType('expense');
    setRecCategory('Bills & Utilities');
    setRecFreq('monthly');
    setRecStartDate(formatStandardDate(new Date()));
    setRecEndDate('');
    setRecNextDueDate(formatStandardDate(new Date()));
    setRecAutoCreate(false);
    setRecStatus('active');
    setRecFormError(null);
    setIsRecurringModalOpen(true);
  };

  const handleOpenEditRecurring = (rec: RecurringTransaction) => {
    setEditingRecurring(rec);
    setRecName(rec.name);
    setRecDesc(rec.description || '');
    setRecAmount(String(rec.amount));
    setRecType(rec.type);
    setRecCategory(rec.category);
    setRecFreq(rec.frequency);
    setRecStartDate(rec.startDate);
    setRecEndDate(rec.endDate || '');
    setRecNextDueDate(rec.nextDueDate);
    setRecAutoCreate(rec.autoCreate);
    setRecStatus(rec.status);
    setRecFormError(null);
    setIsRecurringModalOpen(true);
  };

  const handleSaveRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recName.trim()) {
      setRecFormError('Please enter a schedule name.');
      return;
    }
    const parsedAmount = parseFloat(recAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setRecFormError('Please enter a valid amount greater than 0.');
      return;
    }
    if (!recStartDate.trim()) {
      setRecFormError('Please enter a start date.');
      return;
    }

    setIsSavingRec(true);
    setRecFormError(null);
    try {
      if (editingRecurring) {
        await updateRecurringTransaction(editingRecurring.id, {
          name: recName.trim(),
          description: recDesc.trim(),
          amount: parsedAmount,
          type: recType,
          category: recCategory.trim(),
          frequency: recFreq,
          startDate: recStartDate.trim(),
          endDate: recEndDate.trim() || undefined,
          nextDueDate: recNextDueDate.trim() || recStartDate.trim(),
          autoCreate: recAutoCreate,
          status: recStatus,
        });
        setImportSuccessToast(`Recurring schedule "${recName.trim()}" updated successfully.`);
      } else {
        await addRecurringTransaction({
          name: recName.trim(),
          description: recDesc.trim(),
          amount: parsedAmount,
          type: recType,
          category: recCategory.trim(),
          frequency: recFreq,
          startDate: recStartDate.trim(),
          endDate: recEndDate.trim() || undefined,
          nextDueDate: recNextDueDate.trim() || recStartDate.trim(),
          autoCreate: recAutoCreate,
          status: recStatus,
        });
        setImportSuccessToast(`Recurring schedule "${recName.trim()}" created successfully.`);
      }
      setTimeout(() => setImportSuccessToast(null), 3500);
      setIsRecurringModalOpen(false);
    } catch (err: any) {
      setRecFormError(err.message || 'Failed to save recurring schedule.');
    } finally {
      setIsSavingRec(false);
    }
  };

  const handleToggleRecStatus = async (rec: RecurringTransaction) => {
    const newStatus = rec.status === 'active' ? 'paused' : 'active';
    try {
      await toggleRecurringTransactionStatus(rec.id, newStatus);
      setImportSuccessToast(`Schedule "${rec.name}" is now ${newStatus}.`);
      setTimeout(() => setImportSuccessToast(null), 3000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to update schedule status.');
    }
  };

  const handleProcessClick = (rec: RecurringTransaction) => {
    if (rec.autoCreate) {
      executeProcessRec(rec.id, false);
    } else {
      setConfirmProcessItem(rec);
    }
  };

  const executeProcessRec = async (id: string, confirmCreate: boolean) => {
    setIsProcessingRec(true);
    try {
      const res = await processRecurringTransaction(id, confirmCreate);
      setImportSuccessToast(res.message);
      setTimeout(() => setImportSuccessToast(null), 4000);
      setConfirmProcessItem(null);
    } catch (err: any) {
      setActionError(err.message || 'Failed to process recurring schedule.');
    } finally {
      setIsProcessingRec(false);
    }
  };

  const handleConfirmDeleteRecurring = async () => {
    if (!deletingRecItem) return;
    setIsDeletingRec(true);
    try {
      await deleteRecurringTransaction(deletingRecItem.id);
      setImportSuccessToast(`Recurring schedule "${deletingRecItem.name}" deleted.`);
      setTimeout(() => setImportSuccessToast(null), 3000);
      setDeletingRecItem(null);
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete recurring schedule.');
    } finally {
      setIsDeletingRec(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Name', 'Category', 'Amount (INR)', 'Type', 'Date', 'Payment Method', 'Notes'];
    const rows = filteredTransactions.map(tx => [
      tx.id,
      `"${tx.name.replace(/"/g, '""')}"`,
      `"${tx.category}"`,
      tx.amount,
      tx.type,
      `"${tx.date}"`,
      `"${tx.paymentMethod || ''}"`,
      `"${(tx.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `finsight_ledger_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenImportModal = () => {
    setCsvSummary(null);
    setCsvFileError(null);
    setIsParsingCSV(false);
    activeReadIdRef.current += 1;
    setFileInputKey(k => k + 1);
    setIsImportModalOpen(true);
  };

  const handleCloseImportModal = () => {
    setIsImportModalOpen(false);
    setCsvSummary(null);
    setCsvFileError(null);
    setIsParsingCSV(false);
    activeReadIdRef.current += 1;
    setFileInputKey(k => k + 1);
  };

  const handleFileSelected = (file: File) => {
    if (!file) return;

    // Immediately increment session read ID to discard any in-flight reads
    const currentReadId = ++activeReadIdRef.current;

    // Immediately reset previous parse state and errors so records from prior imports are never reused
    setCsvSummary(null);
    setCsvFileError(null);

    // Required Console Diagnostic 1: Selected file details
    console.log('[FinSight CSV Diagnostic] Selected file info:', {
      name: file.name,
      size: `${file.size} bytes`,
      type: file.type || '(empty/text)',
      lastModified: new Date(file.lastModified).toISOString(),
    });

    const lowerName = file.name ? file.name.toLowerCase() : '';
    const mimeType = file.type ? file.type.toLowerCase() : '';

    // Check for Excel binary workbooks (.xlsx / .xls)
    if (
      lowerName.endsWith('.xlsx') ||
      lowerName.endsWith('.xls') ||
      mimeType.includes('spreadsheetml')
    ) {
      setCsvFileError(
        'Excel (.xlsx/.xls) files are binary workbooks. Client-side browser parsing without heavy external binary libraries requires converting to CSV. Please export/save your spreadsheet as CSV (.csv) format and try again.'
      );
      return;
    }

    // Verify it is a readable text / CSV file
    const isCsvName = lowerName.endsWith('.csv') || !lowerName.includes('.');
    const isTextOrCsvMime =
      mimeType === 'text/csv' ||
      mimeType.includes('csv') ||
      mimeType.includes('comma-separated') ||
      mimeType.includes('text/plain') ||
      mimeType === 'application/vnd.ms-excel' ||
      mimeType === '';

    if (!isCsvName && !isTextOrCsvMime) {
      setCsvFileError('Please select a valid CSV (.csv) bank statement file.');
      return;
    }

    setIsParsingCSV(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      // Discard if a newer file selection started while this FileReader was reading
      if (currentReadId !== activeReadIdRef.current) {
        console.warn('[FinSight CSV Diagnostic] Discarded superseded read for:', file.name);
        return;
      }

      try {
        const text = (e.target?.result as string) || '';
        if (!text.trim()) {
          setCsvFileError('The selected file is empty.');
          setIsParsingCSV(false);
          return;
        }

        // Parse directly with current live ledger transactions for accurate duplicate detection
        const summary = parseCSVStatement(text, file.name || 'statement.csv', transactions);

        // Required Console Diagnostic 2: Complete parsed summary & duplicate pairs
        console.log('[FinSight CSV Diagnostic] Parsed CSV Diagnostics:', {
          selectedFileName: file.name,
          selectedFileSize: `${file.size} bytes`,
          selectedFileType: file.type || '(empty/text)',
          parsedRowCount: summary.parsedCount,
          firstThreeParsedRows: summary.candidates.slice(0, 3).map(c => ({
            date: c.date,
            description: c.name,
            amount: c.amount,
            type: c.type,
          })),
          candidateCountBeforeDuplicateFiltering: summary.candidates.length,
          existingLedgerTransactionCount: transactions.length,
          duplicateCount: summary.duplicateCount,
          firstThreeDuplicateMatchPairs: summary.duplicateMatchPairs.slice(0, 3),
        });

        setCsvSummary(summary);
      } catch (err: any) {
        setCsvFileError(`Parsing failed: ${err.message || 'Malformed file structure'}`);
      } finally {
        if (currentReadId === activeReadIdRef.current) {
          setIsParsingCSV(false);
        }
      }
    };
    reader.onerror = () => {
      if (currentReadId === activeReadIdRef.current) {
        setCsvFileError('Failed to read file from disk.');
        setIsParsingCSV(false);
      }
    };
    reader.onloadend = () => {
      // Refresh input key to ensure subsequent selections of the same file trigger onChange cleanly
      setFileInputKey(k => k + 1);
    };
    reader.readAsText(file);
  };

  const handleLoadSampleCSV = () => {
    // Reset previous parse state
    setCsvSummary(null);
    setCsvFileError(null);
    setIsParsingCSV(true);
    const readId = ++activeReadIdRef.current;
    try {
      const sampleText = getSampleBankCSV();
      const summary = parseCSVStatement(sampleText, 'Sample_Statement_18_Oct2026.csv', transactions);
      if (readId === activeReadIdRef.current) {
        console.log('[FinSight CSV Diagnostic] Loaded sample statement (18 transactions Oct 2026):', {
          selectedFileName: summary.fileName,
          parsedRowCount: summary.parsedCount,
          firstThreeParsedRows: summary.candidates.slice(0, 3).map(c => ({
            date: c.date,
            description: c.name,
            amount: c.amount,
            type: c.type,
          })),
          candidateCountBeforeDuplicateFiltering: summary.candidates.length,
          existingLedgerTransactionCount: transactions.length,
          duplicateCount: summary.duplicateCount,
          firstThreeDuplicateMatchPairs: summary.duplicateMatchPairs.slice(0, 3),
        });
        setCsvSummary(summary);
      }
    } catch (err: any) {
      setCsvFileError(`Error parsing sample statement: ${err.message}`);
    } finally {
      setIsParsingCSV(false);
    }
  };

  const handleDownloadSampleCSV = () => {
    const sampleCsv = getSampleBankCSV();
    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'sample_statement_18_tx_oct2026.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleChooseAnotherFile = () => {
    setCsvSummary(null);
    setCsvFileError(null);
    setIsParsingCSV(false);
    activeReadIdRef.current += 1;
    setFileInputKey(k => k + 1);
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 50);
  };

  const handleConfirmImport = async () => {
    if (!csvSummary || csvSummary.validCount === 0) return;

    const candidatesToImport = excludeDuplicates
      ? csvSummary.candidates.filter(c => !c.isDuplicate)
      : csvSummary.candidates;

    if (candidatesToImport.length === 0) {
      setCsvFileError('All parsed records were marked as duplicates and skipped. Uncheck "Skip duplicate entries" to import anyway.');
      return;
    }

    const batch = candidatesToImport.map(({ originalRowNumber, rawRecord, isDuplicate, ...tx }) => tx);
    setIsCommittingCSV(true);
    setCsvFileError(null);
    setImportProgress({
      currentBatch: 1,
      totalBatches: Math.ceil(batch.length / 50),
      processedCount: 0,
      totalCount: batch.length,
    });
    try {
      const inserted = await addTransactions(batch, {
        batchSize: 50,
        onProgress: (p) => {
          setImportProgress({
            currentBatch: p.currentBatch,
            totalBatches: p.totalBatches,
            processedCount: p.processedCount,
            totalCount: p.totalCount,
          });
        },
      });

      // Switch view mode and month to All Time so newly imported transactions are immediately visible
      // in both the Transactions ledger and the Dashboard totals
      setMonthFilterMode('all');
      setSelectedMonth('All Time');

      const count = inserted.length > 0 ? inserted.length : candidatesToImport.length;
      setImportSuccessToast(
        `Successfully imported ${count} transaction${count > 1 ? 's' : ''}! Cloud database and dashboard totals have updated.`
      );
      setTimeout(() => setImportSuccessToast(null), 5000);

      handleCloseImportModal();
    } catch (err: any) {
      setCsvFileError(err.message || 'Failed to import transactions into cloud database. Candidates preserved for retry.');
    } finally {
      setIsCommittingCSV(false);
      setImportProgress(null);
    }
  };

  const handleConfirmLocalRecovery = async () => {
    setIsImportingLocal(true);
    setRecoveryError(null);
    try {
      const res = await importLocalTransactionsToCloud();
      setImportSuccessToast(
        `Successfully recovered & imported ${res.importedCount} historical transactions into your cloud ledger! (Safety backup saved: "${res.backupKey}")`
      );
      setTimeout(() => setImportSuccessToast(null), 8000);
      setIsRecoveryModalOpen(false);
    } catch (err: any) {
      setRecoveryError(err.message || 'Failed to import local transactions to cloud database.');
    } finally {
      setIsImportingLocal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Historical Local Data Detected Banner */}
      {isAuthenticated && localRecoveryStatus.hasLocalData && !hasDismissedRecovery && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-amber-200">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0 mt-0.5 md:mt-0">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-amber-200 flex items-center gap-2">
                <span>Historical Offline Transactions Detected ({localRecoveryStatus.localCount} records)</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                  Ready to Recover
                </span>
              </div>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Your browser contains {localRecoveryStatus.localCount} saved transactions from before connecting to PostgreSQL cloud storage.
                You can review, deduplicate, and import them safely into your cloud ledger.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            <button
              type="button"
              onClick={() => setHasDismissedRecovery(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => {
                setRecoveryError(null);
                setIsRecoveryModalOpen(true);
              }}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>Review & Recover ({localRecoveryStatus.importableCount})</span>
            </button>
          </div>
        </div>
      )}

      {/* Global Cloud Error Banner */}
      {transactionsError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-rose-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{transactionsError}</span>
          </div>
          <button
            type="button"
            onClick={() => refreshTransactions()}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 font-semibold text-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      )}

      {/* Action Error Banner */}
      {actionError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-rose-400 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented View Switcher */}
          <div className={`p-1 rounded-xl flex items-center gap-1 border ${isDark ? 'bg-[#0f1a2e] border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
            <button
              type="button"
              onClick={() => setLedgerView('transactions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                ledgerView === 'transactions'
                  ? 'bg-[#00E5BE] text-[#080e1a] shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Transactions</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20">{transactions.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setLedgerView('recurring')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                ledgerView === 'recurring'
                  ? 'bg-[#00E5BE] text-[#080e1a] shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>Recurring Schedules</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20">{recurringTransactions.length}</span>
            </button>
          </div>

          {ledgerView === 'transactions' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-400 hidden sm:inline">Volume:</span>
              <span className="font-bold px-2.5 py-1 rounded-lg bg-[#00E5BE]/10 text-[#00E5BE] tabular-nums">
                +₹{totalFilteredIncome.toLocaleString('en-IN')}
              </span>
              <span className="font-bold px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 tabular-nums">
                -₹{totalFilteredExpense.toLocaleString('en-IN')}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {ledgerView === 'transactions' ? (
            <>
              <button
                type="button"
                onClick={handleExportCSV}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-[#111d35] hover:bg-[#162544] border-slate-800 text-slate-200'
                    : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-sm'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={handleOpenImportModal}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-[#111d35] hover:bg-[#162544] border-slate-800 text-slate-200'
                    : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-sm'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import CSV</span>
              </button>

              {isAuthenticated && localRecoveryStatus.hasLocalData && (
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryError(null);
                    setIsRecoveryModalOpen(true);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isDark
                      ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300'
                      : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
                  }`}
                  title="Review and import historical offline transactions into PostgreSQL"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Recover Offline ({localRecoveryStatus.importableCount})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleOpenAddModal()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Record Transaction</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleOpenAddRecurring}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Recurring Entry</span>
            </button>
          )}
        </div>
      </div>

      {/* Success Toast Notification */}
      {importSuccessToast && (
        <div className="fixed top-24 right-6 z-50 bg-[#00E5BE] text-[#080e1a] px-4 py-2.5 rounded-xl font-bold text-xs shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{importSuccessToast}</span>
        </div>
      )}

      {ledgerView === 'transactions' && (
        <>
          {/* Filter and Search Bar */}
          <div
            className={`p-4 rounded-2xl border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by merchant, category, or notes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs focus:outline-none border ${
              isDark
                ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
            }`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border focus:outline-none cursor-pointer ${
              isDark
                ? 'bg-[#0a1120] border-slate-800 text-slate-300'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            {categories.map(c => (
              <option key={c} value={c}>
                Category: {c}
              </option>
            ))}
          </select>

          {/* Type Segmented Filter */}
          <div
            className={`p-1 rounded-xl flex items-center gap-1 border ${
              isDark ? 'bg-[#0a1120] border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            {(['All', 'expense', 'income'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                  typeFilter === t
                    ? isDark
                      ? 'bg-[#0a2c35] text-[#00E5BE] border border-[#00E5BE]/30'
                      : 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t === 'All' ? 'All Types' : t}
              </button>
            ))}
          </div>

          {/* Month Scope Filter */}
          <div
            className={`p-1 rounded-xl flex items-center gap-1 border ${
              isDark ? 'bg-[#0a1120] border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                if (selectedMonth === 'All Time') {
                  setSelectedMonth(getCurrentMonthLabel());
                }
                setMonthFilterMode('selected');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                monthFilterMode === 'selected' && selectedMonth !== 'All Time'
                  ? isDark
                    ? 'bg-[#0a2c35] text-[#00E5BE] border border-[#00E5BE]/30'
                    : 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {selectedMonth === 'All Time' ? getCurrentMonthLabel() : selectedMonth}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedMonth('All Time');
                setMonthFilterMode('all');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                monthFilterMode === 'all' || selectedMonth === 'All Time'
                  ? isDark
                    ? 'bg-[#0a2c35] text-[#00E5BE] border border-[#00E5BE]/30'
                    : 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Time
            </button>
          </div>
        </div>
      </div>

      {/* Transactions Table Container */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr
                className={`border-b text-slate-400 font-semibold ${
                  isDark ? 'border-slate-800 bg-[#0a1120]/50' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <th className="py-3.5 px-4">Merchant / Flow</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Payment Method</th>
                <th className="py-3.5 px-4 text-right">Amount</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-inherit">
              {transactionsLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-[#00E5BE]" />
                      <p className="text-xs font-medium text-slate-300">Loading transactions from cloud database...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <p className="font-semibold text-slate-300">No matching transactions found</p>
                    <p className="text-xs text-slate-500 mt-1">Try resetting your search query or category filter, or record a new transaction.</p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx, idx) => {
                  const isExpense = tx.type === 'expense';
                  return (
                    <tr
                      key={tx.id ? `${tx.id}-${idx}` : `tx-${idx}`}
                      className={`hover:bg-slate-500/5 transition-colors ${
                        isDark ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[11px] shrink-0 ${
                              isExpense ? 'bg-slate-700/30 text-white' : 'bg-[#00E5BE]/20 text-[#00E5BE]'
                            }`}
                          >
                            {tx.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold">{tx.name}</p>
                            {tx.notes && <p className="text-[11px] text-slate-400 truncate max-w-xs">{tx.notes}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-slate-300">{tx.category}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">{tx.date}</td>
                      <td className="py-3.5 px-4 text-slate-400">{tx.paymentMethod || 'Direct'}</td>
                      <td className="py-3.5 px-4 text-right font-bold tabular-nums whitespace-nowrap">
                        <span className={isExpense ? isDark ? 'text-slate-100' : 'text-slate-900' : 'text-[#00E5BE]'}>
                          {isExpense ? '- ' : '+ '}₹{Number(tx.amount).toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenAddModal(tx)}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-500/10 transition-colors"
                            title="Edit Transaction"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteModal(tx)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Delete Transaction"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {ledgerView === 'recurring' && (
        <div className="space-y-4">
          {/* Recurring Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={`p-4 rounded-2xl border ${isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Active Schedules</span>
                <Repeat className="w-4 h-4 text-[#00E5BE]" />
              </div>
              <p className="text-xl font-bold mt-1.5 text-[#00E5BE]">
                {recurringTransactions.filter(r => r.status === 'active').length} of {recurringTransactions.length}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Recurring income & expense pipelines</p>
            </div>
            <div className={`p-4 rounded-2xl border ${isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Monthly Projected Expenses</span>
                <ArrowDownRight className="w-4 h-4 text-rose-400" />
              </div>
              <p className="text-xl font-bold mt-1.5 text-rose-400">
                ₹{recurringTransactions
                  .filter(r => r.status === 'active' && r.type === 'expense')
                  .reduce((sum, r) => sum + (r.frequency === 'weekly' ? r.amount * 4 : r.frequency === 'yearly' ? r.amount / 12 : r.amount), 0)
                  .toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Automated/scheduled monthly burn</p>
            </div>
            <div className={`p-4 rounded-2xl border ${isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Monthly Recurring Inflows</span>
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-xl font-bold mt-1.5 text-emerald-400">
                ₹{recurringTransactions
                  .filter(r => r.status === 'active' && r.type === 'income')
                  .reduce((sum, r) => sum + (r.frequency === 'weekly' ? r.amount * 4 : r.frequency === 'yearly' ? r.amount / 12 : r.amount), 0)
                  .toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Salary, dividends & subscriptions</p>
            </div>
          </div>

          {/* Recurring Schedules Table */}
          <div className={`rounded-2xl border overflow-hidden ${isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'}`}>
            <div className="p-4 border-b border-inherit flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">Scheduled Recurring Income & Expenses</h3>
                <p className="text-xs text-slate-400">Track recurring schedules, frequencies, and trigger transaction processing</p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddRecurring}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#00E5BE] text-[#080e1a] hover:bg-[#00cba8] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Schedule</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className={`border-b ${isDark ? 'border-slate-800 bg-[#0a1120] text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  <tr>
                    <th className="py-3 px-4 font-semibold">Name & Category</th>
                    <th className="py-3 px-4 font-semibold">Frequency</th>
                    <th className="py-3 px-4 font-semibold">Type</th>
                    <th className="py-3 px-4 font-semibold">Amount</th>
                    <th className="py-3 px-4 font-semibold">Next Due Date</th>
                    <th className="py-3 px-4 font-semibold">Schedule Period</th>
                    <th className="py-3 px-4 font-semibold">Generation Mode</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-inherit">
                  {recurringTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <Repeat className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
                        <p className="font-semibold text-slate-300">No recurring schedules configured yet.</p>
                        <p className="text-[11px] mt-1 max-w-sm mx-auto text-slate-400">
                          Create repeating income (salary, investments) or expense schedules (rent, software, gym) to forecast cash flow.
                        </p>
                        <button
                          type="button"
                          onClick={handleOpenAddRecurring}
                          className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#00E5BE]/20 text-[#00E5BE] hover:bg-[#00E5BE] hover:text-[#080e1a] transition-colors inline-block cursor-pointer"
                        >
                          + Add your first schedule
                        </button>
                      </td>
                    </tr>
                  ) : (
                    recurringTransactions.map(rec => {
                      const isIncome = rec.type === 'income';
                      const isPaused = rec.status === 'paused';
                      return (
                        <tr key={rec.id} className={`hover:bg-slate-500/5 transition-colors ${isPaused ? 'opacity-60' : ''}`}>
                          <td className="py-3 px-4">
                            <div className="font-bold text-sm text-slate-100">{rec.name}</div>
                            <div className="flex items-center gap-2 mt-0.5 text-slate-400 text-[11px]">
                              <span>{rec.category}</span>
                              {rec.description && <span>• {rec.description}</span>}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="capitalize px-2 py-0.5 rounded-md bg-slate-500/10 font-medium text-slate-300">
                              {rec.frequency}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md ${
                              isIncome ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                            }`}>
                              {isIncome ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                              <span className="capitalize">{rec.type}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold tabular-nums text-sm">
                            ₹{rec.amount.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-200">{rec.nextDueDate}</div>
                            {rec.lastGeneratedDate && (
                              <div className="text-[10px] text-slate-500">Last created: {rec.lastGeneratedDate}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-400">
                            <div>From: {rec.startDate}</div>
                            <div className="text-[10px] text-slate-500">{rec.endDate ? `To: ${rec.endDate}` : 'Ongoing'}</div>
                          </td>
                          <td className="py-3 px-4">
                            {rec.autoCreate ? (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-medium">
                                Auto-Create
                              </span>
                            ) : (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-500/10 text-slate-400 font-medium">
                                Requires Approval
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => handleToggleRecStatus(rec)}
                              className={`text-[11px] px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                                rec.status === 'active'
                                  ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                              }`}
                              title="Click to toggle active / paused"
                            >
                              {rec.status === 'active' ? 'Active' : 'Paused'}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleProcessClick(rec)}
                                disabled={isPaused}
                                className="px-2 py-1 rounded bg-[#00E5BE]/20 text-[#00E5BE] hover:bg-[#00E5BE] hover:text-[#080e1a] text-[11px] font-semibold transition-colors disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
                                title="Process and generate transaction for current due date"
                              >
                                <Play className="w-3 h-3" />
                                <span>Process</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditRecurring(rec)}
                                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-500/10 transition-colors cursor-pointer"
                                title="Edit Schedule"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingRecItem(rec)}
                                className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                title="Delete Schedule"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Recurring Schedule Modal */}
      {isRecurringModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <div className="flex items-center gap-2">
                <Repeat className="w-5 h-5 text-[#00E5BE]" />
                <h3 className="text-base font-bold">
                  {editingRecurring ? 'Edit Recurring Schedule' : 'New Recurring Schedule'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRecurringModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {recFormError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{recFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveRecurring} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Schedule Type *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRecType('expense');
                      if (recCategory === 'Income') setRecCategory('Bills & Utilities');
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      recType === 'expense'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : isDark
                        ? 'bg-[#0a1120] text-slate-400 border-slate-800'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    Expense Schedule
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRecType('income');
                      setRecCategory('Income');
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      recType === 'income'
                        ? 'bg-[#00E5BE]/20 text-[#00E5BE] border-[#00E5BE]/40'
                        : isDark
                        ? 'bg-[#0a1120] text-slate-400 border-slate-800'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    Income Inflow
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Schedule Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Salary, Rent, Netflix"
                    value={recName}
                    onChange={e => setRecName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 5000"
                    value={recAmount}
                    onChange={e => setRecAmount(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Category *
                  </label>
                  <select
                    value={recCategory}
                    onChange={e => setRecCategory(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none cursor-pointer ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                    }`}
                  >
                    {categories.filter(c => c !== 'All').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Frequency *
                  </label>
                  <select
                    value={recFreq}
                    onChange={e => setRecFreq(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none cursor-pointer ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                    }`}
                  >
                    <option value="weekly">Weekly (every 7 days)</option>
                    <option value="monthly">Monthly (same day each month)</option>
                    <option value="yearly">Yearly (annual recurrence)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Start Date *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 01 Nov 2026"
                    value={recStartDate}
                    onChange={e => setRecStartDate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Optional End Date
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 31 Dec 2027 (blank for ongoing)"
                    value={recEndDate}
                    onChange={e => setRecEndDate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Next Due Date
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 01 Nov 2026"
                    value={recNextDueDate}
                    onChange={e => setRecNextDueDate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Initial Status
                  </label>
                  <select
                    value={recStatus}
                    onChange={e => setRecStatus(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none cursor-pointer ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                    }`}
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Description / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fiber broadband subscription bill"
                  value={recDesc}
                  onChange={e => setRecDesc(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                    isDark
                      ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                  }`}
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={recAutoCreate}
                    onChange={e => setRecAutoCreate(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-[#00E5BE] focus:ring-[#00E5BE]"
                  />
                  <div>
                    <span className="font-semibold text-white block">Auto-generate transactions when due</span>
                    <span className="text-[11px] text-slate-400">
                      When disabled, FinSight AI alerts you and requires your explicit manual confirmation before recording any transaction.
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-3 border-t border-inherit flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsRecurringModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRec}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isSavingRec && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSavingRec ? 'Saving...' : editingRecurring ? 'Save Changes' : 'Create Schedule'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Process Recurring Transaction Modal (Requirement 5) */}
      {confirmProcessItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#00E5BE]/20 text-[#00E5BE] flex items-center justify-center shrink-0">
                <Play className="w-5 h-5 ml-0.5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Process Recurring Entry?</h3>
                <p className="text-xs text-slate-400">User confirmation required to record transaction</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300 p-3.5 rounded-xl bg-slate-500/10 border border-slate-500/20 mb-5">
              <div className="flex justify-between">
                <span className="text-slate-400">Schedule:</span>
                <span className="font-semibold text-white">{confirmProcessItem.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount & Type:</span>
                <span className="font-bold text-[#00E5BE]">
                  ₹{confirmProcessItem.amount.toLocaleString('en-IN')} ({confirmProcessItem.type})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Transaction Date:</span>
                <span className="font-semibold text-white">{confirmProcessItem.nextDueDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Frequency:</span>
                <span className="capitalize">{confirmProcessItem.frequency}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Clicking confirm will record a completed transaction in your cloud ledger and automatically advance the schedule's next due date.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isProcessingRec}
                onClick={() => setConfirmProcessItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingRec}
                onClick={() => executeProcessRec(confirmProcessItem.id, true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-1.5 cursor-pointer"
              >
                {isProcessingRec && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm & Generate</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Recurring Confirmation Modal */}
      {deletingRecItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Delete Recurring Schedule?</h3>
                <p className="text-xs text-slate-400">This will remove future automated reminders.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-5">
              Are you sure you want to delete <strong className="text-white">"{deletingRecItem.name}"</strong>? This will stop future recurring transactions but will keep all previously generated transactions intact in your ledger.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingRec}
                onClick={() => setDeletingRecItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingRec}
                onClick={handleConfirmDeleteRecurring}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {isDeletingRec && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Schedule</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Transaction Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <h3 className="text-base font-bold">
                {editingTx ? 'Edit Transaction' : 'Record New Transaction'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveTransaction} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormType('expense');
                      if (formCategory === 'Income') setFormCategory('Food & Dining');
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      formType === 'expense'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-slate-500/10 border-transparent text-slate-400'
                    }`}
                  >
                    Expense (-)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormType('income');
                      if (formCategory !== 'Income') setFormCategory('Income');
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      formType === 'income'
                        ? 'bg-[#00E5BE]/20 text-[#00E5BE] border-[#00E5BE]/40'
                        : 'bg-slate-500/10 border-transparent text-slate-400'
                    }`}
                  >
                    Income (+)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Merchant or Label
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Swiggy, Amazon, Monthly Salary"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                    isDark
                      ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Amount (₹ INR)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 560"
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  >
                    {categories.filter(c => c !== 'All').map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Date
                  </label>
                  <input
                    type="text"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">
                    Payment Method
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UPI, Credit Card"
                    value={formPaymentMethod}
                    onChange={e => setFormPaymentMethod(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                      isDark
                        ? 'bg-[#0a1120] border-slate-800 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Team dinner outing"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                    isDark
                      ? 'bg-[#0a1120] border-slate-800 text-white focus:border-[#00E5BE]'
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500'
                  }`}
                />
              </div>

              <div className="pt-3 border-t border-inherit flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSaving ? 'Saving...' : editingTx ? 'Save Changes' : 'Record Transaction'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-all ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Delete Transaction</h3>
                <p className="text-xs text-slate-400">This action permanently deletes this record.</p>
              </div>
            </div>

            <div className={`p-4 rounded-xl border mb-4 ${isDark ? 'bg-[#0a1120] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-sm">{deletingTx.name}</span>
                <span className={`text-sm font-bold ${deletingTx.type === 'expense' ? 'text-rose-400' : 'text-[#00E5BE]'}`}>
                  {deletingTx.type === 'expense' ? '- ' : '+ '}₹{Number(deletingTx.amount).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{deletingTx.category}</span>
                <span>{deletingTx.date}</span>
              </div>
              {deletingTx.notes && (
                <p className="text-xs text-slate-400 mt-2 italic truncate">"{deletingTx.notes}"</p>
              )}
            </div>

            <p className="text-xs text-slate-400 mb-5">
              Are you sure you want to delete this transaction? This will permanently remove it from your cloud database and immediately recalculate your dashboard totals.
            </p>

            {deleteError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-inherit">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => { setDeletingTx(null); setDeleteError(null); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isDeleting ? 'Deleting...' : 'Delete Transaction'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Genuine CSV Import Interface Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div
            className={`w-full max-w-2xl rounded-2xl border p-6 shadow-2xl my-8 transition-all ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#00E5BE]" />
                <h3 className="text-base font-bold">Import CSV Bank Statement</h3>
              </div>
              <button
                type="button"
                onClick={handleCloseImportModal}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Banner */}
            {csvFileError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{csvFileError}</div>
              </div>
            )}

            {/* Hidden File Input — Permanently mounted while modal is open with auto-refreshing key */}
            <input
              key={fileInputKey}
              type="file"
              ref={fileInputRef}
              accept=".csv,text/csv,text/plain,application/vnd.ms-excel"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  handleFileSelected(file);
                }
              }}
            />

            {!csvSummary ? (
              /* State 1: File Upload & Selection Screen */
              <div className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Upload an authentic bank export CSV (HDFC, SBI, ICICI, Axis, Kotak, or UPI). FinSight parses statement dates, descriptions, amounts, and auto-detects expenditure categories.
                </p>

                {/* Drag and Drop Box */}
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleFileSelected(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-[#00E5BE] bg-[#00E5BE]/10 shadow-lg shadow-teal-500/10'
                      : isDark
                      ? 'border-slate-700 hover:border-[#00E5BE] bg-[#0a1120]'
                      : 'border-slate-300 hover:border-teal-500 bg-slate-50'
                  }`}
                >
                  <Upload className="w-9 h-9 text-[#00E5BE] mx-auto mb-2.5 animate-pulse" />
                  <p className="text-sm font-bold text-slate-200">
                    {isParsingCSV ? 'Parsing statement records...' : 'Drop your bank .csv statement here, or click to browse'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Accepts standardized bank statements with Date, Narration, Debit/Credit columns
                  </p>
                </div>

                {/* Sample Test Statement Box with Download & Instant Load */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-inherit bg-slate-500/5 gap-3">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-[#00E5BE] shrink-0" />
                    <div>
                      <p className="text-xs font-semibold">Test Sample Statement (18 Records — Oct 1–22, 2026)</p>
                      <p className="text-[11px] text-slate-400">
                        Contains 18 authentic transactions dated Oct 1–22, 2026 for testing ingestion and duplicate detection.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleDownloadSampleCSV}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-700 hover:border-slate-500 text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors"
                      title="Download sample statement file to disk for manual file upload testing"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Sample .CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadSampleCSV}
                      disabled={isParsingCSV}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#00E5BE]/20 text-[#00E5BE] hover:bg-[#00E5BE] hover:text-[#080e1a] transition-all whitespace-nowrap"
                    >
                      Load Sample Statement
                    </button>
                  </div>
                </div>

                {/* Excel XLSX Clarification Notice */}
                <div className="p-3.5 rounded-xl border border-slate-700/60 bg-[#0a1120] text-slate-400 text-xs flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="text-slate-300">Note on Excel (.xlsx / .xls) files:</strong> Excel spreadsheets are compressed binary packages containing zipped XML documents. Parsing raw <code className="text-[#00E5BE]">.xlsx</code> directly inside the browser requires third-party binary decoders (such as <code className="text-[#00E5BE]">xlsx</code> / SheetJS) or a backend Python endpoint (FastAPI with <code className="text-[#00E5BE]">pandas</code> / <code className="text-[#00E5BE]">openpyxl</code>). Please export or save your workbook as a standard <strong className="text-slate-200">CSV (.csv)</strong> file for client-side ingestion.
                  </div>
                </div>

                <div className="pt-3 border-t border-inherit flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleCloseImportModal}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* State 2: Parsed Preview, Duplicate Review & Confirmation Screen */
              <div className="space-y-4">
                {/* Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-slate-500/10 border border-inherit">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-400">File Name</p>
                      <button
                        type="button"
                        onClick={handleChooseAnotherFile}
                        className="text-[10px] text-[#00E5BE] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                        title="Upload a different statement file"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>Change</span>
                      </button>
                    </div>
                    <p className="text-xs font-bold truncate mt-0.5" title={csvSummary.fileName}>
                      {csvSummary.fileName}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-500/10 border border-inherit">
                    <p className="text-[11px] text-slate-400">Valid Rows</p>
                    <p className="text-xs font-bold text-[#00E5BE] mt-0.5">
                      {csvSummary.validCount} / {csvSummary.totalLines - 1} records
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-500/10 border border-inherit">
                    <p className="text-[11px] text-slate-400">Batch Inflow</p>
                    <p className="text-xs font-bold text-[#00E5BE] mt-0.5 tabular-nums">
                      +₹{csvSummary.totalIncome.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-500/10 border border-inherit">
                    <p className="text-[11px] text-slate-400">Batch Outflow</p>
                    <p className="text-xs font-bold text-rose-400 mt-0.5 tabular-nums">
                      -₹{csvSummary.totalExpense.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>

                {/* Validation warnings / Errors if any lines were skipped */}
                {csvSummary.errors.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                    <div className="flex items-center gap-2 font-bold mb-1">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{csvSummary.errors.length} row(s) contained errors and were skipped:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/90 max-h-24 overflow-y-auto">
                      {csvSummary.errors.map((err, i) => (
                        <li key={i}>
                          Row {err.row}: {err.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Duplicate Handling Checkbox */}
                {csvSummary.duplicateCount > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>
                        <strong className="text-white">{csvSummary.duplicateCount}</strong> duplicate record{csvSummary.duplicateCount > 1 ? 's' : ''} detected already matching your ledger.
                      </span>
                    </div>
                    <label className="flex items-center gap-2 font-semibold text-[#00E5BE] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={excludeDuplicates}
                        onChange={e => setExcludeDuplicates(e.target.checked)}
                        className="rounded border-slate-700 text-[#00E5BE] focus:ring-0"
                      />
                      <span>Skip duplicates</span>
                    </label>
                  </div>
                )}

                {/* Preview Table */}
                <div className="border border-inherit rounded-xl overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-500/10 border-b border-inherit flex items-center justify-between text-xs font-bold">
                    <span>Parsed Statement Preview</span>
                    <span className="text-[11px] font-normal text-slate-400">
                      Showing all {csvSummary.candidates.length} candidate rows
                    </span>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-inherit border-b border-inherit text-slate-400 text-[11px]">
                        <tr>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Merchant / Description</th>
                          <th className="py-2 px-3">Category</th>
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3 text-right">Amount</th>
                          <th className="py-2 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-inherit">
                        {csvSummary.candidates.map((c, idx) => {
                          const isExpense = c.type === 'expense';
                          const willSkip = excludeDuplicates && c.isDuplicate;

                          return (
                            <tr
                              key={`cand_${c.originalRowNumber}_${c.date}_${c.name}_${c.amount}_${idx}`}
                              className={`transition-colors ${
                                willSkip ? 'opacity-40 line-through bg-slate-500/5' : 'hover:bg-slate-500/5'
                              }`}
                            >
                              <td className="py-2 px-3 whitespace-nowrap text-slate-300">{c.date}</td>
                              <td className="py-2 px-3 font-semibold text-slate-200 truncate max-w-[140px]">
                                {c.name}
                              </td>
                              <td className="py-2 px-3">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-500/20 text-slate-300">
                                  {c.category}
                                </span>
                              </td>
                              <td className="py-2 px-3 capitalize">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  isExpense ? 'bg-rose-500/20 text-rose-400' : 'bg-[#00E5BE]/20 text-[#00E5BE]'
                                }`}>
                                  {c.type}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-bold tabular-nums whitespace-nowrap">
                                <span className={isExpense ? 'text-slate-100' : 'text-[#00E5BE]'}>
                                  {isExpense ? '- ' : '+ '}₹{c.amount.toLocaleString('en-IN')}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                {c.isDuplicate ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                                    {willSkip ? 'Skipped Duplicate' : 'Duplicate'}
                                  </span>
                                ) : (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00E5BE]/20 text-[#00E5BE] font-semibold">
                                    Ready
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Modal Footer Controls */}
                <div className="pt-3 border-t border-inherit flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleChooseAnotherFile}
                    className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Choose Another File</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCloseImportModal}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isCommittingCSV}
                      onClick={handleConfirmImport}
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-1.5 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {isCommittingCSV ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>
                            {importProgress
                              ? `Importing Batch ${importProgress.currentBatch} of ${importProgress.totalBatches} (${importProgress.processedCount}/${importProgress.totalCount})...`
                              : 'Saving to Cloud...'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>
                            Import{' '}
                            {excludeDuplicates
                              ? csvSummary.candidates.filter(c => !c.isDuplicate).length
                              : csvSummary.candidates.length}{' '}
                            Transactions
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Historical Local Data Recovery Modal */}
      {isRecoveryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div
            className={`w-full max-w-2xl rounded-2xl p-6 border shadow-2xl max-h-[90vh] flex flex-col ${
              isDark ? 'bg-[#0f172a] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-inherit">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-amber-200">
                    Recover Historical Offline Transactions
                  </h3>
                  <p className="text-xs text-slate-400">
                    Import historical transactions stored in this browser into your PostgreSQL cloud ledger
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecoveryModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="py-4 space-y-4 overflow-y-auto flex-1">
              {recoveryError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{recoveryError}</span>
                </div>
              )}

              {/* Status summary badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Local Records</div>
                  <div className="text-lg font-bold text-slate-100 tabular-nums">
                    {localRecoveryStatus.localCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Duplicates in DB</div>
                  <div className="text-lg font-bold text-amber-400 tabular-nums">
                    {localRecoveryStatus.duplicateCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Ready to Import</div>
                  <div className="text-lg font-bold text-[#00E5BE] tabular-nums">
                    {localRecoveryStatus.importableCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Net Volume</div>
                  <div className="text-xs font-bold text-slate-200 tabular-nums mt-1">
                    <span className="text-[#00E5BE]">+₹{localRecoveryStatus.totalIncome.toLocaleString('en-IN')}</span> /{' '}
                    <span className="text-rose-400">-₹{localRecoveryStatus.totalExpense.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Safe Recovery Notice */}
              <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-200 flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 shrink-0 text-[#00E5BE] mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-[#00E5BE]">Safe & Reversible Cloud Import</p>
                  <p className="text-teal-200/80 leading-relaxed text-[11px]">
                    Before importing to PostgreSQL, an exact timestamped snapshot is permanently archived in your browser storage.
                    Transactions will be owned by your authenticated account (<code className="font-mono text-teal-300">usr_...</code>) with preserved dates, categories, payment methods, and notes. Duplicate transactions will be safely skipped.
                  </p>
                </div>
              </div>

              {/* Transactions Preview Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
                  <span>Candidate Transactions Preview</span>
                  <span>Showing {localRecoveryStatus.candidates.length} item(s)</span>
                </div>
                <div className="border border-inherit rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                      <tr>
                        <th className="py-2 px-3 font-semibold">Date</th>
                        <th className="py-2 px-3 font-semibold">Merchant / Description</th>
                        <th className="py-2 px-3 font-semibold">Category</th>
                        <th className="py-2 px-3 text-right font-semibold">Amount</th>
                        <th className="py-2 px-3 text-center font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-inherit">
                      {localRecoveryStatus.candidates.map((c, idx) => {
                        const isExp = c.tx.type === 'expense';
                        return (
                          <tr key={c.tx.id || idx} className={isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}>
                            <td className="py-2 px-3 text-slate-400 whitespace-nowrap text-[11px]">{c.tx.date}</td>
                            <td className="py-2 px-3 font-medium text-slate-200">
                              <div>{c.tx.name}</div>
                              {c.tx.notes && <div className="text-[10px] text-slate-500 truncate max-w-xs">{c.tx.notes}</div>}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-500/20 text-slate-300">
                                {c.tx.category}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-bold tabular-nums whitespace-nowrap">
                              <span className={isExp ? 'text-slate-100' : 'text-[#00E5BE]'}>
                                {isExp ? '- ' : '+ '}₹{Number(c.tx.amount).toLocaleString('en-IN')}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              {c.isDuplicate ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                                  Already in Cloud
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00E5BE]/20 text-[#00E5BE] font-semibold">
                                  Ready to Import
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-inherit flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsRecoveryModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Keep in Local Storage
              </button>
              <button
                type="button"
                disabled={isImportingLocal || localRecoveryStatus.importableCount === 0}
                onClick={handleConfirmLocalRecovery}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isImportingLocal ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importing into Cloud Ledger...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>
                      Import {localRecoveryStatus.importableCount} Historical Transactions to Cloud
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
