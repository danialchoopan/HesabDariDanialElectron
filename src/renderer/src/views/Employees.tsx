/**
 * Employees — employee management and payroll processing.
 *
 * Features:
 *   - Employee list with search, salary display
 *   - Employee detail: personal info, salary info, payment history
 *   - Process payroll with bonuses, deductions, overtime
 *   - Payroll history per employee with net salary calculation
 */
import { useState, useEffect } from 'react'
import { useTheme } from '../hooks/useTheme'
import ShamsiDateInput from '../components/business/ShamsiDateInput'
import FormattedPriceInput from '../components/ui/FormattedPriceInput'
import Dialog, { DialogField, DialogInput, DialogButton } from '../components/ui/Dialog'


export default function Employees() {
  const { isDark, colors } = useTheme()
  const tPri = colors.text.primary
  const tSec = colors.text.secondary
  const cBg = colors.bg.card
  const cBorder = colors.border.default
  const sBg = colors.bg.primary
  const primary = '#006194'
  const ERR = '#ef4444'
  const SUC = '#22c55e'

  const [employees, setEmployees] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [payroll, setPayroll] = useState<any[]>([])
  const [dialog, setDialog] = useState<string | null>(null)
  const [form, setForm] = useState({ full_name: '', employeeCode: '', nationalId: '', position: '', department: '', hireDate: '', baseSalary: 0, salaryType: 'monthly', phone: '', bankAccount: '', accountNumber: '', notes: '' })
  const [payrollForm, setPayrollForm] = useState({ paymentDate: new Date().toISOString().slice(0, 10), period: '', baseSalary: 0, bonuses: 0, deductions: 0, overtimeHours: 0, overtimeRate: 0, taxAmount: 0, insuranceAmount: 0, paymentMethod: 'cash' })
  const [loading, setLoading] = useState(false)

  const inStyle = { background: colors.bg.input, border: `1px solid ${cBorder}`, color: tPri }

  const load = async () => {
    const r = await window.api.employees.getAll()
    if (r.success && r.data) setEmployees(r.data)
  }

  const refreshSelected = async (id: number) => {
    const r = await window.api.employees.getAll()
    if (r.success && r.data) {
      setEmployees(r.data)
      setSelected(r.data.find((e: any) => e.id === id) || null)
    }
    const pr = await window.api.employees.getPayroll(id)
    if (pr.success && pr.data) setPayroll(pr.data)
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    if (!form.full_name.trim()) return
    setLoading(true)
    if (dialog === 'addEmp') {
      await window.api.employees.create(form)
    } else if (dialog === 'editEmp' && selected) {
      await window.api.employees.update(selected.id, form)
    }
    setDialog(null); setForm({ full_name: '', employeeCode: '', nationalId: '', position: '', department: '', hireDate: '', baseSalary: 0, salaryType: 'monthly', phone: '', bankAccount: '', accountNumber: '', notes: '' })
    setLoading(false)
    await load()
  }

  const handlePayroll = async () => {
    if (!selected) return
    setLoading(true)
    const r = await window.api.employees.payroll({
      employeeId: selected.id,
      paymentDate: payrollForm.paymentDate,
      period: payrollForm.period || payrollForm.paymentDate,
      baseSalary: payrollForm.baseSalary || selected.baseSalary,
      bonuses: payrollForm.bonuses,
      deductions: payrollForm.deductions,
      overtimeHours: payrollForm.overtimeHours,
      overtimeRate: payrollForm.overtimeRate,
      taxAmount: payrollForm.taxAmount,
      insuranceAmount: payrollForm.insuranceAmount,
      paymentMethod: payrollForm.paymentMethod,
    })
    if (r.success) alert(`حقوق ثبت شد: ${r.data.netSalary.toLocaleString('fa-IR')} تومان`)
    setDialog(null)
    setLoading(false)
    await refreshSelected(selected.id)
  }

  return (
    <div className="h-full p-5 overflow-auto" style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-extrabold" style={{ color: tPri }}>مدیریت کارمندان</h2>
        <button onClick={() => { setDialog('addEmp'); setForm({ full_name: '', employeeCode: '', nationalId: '', position: '', department: '', hireDate: '', baseSalary: 0, salaryType: 'monthly', phone: '', bankAccount: '', accountNumber: '', notes: '' }) }}
          className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${primary}, #007bb9)` }}>+ کارمند جدید</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Employee List */}
        <div className="space-y-2">
          {employees.filter(e => e.status !== 'inactive').map(e => (
            <div key={e.id} onClick={() => { setSelected(e); refreshSelected(e.id) }}
              className="rounded-xl p-3 cursor-pointer transition-all" style={{ backgroundColor: cBg, border: `1px solid ${selected?.id === e.id ? primary : cBorder}`, borderLeft: selected?.id === e.id ? `3px solid ${primary}` : `3px solid transparent` }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold" style={{ color: tPri }}>{e.full_name}</div>
                  <div className="text-[10px]" style={{ color: tSec }}>{e.position || ''} {e.department ? `— ${e.department}` : ''}</div>
                </div>
                <div className="text-xs font-bold" style={{ color: SUC }}>{e.baseSalary.toLocaleString('fa-IR')}</div>
              </div>
            </div>
          ))}
          {employees.length === 0 && <div className="text-center py-8 text-sm" style={{ color: tSec }}>کارمندی ثبت نشده</div>}
        </div>

        {/* Employee Detail */}
        <div className="lg:col-span-2 space-y-3">
          {selected ? (<>
            <div className="rounded-xl p-4 border flex flex-wrap items-center justify-between gap-2" style={{ backgroundColor: cBg, borderColor: cBorder }}>
              <div>
                <div className="text-lg font-extrabold" style={{ color: tPri }}>{selected.full_name}</div>
                <div className="text-xs" style={{ color: tSec }}>{selected.position || '—'} {selected.department ? `— ${selected.department}` : ''}</div>
              </div>
              <div className="text-right">
                <div className="text-xs" style={{ color: tSec }}>حقوق پایه</div>
                <div className="text-lg font-extrabold" style={{ color: SUC }}>{selected.baseSalary.toLocaleString('fa-IR')} تومان</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setDialog('payroll'); setPayrollForm({ paymentDate: new Date().toISOString().slice(0, 10), period: '', baseSalary: selected.baseSalary, bonuses: 0, deductions: 0, overtimeHours: 0, overtimeRate: 0, taxAmount: 0, insuranceAmount: 0, paymentMethod: 'cash' }) }}
                className="px-3 py-2 rounded-xl text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${SUC}, #16a34a)` }}>پرداخت حقوق</button>
              <button onClick={() => { setDialog('editEmp'); setForm({ full_name: selected.full_name, employeeCode: selected.employeeCode || '', nationalId: selected.nationalId || '', position: selected.position || '', department: selected.department || '', hireDate: selected.hireDate || '', baseSalary: selected.baseSalary || 0, salaryType: selected.salaryType || 'monthly', phone: selected.phone || '', bankAccount: selected.bankAccount || '', accountNumber: selected.accountNumber || '', notes: selected.notes || '' }) }}
                className="px-3 py-2 rounded-xl text-xs font-bold" style={{ backgroundColor: cBg, border: `1px solid ${cBorder}`, color: tPri }}>ویرایش</button>
            </div>

            {/* Payroll History */}
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: cBorder }}>
              <div className="px-3 py-2 font-bold text-sm" style={{ backgroundColor: sBg, color: tPri }}>تاریخچه حقوق</div>
              {payroll.length === 0 ? (
                <div className="text-center py-6 text-xs" style={{ color: tSec }}>حقوقی پرداخت نشده</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr style={{ backgroundColor: sBg }}>
                      <th className="px-3 py-2 text-right" style={{ color: tSec }}>تاریخ</th>
                      <th className="px-3 py-2 text-right" style={{ color: tSec }}>دوره</th>
                      <th className="px-3 py-2 text-right" style={{ color: tSec }}>پایه</th>
                      <th className="px-3 py-2 text-right" style={{ color: tSec }}>.addRow</th>
                      <th className="px-3 py-2 text-right" style={{ color: tSec }}>کسورات</th>
                      <th className="px-3 py-2 text-right" style={{ color: tSec }}>خالص</th>
                      <th className="px-3 py-2 text-center" style={{ color: tSec }}>وضعیت</th>
                    </tr></thead>
                    <tbody>
                      {payroll.map((p: any) => (
                        <tr key={p.id} style={{ borderTop: `1px solid ${cBorder}` }}>
                          <td className="px-3 py-2" style={{ color: tSec }}>{p.paymentDate}</td>
                          <td className="px-3 py-2" style={{ color: tPri }}>{p.period}</td>
                          <td className="px-3 py-2 font-bold" style={{ color: tPri }}>{p.baseSalary.toLocaleString('fa-IR')}</td>
                          <td className="px-3 py-2 font-bold" style={{ color: SUC }}>{(p.bonuses + p.overtimeAmount).toLocaleString('fa-IR')}</td>
                          <td className="px-3 py-2 font-bold" style={{ color: ERR }}>{(p.deductions + p.taxAmount + p.insuranceAmount).toLocaleString('fa-IR')}</td>
                          <td className="px-3 py-2 font-extrabold" style={{ color: tPri }}>{p.netSalary.toLocaleString('fa-IR')}</td>
                          <td className="px-3 py-2 text-center"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: SUC + '15', color: SUC }}>پرداخت شده</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>) : (
            <div className="rounded-xl p-8 text-center" style={{ backgroundColor: cBg, border: `1px solid ${cBorder}` }}>
              <div className="text-sm" style={{ color: tSec }}>کارمند انتخاب کنید</div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Employee Dialog */}
      <Dialog open={dialog === 'addEmp' || dialog === 'editEmp'} onClose={() => setDialog(null)} title={dialog === 'addEmp' ? 'کارمند جدید' : 'ویرایش کارمند'} maxWidth="max-w-md"
        icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
        footer={<>
          <DialogButton variant="ghost" onClick={() => setDialog(null)}>لغو</DialogButton>
          <DialogButton variant="primary" onClick={handleSave} disabled={loading || !form.full_name.trim()}>ذخیره</DialogButton>
        </>}>
        <DialogField label="نام کامل *"><DialogInput value={form.full_name} onChange={v => setForm(f => ({ ...f, full_name: v }))} /></DialogField>
        <DialogField label="کد پرسنلی"><DialogInput value={form.employeeCode} onChange={v => setForm(f => ({ ...f, employeeCode: v }))} /></DialogField>
        <DialogField label="سمت"><DialogInput value={form.position} onChange={v => setForm(f => ({ ...f, position: v }))} /></DialogField>
        <DialogField label="بخش"><DialogInput value={form.department} onChange={v => setForm(f => ({ ...f, department: v }))} /></DialogField>
        <DialogField label="حقوق پایه *"><FormattedPriceInput value={form.baseSalary} onChange={v => setForm(f => ({ ...f, baseSalary: v }))} className="w-full px-3 py-2 rounded-xl text-sm font-bold outline-none" style={inStyle} /></DialogField>
        <DialogField label="تلفن"><DialogInput value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} /></DialogField>
        <DialogField label="توضیحات"><DialogInput value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} /></DialogField>
      </Dialog>

      {/* Payroll Dialog */}
      <Dialog open={dialog === 'payroll'} onClose={() => setDialog(null)} title={`پرداخت حقوق — ${selected?.full_name || ''}`} maxWidth="max-w-md"
        icon={<svg className="w-5 h-5" viewBox="0 0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 4 0 010 7H6"/></svg>}
        footer={<>
          <DialogButton variant="ghost" onClick={() => setDialog(null)}>لغو</DialogButton>
          <DialogButton variant="primary" onClick={handlePayroll} disabled={loading}>پرداخت حقوق</DialogButton>
        </>}>
        <DialogField label="تاریخ پرداخت *"><ShamsiDateInput value={payrollForm.paymentDate} onChange={v => setPayrollForm(f => ({ ...f, paymentDate: v }))} /></DialogField>
        <DialogField label="دوره"><DialogInput value={payrollForm.period} onChange={v => setPayrollForm(f => ({ ...f, period: v }))} placeholder="مثال: تیر ۱۴۰۴" /></DialogField>
        <DialogField label="حقوق پایه"><FormattedPriceInput value={payrollForm.baseSalary} onChange={v => setPayrollForm(f => ({ ...f, baseSalary: v }))} className="w-full px-3 py-2 rounded-xl text-sm font-bold outline-none" style={inStyle} /></DialogField>
        <DialogField label="پاداش"><FormattedPriceInput value={payrollForm.bonuses} onChange={v => setPayrollForm(f => ({ ...f, bonuses: v }))} className="w-full px-3 py-2 rounded-xl text-sm font-bold outline-none" style={inStyle} /></DialogField>
        <DialogField label="کسورات"><FormattedPriceInput value={payrollForm.deductions} onChange={v => setPayrollForm(f => ({ ...f, deductions: v }))} className="w-full px-3 py-2 rounded-xl text-sm font-bold outline-none" style={inStyle} /></DialogField>
        <DialogField label="ساعت اضافه‌کاری"><input type="number" value={payrollForm.overtimeHours} onChange={e => setPayrollForm(f => ({ ...f, overtimeHours: Number(e.target.value) || 0 }))} className="input-field text-sm" style={inStyle} /></DialogField>
        <DialogField label="نرخ اضافه‌کاری"><FormattedPriceInput value={payrollForm.overtimeRate} onChange={v => setPayrollForm(f => ({ ...f, overtimeRate: v }))} className="w-full px-3 py-2 rounded-xl text-sm font-bold outline-none" style={inStyle} /></DialogField>
      </Dialog>
    </div>
  )
}
