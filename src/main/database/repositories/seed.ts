/**
 * Demo seed — populates the database with realistic test data covering every
 * module so you can try the app end-to-end:
 *
 *   Users (admin + cashiers), brands, categories, products,
 *   customers (+ credit records), suppliers, purchases (+ stock + ledger),
 *   sales (cash/card/ledger) with auto journal entries, expenses, returns,
 *   bank accounts + transactions, employees + salary payments, installments,
 *   proformas, service tickets, cross-sell rules, and fiscal periods.
 *
 * Sales/expenses/returns/purchases go through the REAL repository functions,
 * so stock, customer/supplier balances, journals, and reports stay consistent.
 *
 * Idempotent: refuses to run if products already exist.
 */
import { getDatabase, hashPin } from '../connection'
import * as salesRepo from './sales'
import * as expensesRepo from './expenses'
import * as returnsRepo from './returns'
import * as purchasesRepo from './purchases'
import * as productsRepo from './products'
import { createPeriod } from './periods'
import { createCategory } from './categories'

// ── Reference data ──────────────────────────────────────────────────────────
const PRODUCTS: { title: string; category: string; unit: string; purchase_price: number; sale_price: number; stock: number; minStock: number; isLoose?: boolean }[] = [
  { title: 'شیر کاله ۱ لیتری', category: 'لبنیات', unit: 'number', purchase_price: 28000, sale_price: 32000, stock: 150, minStock: 20 },
  { title: 'ماست چکیده دامک', category: 'لبنیات', unit: 'number', purchase_price: 35000, sale_price: 42000, stock: 80, minStock: 15 },
  { title: 'پنیر سفید ۴۰۰ گرمی', category: 'لبنیات', unit: 'number', purchase_price: 45000, sale_price: 55000, stock: 60, minStock: 10 },
  { title: 'کره صادقی', category: 'لبنیات', unit: 'number', purchase_price: 52000, sale_price: 62000, stock: 40, minStock: 8 },
  { title: 'برنج ایرانی ۱۰ کیلویی', category: 'خشکبار', unit: 'number', purchase_price: 280000, sale_price: 340000, stock: 25, minStock: 5 },
  { title: 'روغن لادن ۱.۵ لیتری', category: 'خشکبار', unit: 'number', purchase_price: 95000, sale_price: 115000, stock: 50, minStock: 10 },
  { title: 'شکر سفید ۲ کیلویی', category: 'خشکبار', unit: 'number', purchase_price: 42000, sale_price: 52000, stock: 70, minStock: 15 },
  { title: 'چای احمد ۵۰۰ گرمی', category: 'خشکبار', unit: 'number', purchase_price: 120000, sale_price: 145000, stock: 35, minStock: 8 },
  { title: 'رب گوجه ۴۰۰ گرمی', category: 'کنسروجات', unit: 'number', purchase_price: 38000, sale_price: 48000, stock: 90, minStock: 20 },
  { title: 'تن ماهی ۱۸۰ گرمی', category: 'کنسروجات', unit: 'number', purchase_price: 55000, sale_price: 68000, stock: 45, minStock: 10 },
  { title: 'ماکارونی زر', category: 'کنسروجات', unit: 'number', purchase_price: 22000, sale_price: 28000, stock: 100, minStock: 20 },
  { title: 'سس کچاپ', category: 'کنسروجات', unit: 'number', purchase_price: 32000, sale_price: 40000, stock: 55, minStock: 12 },
  { title: 'آب معدنی ۱.۵ لیتری', category: 'نوشیدنی', unit: 'number', purchase_price: 8000, sale_price: 12000, stock: 200, minStock: 50 },
  { title: 'دلستر موزی ۳۳۰ میلی‌لیتری', category: 'نوشیدنی', unit: 'number', purchase_price: 15000, sale_price: 20000, stock: 80, minStock: 20 },
  { title: 'نوشابه زمزم', category: 'نوشیدنی', unit: 'number', purchase_price: 12000, sale_price: 16000, stock: 120, minStock: 30 },
  { title: 'دستمال کاغذی ۶ تایی', category: 'بهداشتی', unit: 'number', purchase_price: 45000, sale_price: 58000, stock: 60, minStock: 15 },
  { title: 'مایع ظرفشویی', category: 'بهداشتی', unit: 'number', purchase_price: 35000, sale_price: 45000, stock: 40, minStock: 10 },
  { title: 'شامپو ۴۰۰ میلی‌لیتری', category: 'بهداشتی', unit: 'number', purchase_price: 65000, sale_price: 82000, stock: 30, minStock: 8 },
  { title: 'بیسکویت پتی‌بور', category: 'تنقلات', unit: 'number', purchase_price: 18000, sale_price: 24000, stock: 100, minStock: 25 },
  { title: 'شکلات رندر', category: 'تنقلات', unit: 'number', purchase_price: 28000, sale_price: 35000, stock: 70, minStock: 15 },
  { title: 'پفک نمکی', category: 'تنقلات', unit: 'number', purchase_price: 16000, sale_price: 21000, stock: 90, minStock: 20 },
  { title: 'تخم‌مرغ شانه‌ای', category: 'پروتئین', unit: 'number', purchase_price: 60000, sale_price: 75000, stock: 40, minStock: 8 },
  { title: 'مرغ منجمد', category: 'پروتئین', unit: 'number', purchase_price: 92000, sale_price: 115000, stock: 25, minStock: 5 },
  { title: 'سیب قرمز', category: 'میوه', unit: 'weight', purchase_price: 30000, sale_price: 45000, stock: 60, minStock: 10, isLoose: true },
  { title: 'موز', category: 'میوه', unit: 'weight', purchase_price: 55000, sale_price: 68000, stock: 40, minStock: 8, isLoose: true },
  { title: 'گوجه فرنگی', category: 'سبزیجات', unit: 'weight', purchase_price: 18000, sale_price: 28000, stock: 50, minStock: 10, isLoose: true },
  { title: 'خیار', category: 'سبزیجات', unit: 'weight', purchase_price: 15000, sale_price: 22000, stock: 45, minStock: 8, isLoose: true },
  { title: 'نان سنگک', category: 'نان', unit: 'number', purchase_price: 8000, sale_price: 12000, stock: 60, minStock: 10 },
]

const EXPENSE_CATEGORIES = [
  { category: 'اجاره', min: 5000000, max: 5000000 },
  { category: 'قبوض', min: 500000, max: 1500000 },
  { category: 'حقوق', min: 8000000, max: 12000000 },
  { category: 'لوازم', min: 200000, max: 800000 },
  { category: 'تعمیرات', min: 100000, max: 500000 },
  { category: 'حمل‌ونقل', min: 50000, max: 300000 },
  { category: 'سایر', min: 30000, max: 200000 },
]

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomDateTime(daysBack: number): string {
  const d = new Date(Date.now() - Math.floor(Math.random() * daysBack) * 86400000)
  d.setHours(randInt(8, 20), randInt(0, 59), randInt(0, 59))
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

function randomDate(daysBack: number): string {
  return randomDateTime(daysBack).slice(0, 10)
}

export function seedDemoData(): boolean {
  const db = getDatabase()

  const existingProducts = db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number }
  if (existingProducts.c > 0) return false

  try {
    // ── Users ────────────────────────────────────────────────
  let adminId = 1
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  if (userCount === 0) {
    adminId = db.prepare('INSERT INTO users (name, pin_code, role) VALUES (?, ?, ?)').run('مدیر سیستم', hashPin('1234'), 'admin').lastInsertRowid as number
    db.prepare('INSERT INTO users (name, pin_code, role) VALUES (?, ?, ?)').run('فروشنده ۱', hashPin('1111'), 'cashier')
    db.prepare('INSERT INTO users (name, pin_code, role) VALUES (?, ?, ?)').run('فروشنده ۲', hashPin('2222'), 'cashier')
  } else {
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get() as { id: number } | undefined
    adminId = admin?.id ?? 1
  }
  const userIds = (db.prepare('SELECT id FROM users').all() as { id: number }[]).map(u => u.id)

  // ── Categories & brands ─────────────────────────────────
  const categoryIds: Record<string, number> = {}
  for (const cat of ['لبنیات', 'خشکبار', 'کنسروجات', 'نوشیدنی', 'بهداشتی', 'تنقلات', 'پروتئین', 'میوه', 'سبزیجات', 'نان']) {
    categoryIds[cat] = createCategory(cat).id
  }
  const brandNames = ['کاله', 'دامک', 'لادن', 'احمد', 'زر', 'زمزم', 'پتی‌بور', 'رندر']
  for (const b of brandNames) {
    db.prepare('INSERT INTO brands (name) VALUES (?)').run(b)
  }

  // ── Products ─────────────────────────────────────────────
  const productRows: { id: number; title: string; purchase_price: number; sale_price: number; category: string }[] = []
  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i]
    const product = productsRepo.createProduct({
      barcode: `PRD-${String(i + 1).padStart(6, '0')}`,
      title: p.title,
      category: p.category,
      unit: p.unit as 'number' | 'weight',
      purchase_price: p.purchase_price,
      sale_price: p.sale_price,
      stock: p.stock,
      minStock: p.minStock,
      isLoose: p.isLoose ?? false,
      isSellable: true,
    })
    productRows.push({ id: product.id, title: product.title, purchase_price: p.purchase_price, sale_price: p.sale_price, category: p.category })
  }

  // ── Customers (+ credit) ────────────────────────────────
  const insertCustomer = db.prepare('INSERT INTO customers (name, phone, address, notes, customerType, description) VALUES (?, ?, ?, ?, ?, ?)')
  const customerData = [
    { name: 'علی محمدی', phone: '09121234567', address: 'تهران، خیابان ولیعصر، پلاک ۳۴', notes: 'مشتری دائمی', customerType: 'real', description: 'خریدار عمده لبنیات' },
    { name: 'سارا احمدی', phone: '09351234567', address: 'تهران، خیابان آزادی', notes: '', customerType: 'real', description: '' },
    { name: 'شرکت بازرگانی کریمی', phone: '09191234567', address: 'تهران، خیابان انقلاب', notes: 'مشتری عمده', customerType: 'legal', description: 'واردکننده مواد غذایی' },
    { name: 'نیلوفر حسینی', phone: '09011234567', address: 'اصفهان، چهارباغ', notes: '', customerType: 'real', description: '' },
    { name: 'امیر رضایی', phone: '09221234567', address: 'تهران، منطقه ۵', notes: 'مشتری جدید', customerType: 'real', description: '' },
    { name: 'فروشگاه رفاه شعبه ۲', phone: '02187654321', address: 'تهران، میدان ونک', notes: 'خرید هفتگی', customerType: 'legal', description: 'فروشگاه زنجیره‌ای' },
  ]
  const customerIds: number[] = []
  for (const c of customerData) {
    customerIds.push(insertCustomer.run(c.name, c.phone, c.address, c.notes, c.customerType, c.description).lastInsertRowid as number)
  }
  for (let i = 0; i < Math.min(3, customerIds.length); i++) {
    db.prepare('INSERT INTO customer_credit (customerId, creditLimit, currentDebt, creditScore) VALUES (?, ?, ?, ?)')
      .run(customerIds[i], (i + 1) * 5000000, 0, 80 + i * 5)
  }

  // ── Suppliers ────────────────────────────────────────────
  const insertSupplier = db.prepare('INSERT INTO suppliers (name, phone, company) VALUES (?, ?, ?)')
  const supplierData = [
    { name: 'شرکت پخش البرز', phone: '02188881111', company: 'پخش البرز' },
    { name: 'عمده فروشی رضا', phone: '02177772222', company: 'رضا عمده' },
    { name: 'پخش مواد غذایی سعادت', phone: '02155554444', company: 'سعادت' },
    { name: 'تکنوسان', phone: '02199995555', company: 'تکنوسان' },
  ]
  const supplierIds: number[] = []
  for (const s of supplierData) {
    supplierIds.push(insertSupplier.run(s.name, s.phone, s.company).lastInsertRowid as number)
  }

  // ── Sales (real repo → stock, journal, ledger all consistent) ──
  const methods: ('cash' | 'card' | 'ledger')[] = ['cash', 'cash', 'cash', 'card', 'card', 'ledger']
  for (let i = 0; i < 35; i++) {
    const numItems = randInt(2, 4)
    const shuffled = [...productRows].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, numItems)
    const items = selected.map(p => ({
      productId: p.id,
      productTitle: p.title,
      quantity: randInt(1, 4),
      unitPrice: p.sale_price,
      purchasePrice: p.purchase_price,
    }))
    const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0)
    const method = methods[randInt(0, methods.length - 1)]
    const customerId = method === 'ledger' ? customerIds[randInt(0, customerIds.length - 1)] : undefined
    salesRepo.createSale({
      userId: userIds[randInt(0, userIds.length - 1)],
      customerId,
      items,
      paymentMethod: method,
      customerPaid: method === 'cash' ? subtotal : 0,
      saleDate: randomDateTime(60),
      saleType: Math.random() > 0.7 ? 'online' : 'in-person',
    })
  }

  // ── Expenses (real repo → journal) ─────────────────────
  for (let i = 0; i < 15; i++) {
    const cat = EXPENSE_CATEGORIES[i % EXPENSE_CATEGORIES.length]
    expensesRepo.createExpense({
      category: cat.category,
      description: `${cat.category} دوره‌ای`,
      amount: randInt(cat.min, cat.max),
      date: randomDate(60),
    })
  }

  // ── Returns (real repo → stock restore + journal + balance) ──
  const cashSales = db.prepare("SELECT s.id, s.userId, s.customerId FROM sales s WHERE s.paymentMethod = 'cash' ORDER BY RANDOM() LIMIT 4").all() as { id: number; userId: number; customerId: number | null }[]
  for (const sale of cashSales) {
    const item = db.prepare('SELECT productId, unitPrice FROM sale_items WHERE saleId = ? LIMIT 1').get(sale.id) as { productId: number; unitPrice: number } | undefined
    if (item) returnsRepo.createReturn(sale.id, sale.userId, item.productId, 1, 'مرجوعی خرید', item.unitPrice, false)
  }

  // ── Purchases (real repo → stock + supplier balance + journal) ──
  for (let i = 0; i < 9; i++) {
    const supplierId = supplierIds[i % supplierIds.length]
    const numItems = randInt(2, 3)
    const shuffled = [...productRows].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, numItems)
    const items = selected.map(p => ({
      productId: p.id,
      productTitle: p.title,
      quantity: randInt(10, 50),
      unitCost: Math.round(p.purchase_price * (0.85 + Math.random() * 0.2)),
    }))
    const subtotal = items.reduce((s, it) => s + it.quantity * it.unitCost, 0)
    const taxAmount = Math.round(subtotal * 0.09)
    const discountAmount = Math.round(subtotal * 0.02)
    const total = subtotal + taxAmount - discountAmount
    const isPaid = i % 3 === 0 // every 3rd purchase is fully paid
    const paidAmount = isPaid ? total : (i % 3 === 1 ? Math.round(total * 0.5) : 0)
    purchasesRepo.createPurchase({
      supplierId,
      items,
      taxAmount,
      discountAmount,
      paidAmount,
      paymentMethod: isPaid ? 'cash' : 'credit',
      purchaseDate: randomDateTime(50),
    })
  }

  // ── Bank accounts + transactions ────────────────────────
  const bankIds: number[] = []
  for (const b of [
    { name: 'حساب جاری ملت', account_number: '0123456789', bank_name: 'بانک ملت', initial: 50000000 },
    { name: 'حساب جاری سپه', account_number: '9876543210', bank_name: 'بانک سپه', initial: 20000000 },
  ]) {
    bankIds.push(db.prepare('INSERT INTO bank_accounts (name, account_number, bank_name, account_type, initial_balance, current_balance) VALUES (?, ?, ?, ?, ?, ?)')
      .run(b.name, b.account_number, b.bank_name, 'current', b.initial, b.initial).lastInsertRowid as number)
  }
  db.prepare('INSERT INTO bank_transactions (bankAccountId, transactionDate, type, amount, balanceAfter, description) VALUES (?, ?, ?, ?, ?, ?)')
    .run(bankIds[0], randomDate(20), 'deposit', 15000000, 65000000, 'واریز فروشگاه')
  db.prepare('INSERT INTO bank_transactions (bankAccountId, transactionDate, type, amount, balanceAfter, description) VALUES (?, ?, ?, ?, ?, ?)')
    .run(bankIds[0], randomDate(10), 'withdrawal', 5000000, 60000000, 'برداشت نقدی')

  // ── Employees + salary payments ─────────────────────────
  const empIds: number[] = []
  for (const e of [
    { full_name: 'علی محمدی', position: 'فروشنده', baseSalary: 12000000, department: 'فروش' },
    { full_name: 'سارا احمدی', position: 'حسابدار', baseSalary: 15000000, department: 'مالی' },
    { full_name: 'رضا کریمی', position: 'انباردار', baseSalary: 10000000, department: 'انبار' },
    { full_name: 'مریم صادقی', position: 'مدیر فروش', baseSalary: 18000000, department: 'مدیریت' },
  ]) {
    empIds.push(db.prepare('INSERT INTO employees (full_name, position, department, baseSalary, hireDate, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(e.full_name, e.position, e.department, e.baseSalary, randomDate(400), 'active').lastInsertRowid as number)
  }
  for (const eid of empIds) {
    const baseSalary = (db.prepare('SELECT baseSalary FROM employees WHERE id = ?').get(eid) as { baseSalary: number }).baseSalary
    const bonuses = randInt(0, 2000000)
    const taxAmount = Math.round(baseSalary * 0.1)
    const insuranceAmount = Math.round(baseSalary * 0.07)
    const netSalary = baseSalary + bonuses - taxAmount - insuranceAmount
    db.prepare('INSERT INTO salary_payments (employeeId, paymentDate, period, baseSalary, bonuses, deductions, netSalary, taxAmount, insuranceAmount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(eid, randomDate(20), 'ماه گذشته', baseSalary, bonuses, taxAmount + insuranceAmount, netSalary, taxAmount, insuranceAmount, 'paid')
  }

  // ── Installments ────────────────────────────────────────
  const inst1 = db.prepare("INSERT INTO installments (installmentNumber, customerId, totalAmount, downPayment, installmentCount, monthlyAmount, status, startDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run('INS-2026-0001', customerIds[0], 1200000, 200000, 4, 250000, 'active', randomDate(30)).lastInsertRowid as number
  const inst2 = db.prepare("INSERT INTO installments (installmentNumber, customerId, totalAmount, downPayment, installmentCount, monthlyAmount, status, startDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run('INS-2026-0002', customerIds[2], 800000, 0, 3, 266667, 'active', randomDate(15)).lastInsertRowid as number
  const insertInstPay = db.prepare('INSERT INTO installment_payments (installmentId, installmentNumber, amount, dueDate, paidDate, status) VALUES (?, ?, ?, ?, ?, ?)')
  insertInstPay.run(inst1, 1, 250000, randomDate(15), randomDate(16), 'paid')
  insertInstPay.run(inst1, 2, 250000, randomDate(-15), null, 'pending')
  insertInstPay.run(inst1, 3, 250000, randomDate(-45), null, 'pending')
  insertInstPay.run(inst2, 1, 266667, randomDate(15), null, 'overdue')
  insertInstPay.run(inst2, 2, 266667, randomDate(-15), null, 'pending')

  // ── Proformas ───────────────────────────────────────────
  const pf1 = db.prepare("INSERT INTO proformas (proformaNumber, customerId, userId, subtotal, totalAmount, taxRate, status, validUntil, notes) VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, ?)")
    .run('PR-2026-0001', customerIds[0], adminId, 1500000, 1635000, 9, randomDate(-30), 'پیش‌فاکتور فروش عمده').lastInsertRowid as number
  const pf2 = db.prepare("INSERT INTO proformas (proformaNumber, customerId, userId, subtotal, totalAmount, taxRate, status, validUntil, notes) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)")
    .run('PR-2026-0002', customerIds[2], adminId, 900000, 981000, 9, randomDate(-10), 'پیش‌فاکتور صادرات').lastInsertRowid as number
  const insertPfItem = db.prepare('INSERT INTO proforma_items (proformaId, productId, productTitle, quantity, unitPrice, subtotal) VALUES (?, ?, ?, ?, ?, ?)')
  insertPfItem.run(pf1, productRows[0].id, productRows[0].title, 30, productRows[0].sale_price, productRows[0].sale_price * 30)
  insertPfItem.run(pf2, productRows[4].id, productRows[4].title, 10, productRows[4].sale_price, productRows[4].sale_price * 10)

  // ── Service tickets ─────────────────────────────────────
  db.prepare("INSERT INTO service_tickets (ticketNumber, customerId, productId, serialNumber, warrantyClaim, warrantyStartDate, status, priority, problemDescription, diagnosis, technician, partsCost, laborCost, totalCost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run('SRV-2026-0001', customerIds[0], productRows[0].id, 'SN-12345', 1, randomDate(-365), 'in_repair', 'high', 'خرابی دستگاه', 'خرابی برد', 'تکنسین محمد', 150000, 80000, 230000)
  db.prepare("INSERT INTO service_tickets (ticketNumber, customerId, productId, serialNumber, status, priority, problemDescription, diagnosis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run('SRV-2026-0002', customerIds[1], productRows[1].id, 'SN-67890', 'completed', 'normal', 'تعمیر صفحه', 'تعویض انجام شد')

  // ── Cross-sell rules ────────────────────────────────────
  const rule1 = db.prepare("INSERT INTO cross_sell_rules (name, triggerType, triggerValue, ruleType, priority, createdBy) VALUES (?, ?, ?, ?, ?, 'admin')")
    .run('لبنیات + نان', 'category', 'لبنیات', 'recommended', 1).lastInsertRowid as number
  const rule2 = db.prepare("INSERT INTO cross_sell_rules (name, triggerType, triggerValue, ruleType, priority, createdBy) VALUES (?, ?, ?, ?, ?, 'admin')")
    .run('خرید بالای ۲۰۰ هزار', 'price', '200000', 'mandatory', 0).lastInsertRowid as number
  db.prepare('INSERT INTO cross_sell_rule_items (ruleId, productId, quantity, discountPercent) VALUES (?, ?, ?, ?)').run(rule1, productRows[0].id, 1, 10)
  db.prepare('INSERT INTO cross_sell_rule_items (ruleId, productId, quantity, discountPercent) VALUES (?, ?, ?, ?)').run(rule2, productRows[12].id, 1, 0)

  // ── Fiscal periods (12 months) ──────────────────────────
  const now = new Date()
  const year = now.getFullYear()
  const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
  const existingPeriods = (db.prepare('SELECT COUNT(*) as c FROM fiscal_periods').get() as { c: number }).c
  if (existingPeriods === 0) {
    for (let i = 0; i < 12; i++) {
      const start = `${year}-${String(i + 1).padStart(2, '0')}-01`
      const end = new Date(year, i + 1, 0).toISOString().slice(0, 10)
      createPeriod(`${monthNames[i]} ${year}`, start, end)
    }
  }

  // ── Settings ────────────────────────────────────────────
  const storeName = (db.prepare("SELECT value FROM settings WHERE key = 'storeName'").get() as { value?: string } | undefined)?.value
  if (!storeName) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('storeName', ?)").run('فروشگاه آزمایشی دانیال')

  console.log('[Seed] Demo data loaded:', { products: productRows.length, customers: customerIds.length, suppliers: supplierIds.length, sales: 35, expenses: 15, purchases: 9 })
  return true
  } catch (err) {
    console.error('[Seed] Demo data failed (partial data may remain — use DB reset to start clean):', err)
    return false
  }
}
