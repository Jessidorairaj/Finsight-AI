import fs from 'fs';
import Tesseract from 'tesseract.js';
import {
  parseReceiptText,
  normalizeDate,
  inferCategoryFromContext,
  processDocumentOcr,
} from './services/ocrService.js';

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('  FinSight AI — OCR Accuracy & Field Confidence Regression Suite');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (!condition) {
      console.error(`  ❌ FAILED: ${message}`);
      throw new Error(message);
    }
    passedTests++;
    console.log(`  ✓ PASSED: ${message}`);
  }

  // ----------------------------------------------------
  // TEST 1: Seven Spices Restaurant Receipt Text Parsing
  // ----------------------------------------------------
  console.log('1. Testing Seven Spices Restaurant parsing & noise cleaning');
  const sevenSpicesRawOcr = `: J SEVEN SPICES
5 RESTAURANT
Tadepalligudenm, WiG, Dist
= ; Ph: 08818-222777
S & \\ Dine In R
3 Bill No: 51763 Table: T2
= 3 + Date: 24-Oct-2026 Time: 08:36 PM = >
= Item qty Rate Amount
TE § Chicken Biryani 1 26000 260°
SH = 4 paneer Butter Masala 1 230.00 230.00 = >
Sees SS Tea Naan 2 40.00 80.00 =
i os = Sprite (500m!) i, 40.00 40.00 >
8 s 2 Sub Total * 610.00 3 ~ E
2 SHER = ] CGST @ 2.5% * 15.25 ~
SA : SGST @ 2.5% © 15.25
5 Sm Mpg. (i6a0.50 SS
i y SUT a Thank You..-!
ee = — visit Again..-! : i
- Sry AN x = =`;

  const sevenSpicesResult = parseReceiptText(sevenSpicesRawOcr);
  console.log('  Parsed result:', {
    merchant: sevenSpicesResult.merchant,
    date: sevenSpicesResult.date,
    subtotal: sevenSpicesResult.subtotalAmount,
    tax: sevenSpicesResult.taxAmount,
    total: sevenSpicesResult.totalAmount,
    category: sevenSpicesResult.category,
    confidence: sevenSpicesResult.confidenceScore,
    mathConsistent: sevenSpicesResult.fieldConfidence?.mathConsistent,
  });

  assert(
    sevenSpicesResult.merchant === 'SEVEN SPICES RESTAURANT',
    `Expected merchant 'SEVEN SPICES RESTAURANT', got '${sevenSpicesResult.merchant}'`
  );
  assert(
    sevenSpicesResult.date === '2026-10-24',
    `Expected date '2026-10-24', got '${sevenSpicesResult.date}'`
  );
  assert(
    sevenSpicesResult.subtotalAmount === 610.00,
    `Expected subtotal 610.00, got ${sevenSpicesResult.subtotalAmount}`
  );
  assert(
    sevenSpicesResult.taxAmount === 30.50,
    `Expected tax amount 30.50 (CGST 15.25 + SGST 15.25), got ${sevenSpicesResult.taxAmount}`
  );
  assert(
    sevenSpicesResult.totalAmount === 640.50,
    `Expected total amount 640.50, got ${sevenSpicesResult.totalAmount}`
  );
  assert(
    sevenSpicesResult.category === 'Food & Dining',
    `Expected category 'Food & Dining', got '${sevenSpicesResult.category}'`
  );
  assert(
    Boolean(sevenSpicesResult.fieldConfidence?.mathConsistent),
    'Expected mathematical consistency between subtotal + tax and total'
  );
  assert(
    sevenSpicesResult.confidenceScore >= 90,
    `Expected high confidence >= 90%, got ${sevenSpicesResult.confidenceScore}%`
  );

  // ----------------------------------------------------
  // TEST 2: Subtotal vs Final Total Disambiguation
  // ----------------------------------------------------
  console.log('\n2. Testing Subtotal vs Total distinction (prefer explicit final total)');
  const subtotalVsTotalText = `RETAIL STORE
Date: 15-Nov-2026
Item A: 200.00
Item B: 300.00
SUB TOTAL: 500.00
VAT @ 10%: 50.00
NET PAYABLE: 550.00
Thank you for shopping!`;

  const subVsTotalResult = parseReceiptText(subtotalVsTotalText);
  assert(
    subVsTotalResult.subtotalAmount === 500.00,
    `Expected subtotal 500, got ${subVsTotalResult.subtotalAmount}`
  );
  assert(
    subVsTotalResult.totalAmount === 550.00,
    `Expected final total 550.00 (not 500.00), got ${subVsTotalResult.totalAmount}`
  );
  assert(
    subVsTotalResult.taxAmount === 50.00,
    `Expected tax 50.00, got ${subVsTotalResult.taxAmount}`
  );

  // ----------------------------------------------------
  // TEST 3: Robust Date Parsing Across Formats & No Silent Fallbacks
  // ----------------------------------------------------
  console.log('\n3. Testing date parsing across formats and no silent fallback');
  assert(normalizeDate('24-Oct-2026') === '2026-10-24', 'Normalized 24-Oct-2026');
  assert(normalizeDate('24 Oct 2026') === '2026-10-24', 'Normalized 24 Oct 2026');
  assert(normalizeDate('October 24, 2026') === '2026-10-24', 'Normalized October 24, 2026');
  assert(normalizeDate('15/08/2025') === '2025-08-15', 'Normalized 15/08/2025');
  assert(normalizeDate('2026-09-30') === '2026-09-30', 'Normalized 2026-09-30');

  // When date is unreadable, it MUST NOT silently substitute today's date
  const missingDateText = `SOME STORE
Grand Total: 450.00
Thank you!`;
  const missingDateResult = parseReceiptText(missingDateText);
  assert(
    missingDateResult.date === '',
    `Expected empty date for unreadable date, got '${missingDateResult.date}'`
  );
  assert(
    missingDateResult.fieldConfidence?.date === 0,
    `Expected 0 date confidence, got ${missingDateResult.fieldConfidence?.date}`
  );
  assert(
    missingDateResult.ocrStatus === 'Pending Review',
    `Expected 'Pending Review' due to missing date, got '${missingDateResult.ocrStatus}'`
  );

  // ----------------------------------------------------
  // TEST 4: Noisy Merchant Name Cleaning
  // ----------------------------------------------------
  console.log('\n4. Testing noisy merchant name cleaning');
  const noisyMerchantText = `* * * STARBUCKS COFFEE * * *
Order #1029
Date: 2026-10-18
Grande Latte: 280.00
Total: 280.00`;
  const noisyResult = parseReceiptText(noisyMerchantText);
  assert(
    noisyResult.merchant.toLowerCase().includes('starbucks'),
    `Expected Starbucks merchant, got '${noisyResult.merchant}'`
  );

  const leadingArtifactText = `: 3 SHELL PETROL PUMP
Date: 2026-10-12
Fuel Amount: 1850.00
Total Amount: 1850.00`;
  const leadingResult = parseReceiptText(leadingArtifactText);
  assert(
    leadingResult.merchant.toLowerCase().includes('shell'),
    `Expected Shell merchant, got '${leadingResult.merchant}'`
  );

  // ----------------------------------------------------
  // TEST 5: Tax Calculation Without Double-Counting
  // ----------------------------------------------------
  console.log('\n5. Testing tax components and non-double-counted amounts');
  const taxCheckText = `CAFE MOCHA
Date: 2026-10-20
Items Total: 400.00
CGST 2.5%: 10.00
SGST 2.5%: 10.00
GRAND TOTAL: 420.00`;
  const taxCheckResult = parseReceiptText(taxCheckText);
  assert(
    taxCheckResult.totalAmount === 420.00,
    `Expected total 420.00, got ${taxCheckResult.totalAmount}`
  );
  assert(
    taxCheckResult.taxAmount === 20.00,
    `Expected tax amount 20.00, got ${taxCheckResult.taxAmount}`
  );
  // Transaction amount should be 420.00, NOT 420.00 + 20.00 = 440.00!
  assert(
    taxCheckResult.totalAmount === 420.00,
    'Grand Total already includes tax and must not be added twice'
  );

  // ----------------------------------------------------
  // TEST 6: Real Seven Spices Image Verification
  // ----------------------------------------------------
  console.log('\n6. Testing OCR on actual Seven Spices receipt image file');
  const imagePath = 'uploads/documents/usr_1793218238197_wlal7w/doc_1793533152083_oyezf_Crinkled_Seven_Spices_Restaurant_Receipt.png';
  if (fs.existsSync(imagePath)) {
    const buffer = fs.readFileSync(imagePath);
    const imageResult = await processDocumentOcr(buffer, 'image/png', 'Crinkled_Seven_Spices_Restaurant_Receipt.png');
    console.log('  Real Image OCR result:', {
      merchant: imageResult.merchant,
      date: imageResult.date,
      total: imageResult.totalAmount,
      tax: imageResult.taxAmount,
      category: imageResult.category,
      confidence: imageResult.confidenceScore,
      status: imageResult.ocrStatus,
    });

    assert(
      imageResult.merchant === 'SEVEN SPICES RESTAURANT',
      `Real image merchant should be 'SEVEN SPICES RESTAURANT', got '${imageResult.merchant}'`
    );
    assert(
      imageResult.date === '2026-10-24',
      `Real image date should be '2026-10-24', got '${imageResult.date}'`
    );
    assert(
      imageResult.totalAmount === 640.50,
      `Real image total should be 640.50, got ${imageResult.totalAmount}`
    );
    assert(
      imageResult.taxAmount === 30.50,
      `Real image tax should be 30.50, got ${imageResult.taxAmount}`
    );
    assert(
      imageResult.category === 'Food & Dining',
      `Real image category should be 'Food & Dining', got '${imageResult.category}'`
    );
  } else {
    console.warn('  (Image file not found at path, skipping image test)');
  }

  console.log('\n================================================================');
  console.log(`  ALL ${passedTests}/${totalTests} REGRESSION TESTS PASSED SUCCESSFULLY! ✓`);
  console.log('================================================================');
}

runRegressionSuite().catch(err => {
  console.error('\n❌ OCR Regression Suite Failed:', err);
  process.exit(1);
});

