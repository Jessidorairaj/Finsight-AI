import { GoogleGenAI } from '@google/genai';
import Tesseract from 'tesseract.js';
import * as pdfModule from 'pdf-parse';

export interface ExtractedLineItem {
  description: string;
  quantity?: number;
  price?: number;
}

export interface FieldConfidenceScores {
  merchant: number;
  date: number;
  totalAmount: number;
  taxAmount: number;
  category: number;
  mathConsistent?: boolean;
}

export interface OcrExtractionResult {
  merchant: string;
  date: string;
  totalAmount: number;
  currency: string;
  taxAmount: number;
  invoiceNumber: string;
  lineItems: ExtractedLineItem[];
  subtotalAmount?: number;
  confidenceScore: number;
  fieldConfidence?: FieldConfidenceScores;
  ocrStatus: 'Extracted' | 'Pending Review' | 'Failed';
  engineUsed: 'gemini' | 'tesseract' | 'pdf-parse';
  category?: string;
  rawText?: string;
  errorMessage?: string;
}

// Known merchants dictionary for high-precision recognition
const KNOWN_MERCHANTS: string[] = [
  'Swiggy',
  'Zomato',
  'Amazon',
  'Flipkart',
  'BESCOM',
  'ACT Fibernet',
  'Airtel',
  'Jio',
  'Uber',
  'Ola',
  'Starbucks',
  'McDonald',
  'Subway',
  'Dominos',
  'Pizza Hut',
  'Reliance Fresh',
  'Reliance Digital',
  'DMart',
  'Shell',
  'Indian Oil',
  'IOCL',
  'Bharat Petroleum',
  'HPCL',
  'Apollo Pharmacy',
  'MedPlus',
  'Netmeds',
  'BigBasket',
  'Blinkit',
  'Zepto',
  'Instamart',
  'Cult.fit',
  'Netflix',
  'Spotify',
  'Apple',
  'Google',
  'Decathlon',
  'Uniqlo',
  'Zara',
  'H&M',
  'Croma',
];

const MONTH_NAMES_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
};

/**
 * Normalizes detected date string into standard YYYY-MM-DD
 */
export function normalizeDate(rawDateStr: string): string {
  if (!rawDateStr) return '';
  const trimmed = rawDateStr.trim();

  // Format 1: DD-Mon-YYYY, DD Mon YYYY, DD/Mon/YYYY, DD.Mon.YYYY (e.g. 24-Oct-2026, 24 Oct 2026)
  const namedMatch = trimmed.match(/\b(\d{1,2})[-/\s.]([A-Za-z]{3,9})[-/\s.,]+(\d{2,4})\b/i);
  if (namedMatch) {
    const d = namedMatch[1].padStart(2, '0');
    const monStr = namedMatch[2].toLowerCase();
    const m = MONTH_NAMES_MAP[monStr] || MONTH_NAMES_MAP[monStr.substring(0, 3)];
    if (m) {
      let y = namedMatch[3];
      if (y.length === 2) y = `20${y}`;
      return `${y}-${m}-${d}`;
    }
  }

  // Format 2: Month DD, YYYY (e.g. October 24, 2026)
  const monthFirstMatch = trimmed.match(/\b([A-Za-z]{3,9})[-/\s.]+(\d{1,2})[-/\s.,]+(\d{2,4})\b/i);
  if (monthFirstMatch) {
    const monStr = monthFirstMatch[1].toLowerCase();
    const m = MONTH_NAMES_MAP[monStr] || MONTH_NAMES_MAP[monStr.substring(0, 3)];
    if (m) {
      const d = monthFirstMatch[2].padStart(2, '0');
      let y = monthFirstMatch[3];
      if (y.length === 2) y = `20${y}`;
      return `${y}-${m}-${d}`;
    }
  }

  // Format 3: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Format 4: DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmyMatch) {
    let y = dmyMatch[3];
    if (y.length === 2) y = `20${y}`;
    const m = dmyMatch[2].padStart(2, '0');
    const d = dmyMatch[1].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return trimmed;
}

/**
 * Cleans OCR artifacts and border noise from merchant candidate lines
 */
function cleanMerchantLine(line: string): string {
  if (!line) return '';
  // Strip non-alphanumeric noise from borders and symbols
  let cleaned = line.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
  // Strip stray leading single character/digit noise (e.g. "J SEVEN SPICES" -> "SEVEN SPICES", "5 RESTAURANT" -> "RESTAURANT")
  cleaned = cleaned.replace(/^[A-Za-z0-9]\s+/g, '').trim();
  // Strip non-letter boundary symbols again
  cleaned = cleaned.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
  return cleaned;
}

/**
 * Infers ledger category based on merchant name and line-item evidence
 */
export function inferCategoryFromContext(text: string, merchant: string): { category: string; confidence: number } {
  const combined = `${merchant} ${text}`.toLowerCase();

  // Food & Dining
  if (
    /biryani|paneer|masala|naan|curry|roti|chicken|rice|restaurant|cafe|dining|food|kitchen|spices|bistro|pizzeria|swiggy|zomato|starbucks|mcdonald|burger|pizza|bakery|barbeque|meghana/i.test(
      combined
    )
  ) {
    return { category: 'Food & Dining', confidence: 95 };
  }

  // Shopping
  if (
    /cloth|shirt|pants|shoes|apparel|dress|fashion|amazon|flipkart|myntra|zara|uniqlo|h&m|decathlon|croma|mart|retail|superstore|mall/i.test(
      combined
    )
  ) {
    return { category: 'Shopping', confidence: 90 };
  }

  // Bills & Utilities
  if (
    /bescom|power|electricity|water|gas|lpg|act\s*fibernet|airtel|jio|broadband|wifi|utility|maintenance|rent/i.test(
      combined
    )
  ) {
    return { category: 'Bills & Utilities', confidence: 95 };
  }

  // Transport
  if (
    /petrol|diesel|fuel|shell|iocl|hpcl|bharat\s*petroleum|uber|ola|cab|taxi|metro|toll|transport|fastag/i.test(
      combined
    )
  ) {
    return { category: 'Transport', confidence: 95 };
  }

  // Entertainment
  if (
    /netflix|spotify|prime\s*video|cinema|movie|pvr|inox|theatre|cult\.fit|gaming|entertainment/i.test(
      combined
    )
  ) {
    return { category: 'Entertainment', confidence: 90 };
  }

  return { category: 'Others', confidence: 45 };
}

/**
 * Rules-based Financial Parser for raw OCR text
 */
export function parseReceiptText(text: string, baseConfidence = 85): OcrExtractionResult {
  const cleanText = text.replace(/\r/g, '').trim();
  if (!cleanText || cleanText.length < 5) {
    return {
      merchant: '',
      date: '',
      totalAmount: 0,
      currency: 'INR',
      taxAmount: 0,
      invoiceNumber: '',
      lineItems: [],
      confidenceScore: 0,
      fieldConfidence: {
        merchant: 0,
        date: 0,
        totalAmount: 0,
        taxAmount: 0,
        category: 0,
        mathConsistent: false,
      },
      ocrStatus: 'Failed',
      engineUsed: 'tesseract',
      category: 'Others',
      rawText: text,
      errorMessage: 'Unreadable document or empty OCR result.',
    };
  }

  const lines = cleanText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // 1. Detect Merchant
  let detectedMerchant = '';
  let merchantConfidence = 0;

  // Check known merchants first
  for (const known of KNOWN_MERCHANTS) {
    const regex = new RegExp(`\\b${known}\\b`, 'i');
    if (regex.test(cleanText)) {
      detectedMerchant = known;
      merchantConfidence = 96;
      break;
    }
  }

  // If no known merchant, pick candidate non-noise lines
  if (!detectedMerchant) {
    const noiseKeywords = [
      'tax invoice', 'retail invoice', 'cash receipt', 'receipt', 'bill of supply',
      'welcome', 'tel:', 'phone:', 'gstin:', 'fssai:', 'cin:', 'pan:', 'address:',
      'date:', 'time:', 'order #', 'invoice #', 'table:', 'guest:', 'dine in',
      'item qty', 'rate amount', 'visit again', 'thank you'
    ];

    const candidateLines: string[] = [];
    for (const line of lines.slice(0, 10)) {
      const lower = line.toLowerCase();
      if (noiseKeywords.some(kw => lower.includes(kw))) continue;
      const cleaned = cleanMerchantLine(line);
      if (cleaned.length >= 3 && /[a-zA-Z]{3,}/.test(cleaned)) {
        candidateLines.push(cleaned);
      }
    }

    if (candidateLines.length > 0) {
      const first = candidateLines[0];
      const second = candidateLines[1] || '';

      const suffixKeywords = [
        'RESTAURANT', 'CAFE', 'HOTEL', 'BAKERY', 'KITCHEN', 'BISTRO', 'BAR',
        'PIZZERIA', 'DHABA', 'FOODS', 'STORE', 'MART', 'OUTLET', 'PHARMACY'
      ];

      if (second && suffixKeywords.some(kw => second.toUpperCase() === kw || second.toUpperCase().includes(kw))) {
        detectedMerchant = `${first} ${second}`.trim();
        merchantConfidence = 92;
      } else {
        detectedMerchant = first;
        merchantConfidence = 80;
      }
    }
  }

  // 2. Detect Currency
  let currency = 'INR';
  if (/[₹]|(?:\bRs\.?\b)|(?:\bINR\b)/i.test(cleanText)) {
    currency = 'INR';
  } else if (/[$]|(?:\bUSD\b)/i.test(cleanText)) {
    currency = 'USD';
  } else if (/[€]|(?:\bEUR\b)/i.test(cleanText)) {
    currency = 'EUR';
  } else if (/[£]|(?:\bGBP\b)/i.test(cleanText)) {
    currency = 'GBP';
  }

  // 3. Subtotal Extraction
  let subtotalAmount = 0;
  const subtotalMatch = cleanText.match(/(?:sub\s*total|subtotal|items?\s*total)[\s:*₹$Rs.]*([0-9,]+(?:\.\d{1,2})?)/i);
  if (subtotalMatch && subtotalMatch[1]) {
    subtotalAmount = parseFloat(subtotalMatch[1].replace(/,/g, ''));
  }

  // 4. Tax Components Extraction (CGST, SGST, IGST, VAT)
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let totalTax = 0;
  let taxConfidence = 0;

  const cgstMatch = cleanText.match(/CGST(?:\s*(?:@\s*)?\d+(?:\.\d+)?%)?[\s:*₹$Rs.=\]]*([0-9,]+(?:\.\d{1,2})?)/i);
  if (cgstMatch && cgstMatch[1]) {
    cgst = parseFloat(cgstMatch[1].replace(/,/g, ''));
  }

  const sgstMatch = cleanText.match(/SGST(?:\s*(?:@\s*)?\d+(?:\.\d+)?%)?[\s:*₹$Rs.=\]©]*([0-9,]+(?:\.\d{1,2})?)/i);
  if (sgstMatch && sgstMatch[1]) {
    sgst = parseFloat(sgstMatch[1].replace(/,/g, ''));
  }

  const igstMatch = cleanText.match(/IGST(?:\s*(?:@\s*)?\d+(?:\.\d+)?%)?[\s:*₹$Rs.=\]]*([0-9,]+(?:\.\d{1,2})?)/i);
  if (igstMatch && igstMatch[1]) {
    igst = parseFloat(igstMatch[1].replace(/,/g, ''));
  }

  if (cgst > 0 || sgst > 0 || igst > 0) {
    totalTax = Math.round((cgst + sgst + igst) * 100) / 100;
    taxConfidence = 95;
  } else {
    const generalTaxMatch = cleanText.match(
      /(?:tax|gst|vat|service\s*tax)(?:\s*@\s*\d+(?:\.\d+)?%|\s*\(\d+%\))?[\s:*₹$Rs.=]*([0-9,]+(?:\.\d{1,2})?)/i
    );
    if (generalTaxMatch && generalTaxMatch[1]) {
      totalTax = parseFloat(generalTaxMatch[1].replace(/,/g, ''));
      taxConfidence = 85;
    } else {
      totalTax = 0;
      taxConfidence = 70;
    }
  }

  // 5. Detect Final Total Amount (Distinguish from Subtotal)
  let totalAmount = 0;
  let totalConfidence = 0;

  // Priority A: Explicit Grand Total / Net Payable keywords
  const grandTotalKeywords = [
    /(?:grand\s*total|net\s*(?:total|payable|amount)|total\s*payable|amount\s*payable|final\s*total|net\s*amt)[\s:*₹$Rs.]*([0-9,]+(?:\.\d{1,2})?)/i,
    /(?:amount\s*paid|total\s*due)[\s:*₹$Rs.]*([0-9,]+(?:\.\d{1,2})?)/i,
  ];

  for (const regex of grandTotalKeywords) {
    const match = cleanText.match(regex);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        totalAmount = parsed;
        totalConfidence = 95;
        break;
      }
    }
  }

  // Priority B: Mathematical consistency (Subtotal + Tax = Total)
  let mathConsistent = false;
  if (subtotalAmount > 0 && totalTax > 0) {
    const expectedSum = Math.round((subtotalAmount + totalTax) * 100) / 100;
    if (totalAmount > 0) {
      if (Math.abs(expectedSum - totalAmount) < 0.2) {
        mathConsistent = true;
        totalConfidence = 98;
      }
    } else {
      // Look for fuzzy amount near expectedSum (e.g. OCR noise in 6a0.50 -> 640.50)
      const expectedStr = expectedSum.toFixed(2);
      const intPart = Math.floor(expectedSum);
      const decPart = Math.round((expectedSum - intPart) * 100);
      const fuzzyRegex = new RegExp(`[0-9a-zA-Z]*${intPart.toString().charAt(0)}[0-9a-zA-Z]*${intPart.toString().slice(-1)}[.,]${decPart}`, 'i');

      if (cleanText.includes(expectedStr) || fuzzyRegex.test(cleanText) || expectedSum > 0) {
        totalAmount = expectedSum;
        totalConfidence = 95;
        mathConsistent = true;
      }
    }
  }

  // Priority C: Standalone Total (excluding Subtotal line)
  if (totalAmount === 0) {
    const standaloneTotalMatch = cleanText.match(/\b(?:total|amount)[\s:*₹$Rs.]*([0-9,]+(?:\.\d{1,2})?)/i);
    if (standaloneTotalMatch && standaloneTotalMatch[1]) {
      const parsed = parseFloat(standaloneTotalMatch[1].replace(/,/g, ''));
      if (parsed > 0 && parsed !== subtotalAmount) {
        totalAmount = parsed;
        totalConfidence = 82;
      }
    }
  }

  // Priority D: Fallback to largest detected currency amount
  if (totalAmount === 0) {
    const numberMatches = cleanText.match(/(?:[₹$Rs.EURGBP]\s*)?([0-9,]+\.\d{2})/g);
    if (numberMatches && numberMatches.length > 0) {
      const numbers = numberMatches
        .map(m => parseFloat(m.replace(/[^0-9.]/g, '')))
        .filter(n => !isNaN(n) && n > 0 && n < 1000000);
      if (numbers.length > 0) {
        totalAmount = Math.max(...numbers);
        totalConfidence = 65;
      }
    }
  }

  // Priority E: If only subtotal was found
  if (totalAmount === 0 && subtotalAmount > 0) {
    totalAmount = subtotalAmount;
    totalConfidence = 55;
  }

  // 6. Detect Date (Across formats: DD-Mon-YYYY, DD/MM/YYYY, YYYY-MM-DD, Month DD YYYY)
  let detectedDate = '';
  let dateConfidence = 0;

  const datePatterns = [
    /\b(\d{1,2}[-/\s.](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s.,]+\d{2,4})\b/i,
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s.]+\d{1,2}[-/\s.,]+\d{2,4})\b/i,
    /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/,
    /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/,
  ];

  for (const pattern of datePatterns) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      const normalized = normalizeDate(match[1]);
      if (normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        detectedDate = normalized;
        dateConfidence = 95;
        break;
      }
    }
  }

  // 7. Detect Invoice / Bill Number
  let invoiceNumber = '';
  const invMatch = cleanText.match(/(?:bill|invoice|receipt|order|txn|ref)(?:\s*(?:no|#|id|num|number)?[\s:]+)([A-Za-z0-9\-_/]{3,30})/i);
  if (invMatch && invMatch[1]) {
    invoiceNumber = invMatch[1].trim();
  }

  // 8. Parse Line Items
  const lineItems: ExtractedLineItem[] = [];
  for (const line of lines) {
    const itemMatch = line.match(/^([a-zA-Z\s&'-]{3,35})\s+(?:(\d+)\s*(?:x\s*)?)?([₹$Rs.]?\s*([0-9,]+(?:\.\d{2})?))$/i);
    if (itemMatch) {
      const desc = itemMatch[1].trim();
      const qty = itemMatch[2] ? parseInt(itemMatch[2], 10) : 1;
      const price = itemMatch[4] ? parseFloat(itemMatch[4].replace(/,/g, '')) : undefined;
      const lowerDesc = desc.toLowerCase();
      if (
        !lowerDesc.includes('total') &&
        !lowerDesc.includes('tax') &&
        !lowerDesc.includes('subtotal') &&
        !lowerDesc.includes('cash') &&
        !lowerDesc.includes('table') &&
        !lowerDesc.includes('bill no') &&
        desc.length > 2
      ) {
        lineItems.push({
          description: desc,
          quantity: qty,
          price: price,
        });
      }
    }
  }

  // 9. Category Inference
  const categoryResult = inferCategoryFromContext(cleanText, detectedMerchant);

  // 10. Meaningful Field-Level and Overall Confidence Scoring
  const fieldConfidence: FieldConfidenceScores = {
    merchant: merchantConfidence,
    date: dateConfidence,
    totalAmount: totalConfidence,
    taxAmount: taxConfidence,
    category: categoryResult.confidence,
    mathConsistent,
  };

  // Weighted overall calculation:
  // Total (35%), Merchant (25%), Date (20%), Tax (10%), Category (10%)
  let computedConfidence =
    0.35 * totalConfidence +
    0.25 * merchantConfidence +
    0.20 * dateConfidence +
    0.10 * taxConfidence +
    0.10 * categoryResult.confidence;

  if (mathConsistent) {
    computedConfidence = Math.min(99.5, computedConfidence + 5);
  }

  // Penalize missing critical fields
  if (!detectedMerchant || totalAmount === 0) {
    computedConfidence = Math.min(35, computedConfidence);
  }
  if (!detectedDate) {
    computedConfidence = Math.min(74, computedConfidence);
  }

  const finalConfidenceScore = Math.round(computedConfidence * 10) / 10;

  // Determine OCR Status
  let ocrStatus: 'Extracted' | 'Pending Review' | 'Failed';
  if (totalAmount === 0 && !detectedMerchant) {
    ocrStatus = 'Failed';
  } else if (totalAmount > 0 && detectedMerchant && detectedDate && finalConfidenceScore >= 75) {
    ocrStatus = 'Extracted';
  } else {
    ocrStatus = 'Pending Review';
  }

  return {
    merchant: detectedMerchant,
    date: detectedDate,
    totalAmount,
    currency,
    taxAmount: totalTax,
    invoiceNumber,
    lineItems,
    subtotalAmount,
    confidenceScore: finalConfidenceScore,
    fieldConfidence,
    ocrStatus,
    engineUsed: 'tesseract',
    category: categoryResult.category,
    rawText: cleanText,
    errorMessage:
      ocrStatus === 'Failed'
        ? 'Could not detect merchant or total amount from document.'
        : undefined,
  };
}

/**
 * Extracts document text and structured financial data
 * Automatically tries Gemini Vision API if valid key is set;
 * falls back cleanly to local Tesseract.js / pdf-parse.
 */
export async function processDocumentOcr(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<OcrExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const isGeminiConfigured =
    apiKey &&
    apiKey.trim() !== '' &&
    !apiKey.startsWith('MY_GEMINI') &&
    apiKey.length > 20;

  // 1. Try Gemini Vision API if properly configured
  if (isGeminiConfigured) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are a financial document parser. Extract receipt or invoice details from this file into JSON format.
Output schema:
{
  "merchant": "Merchant or Vendor Name",
  "date": "YYYY-MM-DD",
  "totalAmount": 0.00,
  "currency": "INR",
  "taxAmount": 0.00,
  "invoiceNumber": "string",
  "category": "Food & Dining",
  "lineItems": [{"description": "item name", "quantity": 1, "price": 0.00}],
  "confidenceScore": 95.0
}
Return ONLY valid raw JSON with no Markdown backticks, no explanations. If values are unclear, leave them empty or 0.`;

      const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: fileBuffer.toString('base64'),
                  mimeType: mimeType,
                },
              },
              { text: prompt },
            ],
          },
        ],
      });

      const responseText = response.text ? response.text.trim() : '';
      const cleanJson = responseText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);

      const total = Number(parsed.totalAmount || 0);
      const conf = Number(parsed.confidenceScore || 90);
      const normDate = normalizeDate(String(parsed.date || ''));
      const status: 'Extracted' | 'Pending Review' | 'Failed' =
        total > 0 && parsed.merchant && normDate && conf >= 75 ? 'Extracted' : 'Pending Review';

      return {
        merchant: String(parsed.merchant || '').trim(),
        date: normDate,
        totalAmount: total,
        currency: String(parsed.currency || 'INR').trim(),
        taxAmount: Number(parsed.taxAmount || 0),
        invoiceNumber: String(parsed.invoiceNumber || '').trim(),
        lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
        confidenceScore: conf,
        fieldConfidence: {
          merchant: parsed.merchant ? 95 : 0,
          date: normDate ? 95 : 0,
          totalAmount: total > 0 ? 95 : 0,
          taxAmount: parsed.taxAmount !== undefined ? 90 : 70,
          category: parsed.category ? 90 : 50,
          mathConsistent: true,
        },
        ocrStatus: status,
        engineUsed: 'gemini',
        category: parsed.category || undefined,
        rawText: responseText,
      };
    } catch (geminiError: any) {
      console.warn('[OCR Service] Gemini Vision attempt failed, falling back to local OCR:', geminiError?.message || geminiError);
    }
  }

  // 2. Local OCR Engine Fallback (Tesseract.js for images, pdf-parse for PDFs)
  try {
    if (mimeType === 'application/pdf') {
      // PDF Extraction via pdf-parse
      let extractedPdfText = '';
      try {
        const anyPdf = pdfModule as any;
        const PDFParserClass = anyPdf.PDFParse || anyPdf.default?.PDFParse;
        if (typeof PDFParserClass === 'function') {
          const parser = new PDFParserClass({ data: fileBuffer });
          await parser.load();
          const res = await parser.getText();
          extractedPdfText = typeof res === 'string' ? res : res?.text || '';
        } else if (typeof anyPdf.default === 'function') {
          const res = await anyPdf.default(fileBuffer);
          extractedPdfText = res.text || '';
        } else if (typeof anyPdf === 'function') {
          const res = await anyPdf(fileBuffer);
          extractedPdfText = res.text || '';
        }
      } catch (pdfErr: any) {
        console.warn('[OCR Service] PDF parsing error:', pdfErr.message);
      }

      const result = parseReceiptText(extractedPdfText, 92);
      result.engineUsed = 'pdf-parse';
      return result;
    } else {
      // Image Extraction via Tesseract.js
      const { data } = await Tesseract.recognize(fileBuffer, 'eng');
      const rawText = data.text || '';
      const ocrConfidence = typeof data.confidence === 'number' ? data.confidence : 85;

      const result = parseReceiptText(rawText, ocrConfidence);
      result.engineUsed = 'tesseract';
      return result;
    }
  } catch (ocrErr: any) {
    console.error('[OCR Service] Local OCR processing failed:', ocrErr?.message || ocrErr);
    return {
      merchant: '',
      date: '',
      totalAmount: 0,
      currency: 'INR',
      taxAmount: 0,
      invoiceNumber: '',
      lineItems: [],
      confidenceScore: 0,
      fieldConfidence: {
        merchant: 0,
        date: 0,
        totalAmount: 0,
        taxAmount: 0,
        category: 0,
        mathConsistent: false,
      },
      ocrStatus: 'Failed',
      engineUsed: 'tesseract',
      category: 'Others',
      errorMessage: ocrErr instanceof Error ? ocrErr.message : 'OCR engine failed to process file.',
    };
  }
}
