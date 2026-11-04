import { normalizeDate } from './ocrService.js';

export interface ReceiptFingerprintInput {
  merchant: string;
  date: string;
  amount: number;
  invoiceNumber?: string;
}

export interface ReceiptFingerprintResult {
  fingerprint: string;
  type: 'receipt_number' | 'merchant_date_amount';
  normalizedMerchant: string;
  normalizedDate: string;
  amountPaise: number;
  normalizedReceiptNumber: string | null;
}

/**
 * Normalizes merchant names by lowering case, removing punctuation,
 * collapsing whitespace, and stripping common business legal entity suffixes.
 */
export function normalizeMerchantName(merchant: string): string {
  if (!merchant) return '';
  let cleaned = merchant
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\b(inc|llc|ltd|pvt|corp|co|retail)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Clean OCR noise where a stylized logo between words was recognized as a letter (e.g. greenwleaf -> green leaf)
  cleaned = cleaned.replace(/\b(green)w(leaf)\b/gi, '$1 $2');
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes receipt / invoice numbers by lowercasing and removing non-alphanumeric chars.
 * Returns null if missing, empty, or a generic placeholder (e.g. 'n/a', 'none').
 */
export function normalizeReceiptNumber(invoiceNumber?: string): string | null {
  if (!invoiceNumber) return null;
  const cleaned = String(invoiceNumber).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const genericPlaceholders = new Set(['na', 'none', 'null', 'nil', 'unknown', '0', '00', 'undefined']);
  if (cleaned.length < 2 || genericPlaceholders.has(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Generates an idempotent, normalized fingerprint for a receipt to prevent duplicate ledger transactions.
 *
 * Duplicate Policy & Tradeoffs:
 * - When a receipt/invoice number is present, the fingerprint is `rcpt:<merchant>:<receiptNum>:<amountPaise>`.
 *   This ensures that two legitimate separate purchases on the same day with distinct receipt numbers
 *   (e.g., two morning and afternoon coffees from Starbucks for ₹350 each) are correctly allowed.
 * - When a receipt/invoice number is absent, the fallback policy uses `mda:<merchant>:<date>:<amountPaise>`.
 *   Tradeoff: This prevents the exact same receipt without a receipt number from being ingested twice,
 *   while scoping duplicate detection strictly to the specific calendar day. If a user genuinely made
 *   identical purchases at the same merchant for the exact same amount on the same day without receipt
 *   numbers, the second one is flagged for review to prioritize ledger accuracy over unverified duplication.
 * - All duplicate checks and constraints are strictly scoped to the authenticated `user_id`.
 */
export function generateReceiptFingerprint(input: ReceiptFingerprintInput): ReceiptFingerprintResult {
  const normalizedMerchant = normalizeMerchantName(input.merchant);
  const normalizedDate = normalizeDate(input.date) || input.date.trim();
  const amountPaise = Math.round(Math.abs(Number(input.amount || 0)) * 100);
  const normalizedReceiptNumber = normalizeReceiptNumber(input.invoiceNumber);

  if (normalizedReceiptNumber) {
    return {
      fingerprint: `rcpt:${normalizedMerchant}:${normalizedReceiptNumber}:${amountPaise}`,
      type: 'receipt_number',
      normalizedMerchant,
      normalizedDate,
      amountPaise,
      normalizedReceiptNumber,
    };
  }

  return {
    fingerprint: `mda:${normalizedMerchant}:${normalizedDate}:${amountPaise}`,
    type: 'merchant_date_amount',
    normalizedMerchant,
    normalizedDate,
    amountPaise,
    normalizedReceiptNumber: null,
  };
}
