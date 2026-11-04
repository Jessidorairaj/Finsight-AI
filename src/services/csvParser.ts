/**
 * FinSight AI — Client-Side CSV Statement Parser
 * RFC 4180 compliant CSV parser supporting varied bank statement formats:
 * - HDFC Bank, SBI, ICICI, Axis, Kotak, standard UPI exports
 * - Multi-column support: Debit/Credit, Dr/Cr flag, signed amounts
 * - Intelligent transaction categorization
 * - Row-level validation and duplicate detection
 */

import { Transaction } from '../data/mockData';
import { parseTransactionDate, formatStandardDate, areDatesEqual } from '../utils/dateUtils';

export interface ParsedTransactionCandidate extends Omit<Transaction, 'id'> {
  originalRowNumber: number;
  rawRecord: Record<string, string>;
  isDuplicate?: boolean;
}

export interface ParseValidationError {
  row: number;
  reason: string;
  rawText: string;
}

export interface DuplicateMatchPair {
  candidateDate: string;
  candidateName: string;
  candidateAmount: number;
  candidateType: string;
  matchedLedgerDate: string;
  matchedLedgerName: string;
  matchedLedgerAmount: number;
  matchedLedgerType: string;
}

export interface CSVParseSummary {
  fileName: string;
  totalLines: number;
  parsedCount: number;
  validCount: number;
  duplicateCount: number;
  errorCount: number;
  totalIncome: number;
  totalExpense: number;
  detectedHeaders: string[];
  candidates: ParsedTransactionCandidate[];
  errors: ParseValidationError[];
  duplicateMatchPairs: DuplicateMatchPair[];
}

/**
 * Intelligent category matching based on keywords in description or merchant name
 */
export function autoCategorizeMerchant(name: string, type: 'income' | 'expense'): Transaction['category'] {
  const lower = name.toLowerCase();

  if (type === 'income') {
    return 'Income';
  }

  // Food & Dining
  if (
    /swiggy|zomato|starbucks|mcdonald|kfc|domino|burger|pizza|cafe|restaurant|coffee|chai|bakery|diner|eats|food/i.test(lower)
  ) {
    return 'Food & Dining';
  }

  // Shopping
  if (
    /amazon|flipkart|myntra|zara|h&m|ajio|meesho|tata cliq|retail|mall|store|supermarket|mart|decathlon|ikea|croma|reliance digital/i.test(lower)
  ) {
    return 'Shopping';
  }

  // Bills & Utilities
  if (
    /bescom|electricity|power|water|airtel|jio|vodafone|vi |act corp|broadband|wifi|tatasky|dish|maintenance|utility|gas|cylinder|lpg|rent/i.test(lower)
  ) {
    return 'Bills & Utilities';
  }

  // Transport
  if (
    /uber|ola|rapido|metro|petrol|fuel|indian oil|iocl|hpcl|bharat petroleum|bpcl|shell|toll|fastag|irctc|railway|flight|indigo|air india/i.test(lower)
  ) {
    return 'Transport';
  }

  // Entertainment
  if (
    /netflix|spotify|prime video|hotstar|disney|bookmyshow|pvr|inox|cinema|movie|youtube premium|apple music|steam|playstation|gaming/i.test(lower)
  ) {
    return 'Entertainment';
  }

  // Healthcare
  if (
    /apollo|pharmacy|medplus|1mg|pharmeasy|hospital|clinic|doctor|practo|dent|diagnostic|lab|health/i.test(lower)
  ) {
    return 'Healthcare';
  }

  // Income indicators even if marked as expense accidentally
  if (
    /salary|payroll|dividend|interest credited|cashback|refund|reversal|bonus|freelance|stipend/i.test(lower)
  ) {
    return 'Income';
  }

  return 'Others';
}

/**
 * Low-level RFC-4180 compliant CSV line tokenizer
 * Correctly handles quotes, commas inside quotes, escaped quotes (""), and multiple line break styles.
 */
export function tokenizeCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  const len = csvText.length;
  for (let i = 0; i < len; i++) {
    const char = csvText[i];
    const nextChar = i + 1 < len ? csvText[i + 1] : '';

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i++;
        } else {
          // End of quoted field
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++; // Skip \n in \r\n
        }
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Push remaining field & row if present
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Clean and parse numeric amount strings (e.g. "₹ 1,450.50", "(500)", "Rs. 2500", "500 Cr", "100 Dr")
 */
function parseNumericAmount(val: string | undefined): { amount: number; isNegative: boolean } | null {
  if (!val) return null;
  let str = val.trim();
  if (!str) return null;

  // Ignore dashes, na, nil representing blank cells
  if (/^[-–—]+$/.test(str) || /^(na|n\/a|nil|null|none)$/i.test(str)) {
    return null;
  }

  let isNegative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.slice(1, -1);
  } else if (str.startsWith('-')) {
    isNegative = true;
    str = str.slice(1);
  } else if (/cr$/i.test(str)) {
    str = str.replace(/cr$/i, '').trim();
  } else if (/dr$/i.test(str)) {
    isNegative = true;
    str = str.replace(/dr$/i, '').trim();
  }

  // Remove currency markers, commas, quotes and spaces
  const cleaned = str.replace(/[₹$€£\s,"']|Rs\.?|INR/gi, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  return { amount: Math.abs(num), isNegative: isNegative || num < 0 };
}

/**
 * Normalizes merchant description string for accurate comparison
 */
export function normalizeMerchantDescription(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/^["']+|["']+$/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses raw CSV text into validated transaction candidates
 */
export function parseCSVStatement(
  csvContent: string,
  fileName: string = 'statement.csv',
  existingTransactions: Transaction[] = []
): CSVParseSummary {
  const rows = tokenizeCSV(csvContent);
  const totalLines = rows.length;

  const errors: ParseValidationError[] = [];
  const candidates: ParsedTransactionCandidate[] = [];
  const duplicateMatchPairs: DuplicateMatchPair[] = [];

  if (rows.length === 0) {
    return {
      fileName,
      totalLines: 0,
      parsedCount: 0,
      validCount: 0,
      duplicateCount: 0,
      errorCount: 1,
      totalIncome: 0,
      totalExpense: 0,
      detectedHeaders: [],
      candidates: [],
      errors: [{ row: 1, reason: 'File is completely empty.', rawText: '' }],
      duplicateMatchPairs: [],
    };
  }

  // Find the header row (scan first 10 rows for columns like "date", "description", "amount", etc.)
  let headerRowIndex = -1;
  let colMap: Record<string, number> = {};

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    const candidateMap: Record<string, number> = {};

    row.forEach((cell, idx) => {
      const lower = cell.toLowerCase().replace(/[^a-z0-9]/g, '');
      candidateMap[lower] = idx;
    });

    const hasDate = Object.keys(candidateMap).some(k =>
      k.includes('date') || k === 'txndate' || k === 'valuedate' || k === 'postingdate'
    );
    const hasDesc = Object.keys(candidateMap).some(k =>
      k.includes('desc') || k.includes('narration') || k.includes('particular') || k.includes('merchant') || k.includes('details') || k.includes('remarks') || k.includes('payee') || k === 'name'
    );
    const hasAmount = Object.keys(candidateMap).some(k =>
      k.includes('amount') || k.includes('debit') || k.includes('withdrawal') || k.includes('credit') || k.includes('deposit')
    );

    if (hasDate && (hasDesc || hasAmount)) {
      headerRowIndex = r;
      break;
    }
  }

  // If no clear bank header found, default to first row
  if (headerRowIndex === -1) {
    headerRowIndex = 0;
  }

  const rawHeaders = rows[headerRowIndex];
  colMap = {};
  rawHeaders.forEach((h, idx) => {
    const key = h.toLowerCase().trim();
    colMap[key] = idx;
  });

  // Find column positions
  const findColIndex = (...patterns: RegExp[]) => {
    for (const pat of patterns) {
      for (const [key, idx] of Object.entries(colMap)) {
        if (pat.test(key)) return idx;
      }
    }
    return -1;
  };

  const dateIdx = findColIndex(
    /^(date|txn.?date|transaction.?date|value.?date|posting.?date)$/i,
    /date/i
  );
  const descIdx = findColIndex(
    /^(narration|description|particulars|merchant|details|remarks|payee|name|trans.?details|party)$/i,
    /(narration|description|particulars|merchant)/i
  );
  const debitIdx = findColIndex(
    /^(debit|withdrawal|dr.?amount|withdrawals|dr|debit.?amount|withdrawal.?amt)$/i,
    /debit/i
  );
  const creditIdx = findColIndex(
    /^(credit|deposit|cr.?amount|deposits|cr|credit.?amount|deposit.?amt)$/i,
    /credit/i
  );
  const amountIdx = findColIndex(
    /^(amount|total|net.?amount|transaction.?amount)$/i,
    /amount/i
  );
  const balanceIdx = findColIndex(
    /^(balance|closing.?balance|running.?balance|bal)$/i,
    /balance/i
  );
  const typeIdx = findColIndex(
    /^(type|dr\/?cr|cr\/?dr|txn.?type|transaction.?type|mode)$/i
  );
  const catIdx = findColIndex(
    /^(category|tag|classification)$/i
  );
  const methodIdx = findColIndex(
    /^(payment.?method|channel|method|instrument)$/i
  );
  const notesIdx = findColIndex(
    /^(notes|note|memo|ref|reference|chq.?no)$/i
  );

  if (dateIdx === -1 && descIdx === -1 && amountIdx === -1 && debitIdx === -1) {
    errors.push({
      row: headerRowIndex + 1,
      reason: 'Could not identify required columns (Date, Description, Amount/Debit/Credit).',
      rawText: rawHeaders.join(', '),
    });
  }

  // Parse each data row
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    if (row.length === 0 || row.every(c => !c || c.trim().length === 0)) {
      continue; // Skip blank line
    }

    const rawRecord: Record<string, string> = {};
    rawHeaders.forEach((h, hIdx) => {
      rawRecord[h || `Column_${hIdx + 1}`] = row[hIdx] || '';
    });

    // 1. Parse Date
    const rawDateStr = dateIdx !== -1 ? row[dateIdx] : '';
    const parsedDate = parseTransactionDate(rawDateStr);
    if (!parsedDate) {
      errors.push({
        row: rowNum,
        reason: `Invalid or missing date format: "${rawDateStr || 'EMPTY'}"`,
        rawText: row.join(', '),
      });
      continue;
    }

    // 2. Parse Description / Merchant
    let desc = descIdx !== -1 ? row[descIdx] : '';
    if (!desc || desc.trim().length === 0) {
      desc = 'Bank Transaction';
    }
    desc = desc.trim().replace(/^["']+|["']+$/g, '');

    // 3. Determine Amount and Transaction Type
    let txType: 'income' | 'expense' = 'expense';
    let txAmount = 0;

    const debitRaw = debitIdx !== -1 ? row[debitIdx] : '';
    const creditRaw = creditIdx !== -1 ? row[creditIdx] : '';
    const balanceRaw = balanceIdx !== -1 ? row[balanceIdx] : '';

    const debitVal = debitIdx !== -1 ? parseNumericAmount(debitRaw) : null;
    const creditVal = creditIdx !== -1 ? parseNumericAmount(creditRaw) : null;
    const genericAmountVal = amountIdx !== -1 ? parseNumericAmount(row[amountIdx]) : null;

    if (debitVal && debitVal.amount > 0) {
      txAmount = debitVal.amount;
      txType = 'expense';
    } else if (creditVal && creditVal.amount > 0) {
      txAmount = creditVal.amount;
      txType = 'income';
    } else if (genericAmountVal && genericAmountVal.amount > 0) {
      txAmount = genericAmountVal.amount;

      // Check Type column if present
      if (typeIdx !== -1) {
        const rawType = (row[typeIdx] || '').toLowerCase();
        if (/cr|credit|deposit|income/i.test(rawType)) {
          txType = 'income';
        } else if (/dr|debit|withdrawal|expense/i.test(rawType)) {
          txType = 'expense';
        } else if (genericAmountVal.isNegative) {
          txType = 'expense';
        }
      } else if (genericAmountVal.isNegative) {
        txType = 'expense';
      } else {
        // If amount is positive and no explicit type: check description keywords
        if (/salary|dividend|interest|credit|payout|refund|stipend|bonus/i.test(desc)) {
          txType = 'income';
        } else {
          txType = 'expense';
        }
      }
    } else {
      if (balanceRaw && parseNumericAmount(balanceRaw)) {
        errors.push({
          row: rowNum,
          reason: `Balance summary line without debit or credit (Balance: "${balanceRaw}").`,
          rawText: row.join(', '),
        });
      } else {
        errors.push({
          row: rowNum,
          reason: `Missing or non-numeric amount (Debit: "${debitRaw || ''}", Credit: "${creditRaw || ''}").`,
          rawText: row.join(', '),
        });
      }
      continue;
    }

    if (txAmount <= 0) {
      errors.push({
        row: rowNum,
        reason: `Transaction amount must be greater than zero (found: ${txAmount}).`,
        rawText: row.join(', '),
      });
      continue;
    }

    // 4. Category
    let category: Transaction['category'] = 'Others';
    if (catIdx !== -1 && row[catIdx]) {
      const explicitCat = row[catIdx].trim();
      const validCategories: Array<Transaction['category']> = [
        'Food & Dining',
        'Shopping',
        'Bills & Utilities',
        'Transport',
        'Entertainment',
        'Healthcare',
        'Others',
        'Income',
      ];
      const matched = validCategories.find(c => c.toLowerCase() === explicitCat.toLowerCase());
      if (matched) {
        category = matched;
      } else {
        category = autoCategorizeMerchant(desc, txType);
      }
    } else {
      category = autoCategorizeMerchant(desc, txType);
    }

    // Ensure income transactions are tagged with Income category
    if (txType === 'income') {
      category = 'Income';
    }

    // 5. Payment Method & Notes
    let paymentMethod = methodIdx !== -1 ? row[methodIdx] : '';
    if (!paymentMethod) {
      if (/upi|gpay|phonepe|paytm/i.test(desc)) {
        paymentMethod = 'UPI';
      } else if (/neft|rtgs|imps|transfer/i.test(desc)) {
        paymentMethod = 'Bank Transfer';
      } else if (/pos|card|visa|mastercard|rupay/i.test(desc)) {
        paymentMethod = 'Debit Card';
      } else {
        paymentMethod = txType === 'income' ? 'Direct Deposit' : 'UPI';
      }
    }

    const notes = notesIdx !== -1 && row[notesIdx] ? row[notesIdx].trim() : `Imported from ${fileName}`;
    const standardizedDate = formatStandardDate(parsedDate);

    // 6. Check for duplicate against existing ledger
    // Compare normalized date, exact numeric amount, transaction type, and normalized merchant description
    let matchedLedgerTx: Transaction | undefined;
    if (existingTransactions && existingTransactions.length > 0) {
      matchedLedgerTx = existingTransactions.find(
        t =>
          t.type === txType &&
          Math.abs(Number(t.amount) - txAmount) < 0.01 &&
          areDatesEqual(t.date, standardizedDate) &&
          normalizeMerchantDescription(t.name) === normalizeMerchantDescription(desc)
      );
    }

    const isDuplicate = !!matchedLedgerTx;
    if (matchedLedgerTx) {
      duplicateMatchPairs.push({
        candidateDate: standardizedDate,
        candidateName: desc,
        candidateAmount: txAmount,
        candidateType: txType,
        matchedLedgerDate: matchedLedgerTx.date,
        matchedLedgerName: matchedLedgerTx.name,
        matchedLedgerAmount: Number(matchedLedgerTx.amount),
        matchedLedgerType: matchedLedgerTx.type,
      });
    }

    candidates.push({
      originalRowNumber: rowNum,
      name: desc,
      amount: txAmount,
      date: standardizedDate,
      type: txType,
      category,
      paymentMethod,
      notes,
      status: 'Completed',
      rawRecord,
      isDuplicate,
    });
  }

  const validCount = candidates.length;
  const duplicateCount = candidates.filter(c => c.isDuplicate).length;
  const totalIncome = candidates
    .filter(c => c.type === 'income')
    .reduce((sum, c) => sum + c.amount, 0);
  const totalExpense = candidates
    .filter(c => c.type === 'expense')
    .reduce((sum, c) => sum + c.amount, 0);

  return {
    fileName,
    totalLines,
    parsedCount: rows.length - (headerRowIndex + 1),
    validCount,
    duplicateCount,
    errorCount: errors.length,
    totalIncome,
    totalExpense,
    detectedHeaders: rawHeaders,
    candidates,
    errors,
    duplicateMatchPairs,
  };
}

/**
 * Returns an authentic bank CSV string containing 18 transactions dated October 1–22, 2026
 */
export function getSampleBankCSV(): string {
  return `Date,Description,Debit,Credit,Payment Mode,Category
01/10/2026,"Monthly Engineering Salary Credit",,55000.00,Direct Deposit,Income
02/10/2026,"Swiggy Food Delivery",650.00,,UPI,Food & Dining
03/10/2026,"Zepto Quick Groceries",1200.00,,UPI,Food & Dining
05/10/2026,"Amazon Retail India",2999.00,,Credit Card,Shopping
06/10/2026,"BESCOM Electricity Power Bill",1750.00,,Net Banking,Bills & Utilities
08/10/2026,"Namma Metro Smart Card Recharge",800.00,,UPI,Transport
10/10/2026,"Apollo Pharmacy Healthcare",450.00,,UPI,Healthcare
12/10/2026,"Netflix India 4K Subscription",649.00,,Auto Debit,Entertainment
14/10/2026,"Uber Rides Daily Commute",380.00,,UPI,Transport
15/10/2026,"ACT Fibernet High-Speed Broadband",1199.00,,Net Banking,Bills & Utilities
16/10/2026,"Starbucks Coffee Roasters",420.00,,Credit Card,Food & Dining
17/10/2026,"BookMyShow Movie Tickets",750.00,,UPI,Entertainment
18/10/2026,"Indian Oil Fuel Station",1500.00,,Credit Card,Transport
19/10/2026,"Zara Fashion Menswear",3400.00,,Credit Card,Shopping
20/10/2026,"Zomato Office Lunch",540.00,,UPI,Food & Dining
21/10/2026,"Airtel Postpaid Family Plan",899.00,,UPI,Bills & Utilities
22/10/2026,"Freelance UI/UX Project Payout",,15000.00,IMPS,Income
22/10/2026,"Barbeque Nation Dinner Buffet",2100.00,,Credit Card,Food & Dining`;
}
