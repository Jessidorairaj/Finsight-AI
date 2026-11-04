import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  getAllDocuments,
  getDocumentById,
  insertDocument,
  updateDocument,
  deleteDocumentById,
  bulkInsertDocuments,
} from '../repositories/financialEntitiesRepository.js';
import {
  insertTransaction,
  findTransactionByReceiptFingerprint,
} from '../repositories/transactionRepository.js';
import { processDocumentOcr } from '../services/ocrService.js';
import { generateReceiptFingerprint } from '../services/receiptFingerprintService.js';

export const documentsRouter = Router();

// Enforce authentication on all document operations
documentsRouter.use(requireAuth);

documentsRouter.use((_req, res, next) => {
  res.setHeader('X-Environment', 'development-isolated');
  res.setHeader('X-Auth-Mode', 'authenticated-user-scoped');
  next();
});

// Configure base storage directory for uploaded documents
const UPLOADS_BASE_DIR = path.resolve(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(UPLOADS_BASE_DIR)) {
  fs.mkdirSync(UPLOADS_BASE_DIR, { recursive: true });
}

// Multer in-memory storage with strict file type and size constraints
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    if (!ALLOWED_MIME_TYPES.includes(mime) || !ALLOWED_EXTENSIONS.includes(ext)) {
      const err = new Error('UNSUPPORTED_FILE_TYPE: Only JPG, JPEG, PNG, WEBP, and PDF files are supported.');
      (err as any).code = 'UNSUPPORTED_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
}).single('file');

/**
 * Maps merchant name or keywords to standard ledger categories
 */
function inferCategoryFromMerchant(merchant: string): string {
  const m = (merchant || '').toLowerCase();
  if (/swiggy|zomato|starbucks|mcdonald|food|dining|restaurant|cafe|pizza|burger|bakery|meghana|barbeque/i.test(m)) {
    return 'Food & Dining';
  }
  if (/amazon|flipkart|myntra|zara|uniqlo|h&m|decathlon|croma|retail|market|superstore|mart|mall/i.test(m)) {
    return 'Shopping';
  }
  if (/bescom|power|electricity|water|gas|lpg|indane|act\s*fibernet|airtel|jio|broadband|wifi|utility|maintenance|rent/i.test(m)) {
    return 'Bills & Utilities';
  }
  if (/uber|ola|metro|fuel|petrol|diesel|iocl|shell|hpcl|bharat\s*petroleum|transport|cab|taxi|train|irctc/i.test(m)) {
    return 'Transport';
  }
  if (/netflix|spotify|prime|cinema|movie|pvr|inox|cult|entertainment|gaming|steam/i.test(m)) {
    return 'Entertainment';
  }
  return 'Others';
}

// 1. GET /api/documents - List documents for authenticated user
documentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const list = await getAllDocuments(userId);
    res.status(200).json(list);
  } catch (error) {
    console.error('[API /api/documents GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to retrieve documents.' });
  }
});

// 2. GET /api/documents/:id - Get single document metadata
documentsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const item = await getDocumentById(req.params.id, userId);
    if (!item) {
      res.status(404).json({ status: 'error', message: `Document "${req.params.id}" not found.` });
      return;
    }
    res.status(200).json(item);
  } catch (error) {
    console.error('[API /api/documents/:id GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to retrieve document.' });
  }
});

// 3. GET /api/documents/:id/file - Stream file binary strictly scoped to authenticated owner
documentsRouter.get('/:id/file', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const item = await getDocumentById(req.params.id, userId);
    if (!item) {
      res.status(404).json({ status: 'error', message: `Document "${req.params.id}" not found.` });
      return;
    }

    if (!item.storagePath) {
      res.status(404).json({ status: 'error', message: 'No stored physical file associated with this document record.' });
      return;
    }

    // Secure path traversal guard
    const absoluteFilePath = path.resolve(item.storagePath);
    if (!absoluteFilePath.startsWith(UPLOADS_BASE_DIR) || !fs.existsSync(absoluteFilePath)) {
      res.status(404).json({ status: 'error', message: 'Document file not found on disk.' });
      return;
    }

    res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.filename)}"`);
    fs.createReadStream(absoluteFilePath).pipe(res);
  } catch (error) {
    console.error('[API /api/documents/:id/file GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to read document file.' });
  }
});

// Rate limiting on document uploads & OCR: 25 in production, 200 in dev/test per 15 minutes per IP
const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 25 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many document uploads. Please wait 15 minutes before uploading more documents.',
  },
});

// 4. POST /api/documents/upload - Real document upload, storage, and OCR extraction
documentsRouter.post('/upload', uploadRateLimiter, (req: Request, res: Response) => {
  uploadMiddleware(req, res, async (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          status: 'error',
          message: 'File exceeds maximum upload size of 10MB.',
        });
        return;
      }
      if (err.code === 'UNSUPPORTED_FILE_TYPE') {
        res.status(400).json({
          status: 'error',
          message: err.message,
        });
        return;
      }
      res.status(400).json({
        status: 'error',
        message: err.message || 'File upload failed.',
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({ status: 'error', message: 'No file uploaded. Please attach a file under key "file".' });
      return;
    }

    try {
      const userId = req.user!.id;
      const file = req.file;

      // Safe filename sanitization
      const cleanOriginalName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
      const ext = path.extname(cleanOriginalName).toLowerCase();
      const uniqueDocId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const safeFilenameOnDisk = `${uniqueDocId}_${cleanOriginalName}`;

      // User-scoped storage directory
      const userDir = path.join(UPLOADS_BASE_DIR, userId);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }

      const filePathOnDisk = path.join(userDir, safeFilenameOnDisk);
      fs.writeFileSync(filePathOnDisk, file.buffer);

      // Format file size
      const sizeKb = Math.round(file.size / 1024);
      const fileSizeStr = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

      // Run real OCR processing
      const ocrResult = await processDocumentOcr(file.buffer, file.mimetype, cleanOriginalName);

      // Do not silently substitute today's date if extraction failed; transparently mark for review
      const finalDate = ocrResult.date || '';

      // Generate normalized receipt fingerprint for cross-document duplicate tracking
      const { fingerprint: uploadFingerprint } = generateReceiptFingerprint({
        merchant: ocrResult.merchant || cleanOriginalName,
        date: finalDate,
        amount: ocrResult.totalAmount || 0,
        invoiceNumber: ocrResult.invoiceNumber || '',
      });

      // Save document record in PostgreSQL
      const created = await insertDocument(
        {
          id: uniqueDocId,
          filename: cleanOriginalName,
          uploadDate: 'Just now',
          fileSize: fileSizeStr,
          ocrStatus: ocrResult.ocrStatus,
          detectedMerchant: ocrResult.merchant || '',
          detectedAmount: ocrResult.totalAmount || 0,
          detectedDate: finalDate,
          confidenceScore: ocrResult.confidenceScore || 0,
          storagePath: filePathOnDisk,
          mimeType: file.mimetype,
          currency: ocrResult.currency || 'INR',
          taxAmount: ocrResult.taxAmount || 0,
          invoiceNumber: ocrResult.invoiceNumber || '',
          lineItems: ocrResult.lineItems || [],
          category: ocrResult.category || (ocrResult.merchant ? inferCategoryFromMerchant(ocrResult.merchant) : 'Others'),
          receiptFingerprint: uploadFingerprint,
        },
        userId
      );

      res.status(201).json({
        status: 'ok',
        document: created,
        ocrDetails: {
          engineUsed: ocrResult.engineUsed,
          rawConfidence: ocrResult.confidenceScore,
          fieldConfidence: ocrResult.fieldConfidence,
          receiptFingerprint: uploadFingerprint,
          extractedFields: {
            merchant: created.detectedMerchant,
            amount: created.detectedAmount,
            date: created.detectedDate,
            currency: created.currency,
            taxAmount: created.taxAmount,
            invoiceNumber: created.invoiceNumber,
            category: created.category,
            lineItemsCount: created.lineItems ? created.lineItems.length : 0,
          },
        },
      });
    } catch (processError) {
      console.error('[API /api/documents/upload Processing Error]:', processError instanceof Error ? processError.message : 'Unknown');
      res.status(500).json({ status: 'error', message: 'Failed to process and store document.' });
    }
  });
});

// 5. POST /api/documents/:id/create-transaction - Convert reviewed receipt to transaction with duplicate prevention
documentsRouter.post('/:id/create-transaction', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const docId = req.params.id;

    const doc = await getDocumentById(docId, userId);
    if (!doc) {
      res.status(404).json({ status: 'error', message: `Document "${docId}" not found.` });
      return;
    }

    // Accidental duplicate creation prevention
    if (doc.transactionId) {
      res.status(409).json({
        status: 'error',
        message: `This document has already been ingested into your ledger as transaction "${doc.transactionId}".`,
        existingTransactionId: doc.transactionId,
      });
      return;
    }

    // Optional user corrections submitted from the review screen
    const {
      name,
      amount,
      category,
      date,
      taxAmount,
      invoiceNumber,
      paymentMethod,
      notes,
    } = req.body || {};

    const finalName = (name && String(name).trim()) || doc.detectedMerchant || doc.filename || 'Receipt Ingestion';
    const finalAmount = amount !== undefined ? Number(amount) : Number(doc.detectedAmount || 0);
    const finalCategory = (category && String(category).trim()) || doc.category || inferCategoryFromMerchant(finalName);
    const finalDate = (date && String(date).trim()) || doc.detectedDate || new Date().toISOString().split('T')[0];
    const finalTax = taxAmount !== undefined ? Number(taxAmount) : (doc.taxAmount || 0);
    const finalInvoiceNum = invoiceNumber !== undefined ? String(invoiceNumber).trim() : (doc.invoiceNumber || '');
    const finalNotes = (notes && String(notes).trim()) || `Receipt "${doc.filename}" (${doc.confidenceScore}% OCR confidence)`;

    // Generate normalized receipt fingerprint for cross-document duplicate detection
    const { fingerprint, type: fpType } = generateReceiptFingerprint({
      merchant: finalName,
      date: finalDate,
      amount: finalAmount,
      invoiceNumber: finalInvoiceNum,
    });

    // Cross-document duplicate detection check
    const existingTx = await findTransactionByReceiptFingerprint(userId, fingerprint);
    if (existingTx) {
      // Idempotently link this document to the existing transaction so it reflects ingestion
      const linkedDoc = await updateDocument(docId, userId, {
        detectedMerchant: finalName,
        detectedAmount: finalAmount,
        detectedDate: finalDate,
        category: finalCategory,
        taxAmount: finalTax,
        invoiceNumber: finalInvoiceNum,
        transactionId: existingTx.id,
        ocrStatus: 'Extracted',
        receiptFingerprint: fingerprint,
      });

      const duplicateDetailMsg =
        fpType === 'receipt_number'
          ? `Duplicate receipt: Receipt #${finalInvoiceNum} from "${finalName}" for ₹${finalAmount} has already been ingested into your ledger as transaction "${existingTx.id}".`
          : `Duplicate receipt: A transaction matching "${finalName}" on ${finalDate} for ₹${finalAmount} has already been ingested into your ledger as transaction "${existingTx.id}".`;

      res.status(409).json({
        status: 'error',
        message: duplicateDetailMsg,
        existingTransactionId: existingTx.id,
        duplicateReason: 'cross_document_duplicate',
        fingerprint,
        document: linkedDoc,
      });
      return;
    }

    // Insert transaction into PostgreSQL transactions table with atomic uniqueness constraint
    let newTx: any;
    try {
      newTx = await insertTransaction(
        {
          name: finalName,
          category: finalCategory,
          amount: Math.abs(finalAmount),
          date: finalDate,
          type: 'expense',
          paymentMethod: paymentMethod || 'Receipt OCR',
          status: 'Completed',
          notes: finalNotes,
          receiptFingerprint: fingerprint,
        },
        userId
      );
    } catch (insertErr: any) {
      // Gracefully handle concurrent request race condition caught by PostgreSQL unique index
      if (insertErr.code === '23505' || insertErr.message?.includes('uq_transactions_user_receipt_fingerprint')) {
        const racedTx = await findTransactionByReceiptFingerprint(userId, fingerprint);
        if (racedTx) {
          const linkedDoc = await updateDocument(docId, userId, {
            detectedMerchant: finalName,
            detectedAmount: finalAmount,
            detectedDate: finalDate,
            category: finalCategory,
            taxAmount: finalTax,
            invoiceNumber: finalInvoiceNum,
            transactionId: racedTx.id,
            ocrStatus: 'Extracted',
            receiptFingerprint: fingerprint,
          });

          const duplicateDetailMsg =
            fpType === 'receipt_number'
              ? `Duplicate receipt: Receipt #${finalInvoiceNum} from "${finalName}" for ₹${finalAmount} has already been ingested into your ledger as transaction "${racedTx.id}".`
              : `Duplicate receipt: A transaction matching "${finalName}" on ${finalDate} for ₹${finalAmount} has already been ingested into your ledger as transaction "${racedTx.id}".`;

          res.status(409).json({
            status: 'error',
            message: duplicateDetailMsg,
            existingTransactionId: racedTx.id,
            duplicateReason: 'cross_document_duplicate',
            fingerprint,
            document: linkedDoc,
          });
          return;
        }
      }
      throw insertErr;
    }

    // Atomically persist corrected fields and link transaction ID on document record in Neon
    const updatedDoc = await updateDocument(docId, userId, {
      detectedMerchant: finalName,
      detectedAmount: finalAmount,
      detectedDate: finalDate,
      category: finalCategory,
      taxAmount: finalTax,
      invoiceNumber: finalInvoiceNum,
      transactionId: newTx.id,
      ocrStatus: 'Extracted',
      receiptFingerprint: fingerprint,
    });

    res.status(201).json({
      status: 'ok',
      message: 'Transaction successfully created from receipt.',
      transaction: newTx,
      document: updatedDoc,
    });
  } catch (error) {
    console.error('[API /api/documents/:id/create-transaction Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to create transaction from document.' });
  }
});

// 6. POST /api/documents - Legacy/manual metadata creation
documentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      id,
      filename,
      uploadDate,
      fileSize,
      ocrStatus,
      detectedMerchant,
      detectedAmount,
      detectedDate,
      confidenceScore,
      storagePath,
      mimeType,
      currency,
      taxAmount,
      invoiceNumber,
      lineItems,
      transactionId,
      category,
    } = req.body;

    if (!filename || typeof filename !== 'string' || filename.trim() === '') {
      res.status(400).json({ status: 'error', message: 'Field "filename" must be a non-empty string.' });
      return;
    }

    if (id && typeof id === 'string') {
      const existing = await getDocumentById(id.trim(), userId);
      if (existing) {
        res.status(409).json({ status: 'error', message: `Document ID "${id}" already exists.` });
        return;
      }
    }

    const created = await insertDocument(
      {
        id: id ? String(id).trim() : undefined,
        filename: String(filename).trim(),
        uploadDate: uploadDate ? String(uploadDate).trim() : 'Just now',
        fileSize: fileSize ? String(fileSize).trim() : '0 KB',
        ocrStatus: ocrStatus || 'Processing',
        detectedMerchant: detectedMerchant ? String(detectedMerchant).trim() : '',
        detectedAmount: detectedAmount !== undefined ? Number(detectedAmount) : 0,
        detectedDate: detectedDate ? String(detectedDate).trim() : '',
        confidenceScore: confidenceScore !== undefined ? Number(confidenceScore) : 0,
        storagePath: storagePath ? String(storagePath).trim() : undefined,
        mimeType: mimeType ? String(mimeType).trim() : undefined,
        currency: currency ? String(currency).trim() : 'INR',
        taxAmount: taxAmount !== undefined ? Number(taxAmount) : 0,
        invoiceNumber: invoiceNumber ? String(invoiceNumber).trim() : '',
        lineItems: Array.isArray(lineItems) ? lineItems : undefined,
        transactionId: transactionId ? String(transactionId).trim() : undefined,
        category: category ? String(category).trim() : undefined,
      },
      userId
    );

    res.status(201).json(created);
  } catch (error) {
    console.error('[API /api/documents POST Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to create document metadata.' });
  }
});

// 7. POST /api/documents/bulk - Bulk create metadata
documentsRouter.post('/bulk', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { documents, onConflict } = req.body;
    if (!Array.isArray(documents)) {
      res.status(400).json({ status: 'error', message: 'Field "documents" must be an array.' });
      return;
    }
    const result = await bulkInsertDocuments(documents, userId, onConflict || 'skip');
    res.status(201).json({
      status: 'ok',
      documents: result.inserted,
      insertedCount: result.inserted.length,
      skippedCount: result.skippedCount,
    });
  } catch (error) {
    console.error('[API /api/documents/bulk POST Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Bulk document creation failed.' });
  }
});

// 8. PUT /api/documents/:id - Update document metadata & manual review corrections
documentsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await getDocumentById(req.params.id, userId);
    if (!existing) {
      res.status(404).json({ status: 'error', message: `Document "${req.params.id}" not found.` });
      return;
    }

    const {
      filename,
      ocrStatus,
      detectedMerchant,
      detectedAmount,
      detectedDate,
      confidenceScore,
      storagePath,
      mimeType,
      currency,
      taxAmount,
      invoiceNumber,
      lineItems,
      transactionId,
      category,
    } = req.body;

    const validStatuses = ['Extracted', 'Processing', 'Pending Review', 'Failed'];
    if (ocrStatus !== undefined && !validStatuses.includes(ocrStatus)) {
      res.status(400).json({ status: 'error', message: `Field "ocrStatus" must be one of: ${validStatuses.join(', ')}.` });
      return;
    }

    const effectiveMerchant = detectedMerchant !== undefined ? String(detectedMerchant).trim() : existing.detectedMerchant;
    const effectiveAmount = detectedAmount !== undefined ? Number(detectedAmount) : existing.detectedAmount;
    const effectiveDate = detectedDate !== undefined ? String(detectedDate).trim() : existing.detectedDate;
    const effectiveInvoiceNum = invoiceNumber !== undefined ? String(invoiceNumber).trim() : (existing.invoiceNumber || '');

    const { fingerprint: updatedFp } = generateReceiptFingerprint({
      merchant: effectiveMerchant,
      date: effectiveDate,
      amount: effectiveAmount,
      invoiceNumber: effectiveInvoiceNum,
    });

    const updated = await updateDocument(req.params.id, userId, {
      filename: filename ? String(filename).trim() : undefined,
      ocrStatus: ocrStatus || undefined,
      detectedMerchant: detectedMerchant !== undefined ? String(detectedMerchant).trim() : undefined,
      detectedAmount: detectedAmount !== undefined ? Number(detectedAmount) : undefined,
      detectedDate: detectedDate !== undefined ? String(detectedDate).trim() : undefined,
      confidenceScore: confidenceScore !== undefined ? Number(confidenceScore) : undefined,
      storagePath: storagePath !== undefined ? String(storagePath).trim() : undefined,
      mimeType: mimeType !== undefined ? String(mimeType).trim() : undefined,
      currency: currency !== undefined ? String(currency).trim() : undefined,
      taxAmount: taxAmount !== undefined ? Number(taxAmount) : undefined,
      invoiceNumber: invoiceNumber !== undefined ? String(invoiceNumber).trim() : undefined,
      lineItems: Array.isArray(lineItems) ? lineItems : undefined,
      transactionId: transactionId !== undefined ? String(transactionId).trim() : undefined,
      category: category !== undefined ? String(category).trim() : undefined,
      receiptFingerprint: updatedFp,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error('[API /api/documents/:id PUT Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to update document metadata.' });
  }
});

// 9. DELETE /api/documents/:id - Delete document metadata and stored file
documentsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await getDocumentById(req.params.id, userId);
    if (!existing) {
      res.status(404).json({ status: 'error', message: `Document "${req.params.id}" not found.` });
      return;
    }

    // Safely remove file on disk if exists
    if (existing.storagePath) {
      try {
        const resolvedPath = path.resolve(existing.storagePath);
        if (resolvedPath.startsWith(UPLOADS_BASE_DIR) && fs.existsSync(resolvedPath)) {
          fs.unlinkSync(resolvedPath);
        }
      } catch (fileErr) {
        console.warn(`[Delete Document] Could not delete disk file "${existing.storagePath}":`, fileErr);
      }
    }

    await deleteDocumentById(req.params.id, userId);
    res.status(200).json({ status: 'ok', message: `Document "${req.params.id}" deleted.`, id: req.params.id });
  } catch (error) {
    console.error('[API /api/documents/:id DELETE Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to delete document metadata.' });
  }
});
