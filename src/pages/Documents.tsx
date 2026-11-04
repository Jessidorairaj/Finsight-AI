import React, { useState, useEffect } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  Plus,
  ArrowRight,
  Sparkles,
  X,
  Trash2,
  Loader2,
  RefreshCw,
  Archive,
  Database,
  ExternalLink,
  Edit2,
  Check,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useFinancial } from '../context/FinancialContext';
import { DocumentItem } from '../data/mockData';

const AVAILABLE_CATEGORIES = [
  'Food & Dining',
  'Shopping',
  'Bills & Utilities',
  'Transport',
  'Entertainment',
  'Others',
];

export const Documents: React.FC = () => {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const {
    documents,
    documentsLoading,
    documentsError,
    refreshDocuments,
    refreshTransactions,
    uploadDocument,
    updateDocument,
    deleteDocument,
    convertDocumentToTransaction,
    localDocumentRecoveryStatus,
    importLocalDocumentsToCloud,
  } = useFinancial();

  const [isUploading, setIsUploading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Review & Correction Form State
  const [editMerchant, setEditMerchant] = useState('');
  const [editAmount, setEditAmount] = useState<number | string>('');
  const [editCategory, setEditCategory] = useState('Others');
  const [editDate, setEditDate] = useState('');
  const [editTax, setEditTax] = useState<number | string>('');
  const [editInvoiceNum, setEditInvoiceNum] = useState('');
  const [isSavingCorrections, setIsSavingCorrections] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);

  // Historical Local Data Recovery State
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isImportingLocal, setIsImportingLocal] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [hasDismissedRecovery, setHasDismissedRecovery] = useState(false);

  const isDark = theme === 'dark';

  // Synchronize review form when a document is opened for review
  useEffect(() => {
    if (selectedDoc) {
      setEditMerchant(selectedDoc.detectedMerchant || '');
      setEditAmount(selectedDoc.detectedAmount !== undefined ? selectedDoc.detectedAmount : '');
      setEditDate(selectedDoc.detectedDate || '');
      setEditTax(selectedDoc.taxAmount !== undefined ? selectedDoc.taxAmount : 0);
      setEditInvoiceNum(selectedDoc.invoiceNumber || '');

      // Use document category if already set, or infer initial category based on merchant
      if (selectedDoc.category) {
        setEditCategory(selectedDoc.category);
      } else {
        const m = (selectedDoc.detectedMerchant || '').toLowerCase();
        if (/swiggy|zomato|starbucks|mcdonald|food|dining|restaurant|cafe|pizza|burger|meghana|barbeque/i.test(m)) {
          setEditCategory('Food & Dining');
        } else if (/amazon|flipkart|myntra|zara|uniqlo|h&m|decathlon|croma|retail|market|superstore|mart|mall/i.test(m)) {
          setEditCategory('Shopping');
        } else if (/bescom|power|electricity|water|gas|lpg|indane|act\s*fibernet|airtel|jio|broadband|wifi|utility|maintenance|rent/i.test(m)) {
          setEditCategory('Bills & Utilities');
        } else if (/uber|ola|metro|fuel|petrol|diesel|iocl|shell|hpcl|bharat\s*petroleum|transport|cab|taxi/i.test(m)) {
          setEditCategory('Transport');
        } else if (/netflix|spotify|prime|cinema|movie|pvr|inox|cult|entertainment/i.test(m)) {
          setEditCategory('Entertainment');
        } else {
          setEditCategory('Others');
        }
      }
    }
  }, [selectedDoc]);

  const handleRealUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be selected again if needed
    e.target.value = '';

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('File exceeds maximum upload size of 10MB.');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    try {
      const doc = await uploadDocument(file);
      setSuccessToast(`Document "${file.name}" uploaded. OCR extracted ${doc.detectedMerchant || 'vendor'} (₹${doc.detectedAmount})`);
      setTimeout(() => setSuccessToast(null), 4000);
      // Open the document in review screen immediately
      setSelectedDoc(doc);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload document.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveCorrections = async () => {
    if (!selectedDoc) return;
    setIsSavingCorrections(true);
    setErrorMessage(null);
    try {
      await updateDocument(selectedDoc.id, {
        detectedMerchant: editMerchant.trim(),
        detectedAmount: Number(editAmount) || 0,
        detectedDate: editDate.trim(),
        category: editCategory,
        taxAmount: Number(editTax) || 0,
        invoiceNumber: editInvoiceNum.trim(),
      });
      await refreshDocuments();
      setSelectedDoc(prev =>
        prev
          ? {
              ...prev,
              detectedMerchant: editMerchant.trim(),
              detectedAmount: Number(editAmount) || 0,
              detectedDate: editDate.trim(),
              category: editCategory,
              taxAmount: Number(editTax) || 0,
              invoiceNumber: editInvoiceNum.trim(),
            }
          : null
      );
      setSuccessToast('Receipt corrections saved successfully.');
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save corrections.');
    } finally {
      setIsSavingCorrections(false);
    }
  };

  const handleIngestToLedger = async () => {
    if (!selectedDoc) return;
    if (selectedDoc.transactionId) {
      setErrorMessage('This document has already been ingested into your ledger.');
      return;
    }

    setIsIngesting(true);
    setErrorMessage(null);
    try {
      const created = await convertDocumentToTransaction(selectedDoc.id, {
        name: editMerchant.trim() || selectedDoc.detectedMerchant || selectedDoc.filename,
        amount: Number(editAmount) || selectedDoc.detectedAmount,
        category: editCategory,
        date: editDate.trim() || selectedDoc.detectedDate,
        taxAmount: Number(editTax) || selectedDoc.taxAmount || 0,
        invoiceNumber: editInvoiceNum.trim() || selectedDoc.invoiceNumber || '',
        notes: `Receipt "${selectedDoc.filename}" (${selectedDoc.confidenceScore}% OCR confidence)`,
      });

      if (created) {
        await refreshDocuments();
        await refreshTransactions();
        setSuccessToast(`Ingested to Ledger: ${created.name} (-₹${created.amount}). Dashboard & budgets updated!`);
        setTimeout(() => setSuccessToast(null), 4500);
        setSelectedDoc(prev =>
          prev
            ? {
                ...prev,
                detectedMerchant: editMerchant.trim() || prev.detectedMerchant,
                detectedAmount: Number(editAmount) || prev.detectedAmount,
                detectedDate: editDate.trim() || prev.detectedDate,
                category: editCategory || prev.category,
                taxAmount: Number(editTax) || prev.taxAmount,
                invoiceNumber: editInvoiceNum.trim() || prev.invoiceNumber,
                transactionId: created.id,
                ocrStatus: 'Extracted',
              }
            : null
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to ingest receipt to ledger.');
      await refreshDocuments();
      await refreshTransactions();
    } finally {
      setIsIngesting(false);
    }
  };

  const handleDelete = async (docId: string, filename: string) => {
    if (!window.confirm(`Are you sure you want to delete "${filename}"? This removes both the file and metadata.`)) {
      return;
    }
    setDeletingDocId(docId);
    setErrorMessage(null);
    try {
      await deleteDocument(docId);
      setSuccessToast(`Document "${filename}" deleted.`);
      setTimeout(() => setSuccessToast(null), 3000);
      if (selectedDoc?.id === docId) {
        setSelectedDoc(null);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete document.');
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleConfirmLocalRecovery = async () => {
    setIsImportingLocal(true);
    setRecoveryError(null);
    try {
      const result = await importLocalDocumentsToCloud();
      setSuccessToast(
        `Successfully imported ${result.importedCount} historical documents into PostgreSQL!`
      );
      setTimeout(() => setSuccessToast(null), 5000);
      setIsRecoveryModalOpen(false);
    } catch (err: any) {
      setRecoveryError(err.message || 'Failed to import local documents to cloud database.');
    } finally {
      setIsImportingLocal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {successToast && (
        <div className="fixed top-24 right-6 z-50 bg-[#00E5BE] text-[#080e1a] px-4 py-2.5 rounded-xl font-bold text-xs shadow-xl flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Cloud Error Banner */}
      {(documentsError || errorMessage) && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage || documentsError}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              refreshDocuments();
            }}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Dismiss / Retry</span>
          </button>
        </div>
      )}

      {/* Historical Local Documents Detected Banner */}
      {isAuthenticated && localDocumentRecoveryStatus.hasLocalData && !hasDismissedRecovery && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-teal-500/10 border border-amber-500/30 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-amber-500/5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0 mt-0.5 sm:mt-0">
              <Archive className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-amber-200 text-sm">
                Historical Offline Document Metadata Detected
              </p>
              <p className="text-slate-300 text-[11px] mt-0.5">
                We found <strong className="text-amber-300 font-semibold">{localDocumentRecoveryStatus.importableCount}</strong> document records in your browser localStorage ready to import to your cloud PostgreSQL database.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setHasDismissedRecovery(true)}
              className="px-3 py-1.5 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => setIsRecoveryModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#080e1a] font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Review & Import</span>
            </button>
          </div>
        </div>
      )}

      {/* Upload Dropzone */}
      <div
        className={`p-8 rounded-2xl border text-center transition-all ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#00E5BE]/10 border border-[#00E5BE]/30 flex items-center justify-center text-[#00E5BE] mx-auto">
            {isUploading ? (
              <div className="w-5 h-5 border-2 border-[#00E5BE] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>

          <div>
            <h3 className="text-base font-bold tracking-tight">Upload Receipt or Bill Invoice</h3>
            <p className="text-xs text-slate-400 mt-1">
              Supports JPG, JPEG, PNG, WEBP, and PDF (up to 10MB). OCR pipeline automatically extracts merchant, date, amounts, taxes, and items.
            </p>
            <p className="text-[11px] text-[#00E5BE] mt-0.5 font-medium">
              Real OCR engine active. Files are securely stored and strictly isolated to your authenticated account.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] cursor-pointer shadow-lg shadow-teal-500/20 transition-transform active:scale-95 disabled:opacity-50">
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span>{isUploading ? 'Extracting via OCR...' : 'Select File to Upload'}</span>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={handleRealUpload}
              disabled={isUploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Document Ingestion Pipeline Details */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isDark ? 'bg-[#0f1a2e] border-[#1b2944]' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="p-5 border-b border-inherit flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold tracking-tight">Uploaded Receipts & OCR Status</h3>
            <p className="text-xs text-slate-400">
              Optical character recognition parsing pipeline for automatic ledger conversion
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && localDocumentRecoveryStatus.hasLocalData && (
              <button
                type="button"
                onClick={() => setIsRecoveryModalOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5"
                title="Recover offline documents"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Recover Offline ({localDocumentRecoveryStatus.importableCount})</span>
              </button>
            )}
            <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-500/10 text-slate-400 font-semibold">
              {documents.length} Receipts Stored
            </span>
          </div>
        </div>

        {documentsLoading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-8 h-8 text-[#00E5BE] animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400">Loading document metadata from cloud database...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-slate-300">No documents uploaded yet</p>
            <p className="text-xs text-slate-500 mt-1">Upload a receipt or invoice above to extract vendor metadata.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr
                  className={`border-b text-slate-400 font-semibold ${
                    isDark ? 'border-slate-800 bg-[#0a1120]/50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-4">OCR Status</th>
                  <th className="py-3 px-4">Parsed Merchant</th>
                  <th className="py-3 px-4">Detected Date</th>
                  <th className="py-3 px-4 text-right">Extracted Total</th>
                  <th className="py-3 px-4 text-center">Confidence</th>
                  <th className="py-3 px-4 text-center">Ledger Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-inherit">
                {documents.map((doc, idx) => {
                  const isExtracted = doc.ocrStatus === 'Extracted';
                  const isFailed = doc.ocrStatus === 'Failed';
                  const isAddedToLedger = Boolean(doc.transactionId);

                  return (
                    <tr
                      key={doc.id ? `${doc.id}-${idx}` : `doc-${idx}`}
                      className={`hover:bg-slate-500/5 transition-colors ${
                        isDark ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          <div>
                            <p className="font-bold text-white">{doc.filename}</p>
                            <p className="text-[10px] text-slate-400">{doc.fileSize} · {doc.uploadDate}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                            isExtracted
                              ? 'bg-[#00E5BE]/20 text-[#00E5BE]'
                              : isFailed
                              ? 'bg-rose-500/20 text-rose-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {isExtracted ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : isFailed ? (
                            <AlertCircle className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          <span>{doc.ocrStatus}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-300">
                        <div>
                          <p className="font-bold text-slate-200">{doc.detectedMerchant || '—'}</p>
                          {doc.category && <p className="text-[10px] text-slate-400 font-medium">{doc.category}</p>}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                        {doc.detectedDate || '—'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-[#00E5BE] tabular-nums whitespace-nowrap">
                        ₹{Number(doc.detectedAmount || 0).toLocaleString('en-IN')}
                      </td>

                      <td className="py-3.5 px-4 text-center tabular-nums text-slate-400">
                        {doc.confidenceScore}%
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {isAddedToLedger ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/15 text-[#00E5BE] inline-flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Added</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">Not Added</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedDoc(doc)}
                            className="px-2.5 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-500/10 text-[11px] font-medium"
                          >
                            Review
                          </button>

                          {isAddedToLedger ? (
                            <span className="px-2.5 py-1 rounded text-slate-500 text-[11px] font-medium cursor-default">
                              Ingested
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDoc(doc);
                              }}
                              className="px-2.5 py-1 rounded bg-[#00E5BE]/10 hover:bg-[#00E5BE] hover:text-[#080e1a] text-[#00E5BE] text-[11px] font-bold transition-colors"
                            >
                              Add to Ledger
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={deletingDocId === doc.id}
                            onClick={() => handleDelete(doc.id, doc.filename)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                            title="Delete Document"
                          >
                            {deletingDocId === doc.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Interactive Review & Transaction Creation Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div
            className={`w-full max-w-2xl rounded-2xl border p-6 shadow-2xl my-8 ${
              isDark ? 'bg-[#0f1a2e] border-[#1b2944] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#00E5BE]/20 flex items-center justify-center text-[#00E5BE]">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Review Receipt & OCR Extraction</h3>
                  <p className="text-xs text-slate-400">
                    Verify extracted information and adjust fields before adding to your financial ledger
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document Preview & Extraction Form */}
            <div className="space-y-4 text-xs">
              {/* Document Image or PDF Access */}
              {selectedDoc.storagePath && (
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
                  {selectedDoc.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(selectedDoc.filename) ? (
                    <div className="space-y-2">
                      <img
                        src={`/api/documents/${selectedDoc.id}/file`}
                        alt="Receipt preview"
                        className="max-h-52 object-contain mx-auto rounded-lg border border-slate-700/60 shadow-md"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <a
                        href={`/api/documents/${selectedDoc.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] text-[#00E5BE] hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open full-resolution receipt</span>
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between py-1 px-3">
                      <span className="text-slate-300 font-medium">Uploaded PDF Document: {selectedDoc.filename}</span>
                      <a
                        href={`/api/documents/${selectedDoc.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-teal-500/20 text-[#00E5BE] font-semibold flex items-center gap-1.5 hover:bg-teal-500/30"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>View PDF</span>
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Status and Confidence Bar */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-500/10 border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium">Extraction Status:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      selectedDoc.ocrStatus === 'Extracted'
                        ? 'bg-[#00E5BE]/20 text-[#00E5BE]'
                        : selectedDoc.ocrStatus === 'Failed'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {selectedDoc.ocrStatus}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium">OCR Engine Confidence:</span>
                  <span className="font-bold text-[#00E5BE] tabular-nums">{selectedDoc.confidenceScore}%</span>
                </div>
              </div>

              {/* Duplicate Warning if already ingested */}
              {selectedDoc.transactionId && (
                <div className="p-3 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#00E5BE]" />
                  <span>
                    This receipt has already been ingested into your ledger as transaction <strong>{selectedDoc.transactionId}</strong>. Duplicate transaction creation is prevented.
                  </span>
                </div>
              )}

              {/* Editable Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Detected Vendor / Merchant
                  </label>
                  <input
                    type="text"
                    value={editMerchant}
                    onChange={(e) => setEditMerchant(e.target.value)}
                    placeholder="e.g. Swiggy, Starbucks"
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-[#00E5BE] ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Total Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    placeholder="0.00"
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-bold text-[#00E5BE] focus:outline-none focus:border-[#00E5BE] ${
                      isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Ledger Category
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-[#00E5BE] ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  >
                    {AVAILABLE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-slate-400">
                      Transaction Date
                    </label>
                    {!editDate && (
                      <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Date required</span>
                      </span>
                    )}
                  </div>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-[#00E5BE] ${
                      !editDate
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : isDark
                        ? 'bg-slate-900 border-slate-700 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Tax Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editTax}
                    onChange={(e) => setEditTax(e.target.value)}
                    placeholder="0.00"
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-[#00E5BE] ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Invoice / Receipt #
                  </label>
                  <input
                    type="text"
                    value={editInvoiceNum}
                    onChange={(e) => setEditInvoiceNum(e.target.value)}
                    placeholder="e.g. INV-2026-089"
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-[#00E5BE] ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              {/* Line items if extracted */}
              {selectedDoc.lineItems && selectedDoc.lineItems.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <span className="text-[11px] font-semibold text-slate-400">Extracted Line Items ({selectedDoc.lineItems.length}):</span>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1 max-h-32 overflow-y-auto">
                    {selectedDoc.lineItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] text-slate-300">
                        <span>{item.description} {item.quantity && item.quantity > 1 ? `(x${item.quantity})` : ''}</span>
                        <span className="font-semibold text-white tabular-nums">
                          {item.price !== undefined ? `₹${item.price}` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="pt-4 mt-5 border-t border-inherit flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                disabled={deletingDocId === selectedDoc.id}
                onClick={() => handleDelete(selectedDoc.id, selectedDoc.filename)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 self-start sm:self-auto"
              >
                Delete Document
              </button>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setSelectedDoc(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Close
                </button>

                <button
                  type="button"
                  disabled={isSavingCorrections}
                  onClick={handleSaveCorrections}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 border border-slate-700"
                >
                  {isSavingCorrections ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Edit2 className="w-3.5 h-3.5" />}
                  <span>Save Corrections</span>
                </button>

                <button
                  type="button"
                  disabled={isIngesting || Boolean(selectedDoc.transactionId)}
                  onClick={handleIngestToLedger}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#00E5BE] text-[#080e1a] hover:bg-[#00cba8] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-teal-500/20"
                >
                  {isIngesting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Ingesting to Ledger...</span>
                    </>
                  ) : selectedDoc.transactionId ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Already Added to Ledger</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Ingest to Ledger</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historical Local Documents Recovery Modal */}
      {isRecoveryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div
            className={`w-full max-w-xl rounded-2xl p-6 border shadow-2xl max-h-[90vh] flex flex-col ${
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
                    Recover Historical Offline Documents
                  </h3>
                  <p className="text-xs text-slate-400">
                    Import historical document metadata stored in this browser into your PostgreSQL cloud database
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecoveryModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
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
                  <div className="text-[11px] font-semibold text-slate-400">Local Documents</div>
                  <div className="text-lg font-bold text-slate-100 tabular-nums">
                    {localDocumentRecoveryStatus.localCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Duplicates in DB</div>
                  <div className="text-lg font-bold text-amber-400 tabular-nums">
                    {localDocumentRecoveryStatus.duplicateCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Ready to Import</div>
                  <div className="text-lg font-bold text-[#00E5BE] tabular-nums">
                    {localDocumentRecoveryStatus.importableCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400">Total Value</div>
                  <div className="text-sm font-bold text-slate-200 tabular-nums mt-1">
                    ₹{localDocumentRecoveryStatus.totalDetectedAmount.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Safe Recovery Notice */}
              <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#00E5BE] mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-[#00E5BE]">Safe & Reversible Cloud Import</p>
                  <p className="text-teal-200/80 leading-relaxed text-[11px]">
                    Before importing to PostgreSQL, an exact timestamped snapshot is permanently archived under <code className="font-mono text-teal-300">finsight_documents_backup_...</code>.
                    Document metadata will be owned by your authenticated account with extracted merchants and invoice totals preserved. Duplicate documents will be safely skipped.
                  </p>
                </div>
              </div>

              {/* Preview Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
                  <span>Candidate Documents Preview</span>
                  <span>{localDocumentRecoveryStatus.candidates.length} item(s)</span>
                </div>
                <div className="border border-inherit rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                      <tr>
                        <th className="py-2 px-3 font-semibold">Filename</th>
                        <th className="py-2 px-3 font-semibold">Vendor</th>
                        <th className="py-2 px-3 text-right font-semibold">Amount</th>
                        <th className="py-2 px-3 text-center font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-inherit">
                      {localDocumentRecoveryStatus.candidates.map((c, idx) => (
                        <tr key={c.item.id || idx} className={isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}>
                          <td className="py-2 px-3 font-medium text-slate-200">
                            <div>{c.item.filename}</div>
                            <div className="text-[10px] text-slate-400">{c.item.fileSize} · {c.item.uploadDate}</div>
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            {c.item.detectedMerchant || '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold tabular-nums text-slate-100 whitespace-nowrap">
                            ₹{Number(c.item.detectedAmount).toLocaleString('en-IN')}
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
                      ))}
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
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Keep in Local Storage
              </button>
              <button
                type="button"
                disabled={isImportingLocal || localDocumentRecoveryStatus.importableCount === 0}
                onClick={handleConfirmLocalRecovery}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#00E5BE] hover:bg-[#00cba8] text-[#080e1a] shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
              >
                {isImportingLocal ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importing into Cloud Database...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>
                      Import {localDocumentRecoveryStatus.importableCount} Documents to Cloud
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
