export interface Transaction {
  id: string;
  name: string;
  category: 'Food & Dining' | 'Shopping' | 'Bills & Utilities' | 'Transport' | 'Entertainment' | 'Healthcare' | 'Others' | 'Income';
  amount: number;
  date: string;
  type: 'income' | 'expense';
  merchantIcon?: string;
  paymentMethod?: string;
  notes?: string;
  status: 'Completed' | 'Pending';
  receiptFingerprint?: string;
}

export interface Bill {
  id: string;
  name: string;
  category: string;
  amount: number;
  dueDate: string;
  dueInDays: number;
  status: 'unpaid' | 'paid' | 'scheduled';
  iconType: 'wifi' | 'electricity' | 'streaming' | 'water' | 'rent';
  transactionId?: string;
  reminderDays?: number;
  isRecurring?: boolean;
  recurringFrequency?: string;
}

export interface RecurringTransaction {
  id: string;
  name: string;
  description?: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  frequency: 'weekly' | 'monthly' | 'yearly';
  startDate: string;
  endDate?: string;
  nextDueDate: string;
  status: 'active' | 'paused';
  autoCreate: boolean;
  lastGeneratedDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BudgetCategory {
  id: string;
  category: string;
  allocated: number;
  color: string;
  month?: string;
  suggestedByAI?: number;
}

export interface FinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  category: string;
  monthlyContribution: number;
}

export interface AnomalyInsight {
  id: string;
  title: string;
  type: 'warning' | 'opportunity' | 'recurring';
  category: string;
  impactAmount: number;
  description: string;
  recommendation: string;
  dateDetected: string;
}

export interface DocumentItem {
  id: string;
  filename: string;
  uploadDate: string;
  fileSize: string;
  ocrStatus: 'Extracted' | 'Processing' | 'Pending Review' | 'Failed';
  detectedMerchant: string;
  detectedAmount: number;
  detectedDate: string;
  confidenceScore: number;
  storagePath?: string;
  mimeType?: string;
  currency?: string;
  taxAmount?: number;
  invoiceNumber?: string;
  lineItems?: Array<{ description: string; quantity?: number; price?: number }>;
  transactionId?: string;
  category?: string;
  receiptFingerprint?: string;
}

export interface AdminStats {
  totalRegisteredUsers: number;
  activeUsers: number;
  transactionsProcessed: number;
  avgInferenceTimeMs: number;
  forecastModelAccuracy: number;
  categorizationAccuracy: number;
  ocrPipelineHealth: 'Healthy' | 'Degraded' | 'Offline';
  fastApiStatus: 'Online' | 'Offline';
}

// Category palette definitions
export const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': '#00E5BE',    // Teal
  'Shopping': '#0EA5E9',         // Cyan / Sky
  'Bills & Utilities': '#6366F1', // Indigo
  'Transport': '#14B8A6',        // Mint
  'Entertainment': '#EC4899',    // Rose
  'Others': '#8B5CF6',           // Violet
  'Healthcare': '#F59E0B',       // Amber
  'Income': '#10B981',           // Emerald
};

const _sysDate = new Date();
const _sysYear = _sysDate.getFullYear();
const _sysMonth = _sysDate.getMonth();
const _SYS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _SYS_MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const formatMockDate = (day: number, monthOffset: number = 0): string => {
  const d = new Date(_sysYear, _sysMonth + monthOffset, day);
  return `${d.getDate()} ${_SYS_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

// Initial transactions whose expense subtotals sum up to exactly ₹27,860
// and income is ₹48,500, reproducing the exact reference dashboard numbers dynamically!
export const initialTransactions: Transaction[] = [
  // 1. Food & Dining (Subtotal: ₹7,522 -> 27%)
  {
    id: 'tx_1',
    name: 'Swiggy',
    category: 'Food & Dining',
    amount: 568,
    date: formatMockDate(20),
    type: 'expense',
    paymentMethod: 'UPI / HDFC',
    status: 'Completed',
    notes: 'Dinner order from Meghana Foods'
  },
  {
    id: 'tx_2',
    name: 'Amazon',
    category: 'Shopping',
    amount: 2499,
    date: formatMockDate(19),
    type: 'expense',
    paymentMethod: 'Credit Card',
    status: 'Completed',
    notes: 'Ergonomic mouse & desk mat'
  },
  {
    id: 'tx_3',
    name: 'Netflix',
    category: 'Entertainment',
    amount: 649,
    date: formatMockDate(18),
    type: 'expense',
    paymentMethod: 'Auto Debit',
    status: 'Completed',
    notes: 'Monthly 4K plan subscription'
  },
  {
    id: 'tx_4',
    name: 'Uber India',
    category: 'Transport',
    amount: 420,
    date: formatMockDate(16),
    type: 'expense',
    paymentMethod: 'UPI / GPay',
    status: 'Completed',
    notes: 'Airport commute'
  },
  {
    id: 'tx_5',
    name: 'BESCOM Power',
    category: 'Bills & Utilities',
    amount: 1680,
    date: formatMockDate(14),
    type: 'expense',
    paymentMethod: 'Net Banking',
    status: 'Completed',
    notes: 'Electricity bill consumption'
  },
  {
    id: 'tx_6',
    name: 'Zepto Grocery',
    category: 'Food & Dining',
    amount: 840,
    date: formatMockDate(10),
    type: 'expense',
    paymentMethod: 'UPI / PhonePe',
    status: 'Completed',
    notes: 'Weekly fresh fruits and essentials'
  },
  {
    id: 'tx_7',
    name: 'Barbeque Nation',
    category: 'Food & Dining',
    amount: 2850,
    date: formatMockDate(14),
    type: 'expense',
    paymentMethod: 'Credit Card',
    status: 'Completed',
    notes: 'Family dining buffet celebration'
  },
  {
    id: 'tx_8',
    name: 'Blue Tokai Coffee',
    category: 'Food & Dining',
    amount: 484,
    date: formatMockDate(18),
    type: 'expense',
    paymentMethod: 'UPI',
    status: 'Completed',
    notes: 'Work café meeting'
  },
  {
    id: 'tx_9',
    name: 'Zomato Office Lunch',
    category: 'Food & Dining',
    amount: 630,
    date: formatMockDate(16),
    type: 'expense',
    paymentMethod: 'UPI',
    status: 'Completed',
    notes: 'Team lunch wrap'
  },
  {
    id: 'tx_10',
    name: "Nature's Basket",
    category: 'Food & Dining',
    amount: 2150,
    date: formatMockDate(3),
    type: 'expense',
    paymentMethod: 'Debit Card',
    status: 'Completed',
    notes: 'Monthly staples & pantry'
  },

  // 2. Shopping (Subtotal: ₹5,850 -> 21%)
  {
    id: 'tx_11',
    name: 'Zara Menswear',
    category: 'Shopping',
    amount: 3200,
    date: formatMockDate(4),
    type: 'expense',
    paymentMethod: 'Credit Card',
    status: 'Completed',
    notes: 'Office casual shirts'
  },
  {
    id: 'tx_12',
    name: 'Uniqlo India',
    category: 'Shopping',
    amount: 151,
    date: formatMockDate(11),
    type: 'expense',
    paymentMethod: 'UPI',
    status: 'Completed',
    notes: 'Cotton socks pack'
  },

  // 3. Bills & Utilities (Subtotal: ₹5,015 -> 18%)
  {
    id: 'tx_13',
    name: 'ACT Fibernet',
    category: 'Bills & Utilities',
    amount: 1199,
    date: formatMockDate(12),
    type: 'expense',
    paymentMethod: 'UPI AutoPay',
    status: 'Completed',
    notes: 'Fiber 200Mbps broadband plan'
  },
  {
    id: 'tx_14',
    name: 'Airtel Postpaid',
    category: 'Bills & Utilities',
    amount: 899,
    date: formatMockDate(8),
    type: 'expense',
    paymentMethod: 'Credit Card',
    status: 'Completed',
    notes: 'Mobile family plan'
  },
  {
    id: 'tx_15',
    name: 'Indane Gas Cylinder',
    category: 'Bills & Utilities',
    amount: 1237,
    date: formatMockDate(2),
    type: 'expense',
    paymentMethod: 'UPI',
    status: 'Completed',
    notes: 'Domestic LPG refill'
  },

  // 4. Transport (Subtotal: ₹3,343 -> 12%)
  {
    id: 'tx_16',
    name: 'Namma Metro Card',
    category: 'Transport',
    amount: 800,
    date: formatMockDate(5),
    type: 'expense',
    paymentMethod: 'UPI',
    status: 'Completed',
    notes: 'Monthly metro pass recharge'
  },
  {
    id: 'tx_17',
    name: 'IOCL Fuel Station',
    category: 'Transport',
    amount: 1850,
    date: formatMockDate(9),
    type: 'expense',
    paymentMethod: 'Credit Card',
    status: 'Completed',
    notes: 'Vehicle petrol tank refill'
  },
  {
    id: 'tx_18',
    name: 'Quick Ride Carpool',
    category: 'Transport',
    amount: 273,
    date: formatMockDate(17),
    type: 'expense',
    paymentMethod: 'Wallet',
    status: 'Completed',
    notes: 'Shared commute trips'
  },

  // 5. Entertainment (Subtotal: ₹2,229 -> 8%)
  {
    id: 'tx_19',
    name: 'BookMyShow',
    category: 'Entertainment',
    amount: 980,
    date: formatMockDate(15),
    type: 'expense',
    paymentMethod: 'Credit Card',
    status: 'Completed',
    notes: 'Movie re-release'
  },
  {
    id: 'tx_20',
    name: 'Spotify India',
    category: 'Entertainment',
    amount: 119,
    date: formatMockDate(10),
    type: 'expense',
    paymentMethod: 'Debit Card',
    status: 'Completed',
    notes: 'Individual student subscription'
  },
  {
    id: 'tx_21',
    name: 'Steam Gaming',
    category: 'Entertainment',
    amount: 481,
    date: formatMockDate(7),
    type: 'expense',
    paymentMethod: 'Credit Card',
    status: 'Completed',
    notes: 'Indie game bundle purchase'
  },

  // 6. Others & Healthcare (Subtotal: ₹3,901 -> 14%)
  {
    id: 'tx_22',
    name: 'Apollo Pharmacy',
    category: 'Others',
    amount: 620,
    date: formatMockDate(7),
    type: 'expense',
    paymentMethod: 'Debit Card',
    status: 'Completed',
    notes: 'Routine vitamins & health supplies'
  },
  {
    id: 'tx_23',
    name: 'Fabric Spa Laundry',
    category: 'Others',
    amount: 780,
    date: formatMockDate(13),
    type: 'expense',
    paymentMethod: 'UPI',
    status: 'Completed',
    notes: 'Winter jacket dry cleaning'
  },
  {
    id: 'tx_24',
    name: 'Pet Care & Clinic',
    category: 'Others',
    amount: 1501,
    date: formatMockDate(6),
    type: 'expense',
    paymentMethod: 'UPI',
    status: 'Completed',
    notes: 'Vaccination & royal canin food'
  },
  {
    id: 'tx_25',
    name: 'Blossom Book House',
    category: 'Others',
    amount: 1000,
    date: formatMockDate(15),
    type: 'expense',
    paymentMethod: 'UPI',
    status: 'Completed',
    notes: 'System architecture books'
  },

  // Income entries (Subtotal: ₹48,500)
  {
    id: 'tx_income_1',
    name: 'Salary Credit',
    category: 'Income',
    amount: 48500,
    date: formatMockDate(1),
    type: 'income',
    paymentMethod: 'Direct Deposit',
    status: 'Completed',
    notes: 'Monthly engineering salary credit'
  }
];

// Initial Bills
export const initialBills: Bill[] = [
  {
    id: 'bill_1',
    name: 'Internet Bill',
    category: 'Bills & Utilities',
    amount: 1199,
    dueDate: formatMockDate(22),
    dueInDays: 2,
    status: 'unpaid',
    iconType: 'wifi'
  },
  {
    id: 'bill_2',
    name: 'Electricity Bill',
    category: 'Bills & Utilities',
    amount: 1680,
    dueDate: formatMockDate(25),
    dueInDays: 5,
    status: 'unpaid',
    iconType: 'electricity'
  },
  {
    id: 'bill_3',
    name: 'Netflix',
    category: 'Entertainment',
    amount: 649,
    dueDate: formatMockDate(28),
    dueInDays: 8,
    status: 'scheduled',
    iconType: 'streaming'
  },
  {
    id: 'bill_4',
    name: 'Apartment Maintenance',
    category: 'Bills & Utilities',
    amount: 2500,
    dueDate: formatMockDate(31),
    dueInDays: 11,
    status: 'unpaid',
    iconType: 'rent'
  }
];

// Initial Budgets (allocated envelopes)
export const initialBudgets: BudgetCategory[] = [
  { id: 'b_1', category: 'Food & Dining', allocated: 8000, color: '#00E5BE', suggestedByAI: 7200 },
  { id: 'b_2', category: 'Shopping', allocated: 5000, color: '#0EA5E9', suggestedByAI: 4800 },
  { id: 'b_3', category: 'Bills & Utilities', allocated: 5500, color: '#6366F1', suggestedByAI: 5200 },
  { id: 'b_4', category: 'Transport', allocated: 4000, color: '#14B8A6', suggestedByAI: 3500 },
  { id: 'b_5', category: 'Entertainment', allocated: 3000, color: '#EC4899', suggestedByAI: 2500 },
  { id: 'b_6', category: 'Others', allocated: 4500, color: '#8B5CF6', suggestedByAI: 4000 },
];

// Initial Goals
export const initialGoals: FinancialGoal[] = [
  {
    id: 'g_1',
    title: 'Emergency Fund',
    targetAmount: 150000,
    currentAmount: 95000,
    targetDate: formatMockDate(31, 2),
    category: 'Safety',
    monthlyContribution: 12000
  },
  {
    id: 'g_2',
    title: 'MacBook Pro M4',
    targetAmount: 180000,
    currentAmount: 110000,
    targetDate: formatMockDate(15, 1),
    category: 'Electronics',
    monthlyContribution: 15000
  },
  {
    id: 'g_3',
    title: 'Goa Winter Retreat',
    targetAmount: 35000,
    currentAmount: 24500,
    targetDate: formatMockDate(20, 2),
    category: 'Travel',
    monthlyContribution: 5000
  },
  {
    id: 'g_4',
    title: 'Long-term Mutual Funds',
    targetAmount: 500000,
    currentAmount: 215000,
    targetDate: formatMockDate(31, 16),
    category: 'Investments',
    monthlyContribution: 8000
  }
];

// Initial Insights
export const initialInsights: AnomalyInsight[] = [
  {
    id: 'ins_1',
    title: 'Shopping Surge Beyond Historical Baseline',
    type: 'warning',
    category: 'Shopping',
    impactAmount: 1850,
    description: 'Your spending on Shopping reached ₹5,850 this month, which is 18% higher than your 3-month moving average of ₹4,950.',
    recommendation: 'Pause discretionary e-commerce checkouts for the remaining days of this month to avoid exceeding your budget ceiling.',
    dateDetected: formatMockDate(20)
  },
  {
    id: 'ins_2',
    title: 'Unused Recurring Subscription Detected',
    type: 'recurring',
    category: 'Entertainment',
    impactAmount: 499,
    description: 'We detected an automatic monthly debit for a secondary fitness streaming pass that had 0 recorded sessions in the past 45 days.',
    recommendation: 'Cancel or pause this auto-renew subscription to immediately reclaim ₹5,988 in annual recurring liquidity.',
    dateDetected: formatMockDate(18)
  },
  {
    id: 'ins_3',
    title: 'Dining Optimization Opportunity',
    type: 'opportunity',
    category: 'Food & Dining',
    impactAmount: 2200,
    description: 'Food delivery orders peaked on Thursday and Friday late nights, contributing 42% of total food expenses.',
    recommendation: 'Meal prepping 2 dinners per week could reduce monthly food costs by approximately ₹2,200 without lifestyle compromise.',
    dateDetected: formatMockDate(15)
  }
];

// Initial Documents / Mock OCR
export const initialDocuments: DocumentItem[] = [
  {
    id: 'doc_1',
    filename: 'Swiggy_Invoice.pdf',
    uploadDate: `${formatMockDate(20)}, 21:14`,
    fileSize: '412 KB',
    ocrStatus: 'Extracted',
    detectedMerchant: 'Swiggy (Meghana Foods)',
    detectedAmount: 568,
    detectedDate: formatMockDate(20),
    confidenceScore: 98.6
  },
  {
    id: 'doc_2',
    filename: 'Amazon_Receipt_INV4892.pdf',
    uploadDate: `${formatMockDate(19)}, 14:30`,
    fileSize: '780 KB',
    ocrStatus: 'Extracted',
    detectedMerchant: 'Amazon India Retail',
    detectedAmount: 2499,
    detectedDate: formatMockDate(19),
    confidenceScore: 99.1
  },
  {
    id: 'doc_3',
    filename: 'Bescom_Electricity_Bill.png',
    uploadDate: `${formatMockDate(14)}, 10:05`,
    fileSize: '1.2 MB',
    ocrStatus: 'Extracted',
    detectedMerchant: 'BESCOM Bangalore',
    detectedAmount: 1680,
    detectedDate: formatMockDate(14),
    confidenceScore: 95.4
  },
  {
    id: 'doc_4',
    filename: 'Fuel_IOCL_Bill.jpeg',
    uploadDate: `${formatMockDate(12)}, 18:22`,
    fileSize: '640 KB',
    ocrStatus: 'Pending Review',
    detectedMerchant: 'Indian Oil Retail Outlet',
    detectedAmount: 1850,
    detectedDate: formatMockDate(12),
    confidenceScore: 88.2
  }
];

// Dynamic Multi-month Analytics baseline derived relative to current system month
export const analyticsMonthlyTrends = Array.from({ length: 6 }, (_, idx) => {
  const offset = 5 - idx;
  const d = new Date(_sysYear, _sysMonth - offset, 1);
  const m = _SYS_MONTHS[d.getMonth()];
  const baseIncomes = [45000, 46000, 45500, 47000, 47500, 48500];
  const baseExpenses = [25400, 26100, 28900, 25200, 24800, 27860];
  const inc = baseIncomes[idx];
  const exp = baseExpenses[idx];
  return {
    month: m,
    income: inc,
    expenses: exp,
    savings: inc - exp,
  };
});

// Admin metrics
export const mockAdminStats: AdminStats = {
  totalRegisteredUsers: 1420,
  activeUsers: 892,
  transactionsProcessed: 54310,
  avgInferenceTimeMs: 42,
  forecastModelAccuracy: 94.8,
  categorizationAccuracy: 98.4,
  ocrPipelineHealth: 'Healthy',
  fastApiStatus: 'Online'
};

export const mockRecentRegistrations = [
  { id: 'usr_901', name: 'Aarav Sharma', email: 'aarav.s@gmail.com', joined: '10 mins ago', status: 'Active' },
  { id: 'usr_902', name: 'Priya Venkatesh', email: 'priya.v@outlook.com', joined: '42 mins ago', status: 'Active' },
  { id: 'usr_903', name: 'Rohan Mehta', email: 'rohan.m@techcorp.in', joined: '2 hours ago', status: 'Active' },
  { id: 'usr_904', name: 'Ananya Iyer', email: 'ananya.iyer@gmail.com', joined: '5 hours ago', status: 'Active' },
  { id: 'usr_905', name: 'Kabir Verma', email: 'kabir.v@finnet.io', joined: '1 day ago', status: 'Active' }
];

export const sampleAIQnA = [
  {
    question: "Why did my dining expense spike this month?",
    answer: `Based on your current month's ledger, your Food & Dining expenditure stands at ₹7,522 (27% of all expenses). The primary drivers were delivery & dining out orders placed on weekend late evenings, along with family dining at Barbeque Nation (₹2,850). Compared to prior dining spend, this represents an elevated variance.`
  },
  {
    question: "Can I afford an unplanned ₹15,000 gadget this month?",
    answer: "Your current net savings stand at ₹20,640 with a 42.5% savings rate. While you have sufficient cash surplus to absorb the ₹15,000 cost, doing so would diminish your monthly net savings to ₹5,640 (reducing your savings rate to 11.6%) and delay your target for the 'MacBook Pro M4' goal. We advise spreading the purchase into next month's surplus or utilizing your gadget sinking fund."
  },
  {
    question: "How can I increase my monthly savings by ₹5,000?",
    answer: "FinSight AI model recommendations for your specific profile:\n1. Cap food delivery checkouts to 3 orders/week (projected savings: ~₹2,200/mo).\n2. Audit your discretionary shopping: delaying non-essential Amazon purchases saves ~₹1,800.\n3. Terminate unused secondary streaming subscriptions (saves ₹499/mo).\nTotal projected savings: ₹4,499 to ₹5,200/month."
  },
  {
    question: "What is my expense forecast for next month?",
    answer: "Our predictive forecasting model projects total expenses of ₹29,450 (+5.7% relative to the current run-rate). This model accounts for regular fixed obligations (₹9,800 in utilities/rent/bills), baseline living costs (₹12,400), and an anticipated seasonal variation in discretionary outlays."
  }
];
