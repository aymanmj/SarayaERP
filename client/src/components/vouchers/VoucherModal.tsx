import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { CreateVoucherDto, VoucherType } from '../../services/vouchersService';
import { apiClient } from '../../api/apiClient';

interface VoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateVoucherDto) => Promise<void>;
  initialData?: any;
}

export default function VoucherModal({ isOpen, onClose, onSave, initialData }: VoucherModalProps) {
  const [formData, setFormData] = useState<CreateVoucherDto>({
    type: VoucherType.PAYMENT,
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    accountId: 0,
    cashAccountId: 0,
    notes: '',
    payeeOrPayer: '',
    reference: '',
  });

  const [accounts, setAccounts] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      apiClient.get('/accounting/accounts-lite').then(res => setAccounts(res.data)).catch(console.error);
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        type: initialData.type,
        date: initialData.date.split('T')[0],
        amount: initialData.amount,
        accountId: initialData.accountId,
        cashAccountId: initialData.cashAccountId,
        notes: initialData.notes || '',
        payeeOrPayer: initialData.payeeOrPayer || '',
        reference: initialData.reference || '',
      });
    } else {
      setFormData({
        type: VoucherType.PAYMENT,
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        accountId: 0,
        cashAccountId: 0,
        notes: '',
        payeeOrPayer: '',
        reference: '',
      });
    }
  }, [initialData, isOpen]);

  const cashAccounts = accounts.filter(a => a.name.includes('صندوق') || a.name.includes('خزينة') || a.name.includes('بنك') || a.code.startsWith('10'));
  const offsetAccounts = accounts.filter(a => a.id !== formData.cashAccountId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      ...formData,
      amount: Number(formData.amount),
      accountId: Number(formData.accountId),
      cashAccountId: Number(formData.cashAccountId),
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="relative z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={onClose} />
      
      {/* Modal Wrapping Box */}
      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="mx-auto w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]" dir="rtl">
          
          {/* Header */}
          <div className="flex justify-between items-center bg-slate-900/80 px-6 py-4 border-b border-slate-800">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              {initialData ? 'تعديل السند المالي' : 'إنشاء سند مالي جديد'}
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition">
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar text-slate-300">
            <div className="grid grid-cols-2 gap-5">
              
              {/* Type */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">نوع السند</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as VoucherType })}
                  className="w-full bg-slate-800 border-slate-700 text-slate-100 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 p-2.5 outline-none transition"
                  required
                  disabled={!!initialData}
                >
                  <option value={VoucherType.PAYMENT}>سند صرف نقدية (Payment)</option>
                  <option value={VoucherType.RECEIPT}>سند قبض نقدية (Receipt)</option>
                </select>
              </div>
              
              {/* Date */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">تاريخ السند</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full bg-slate-800 border-slate-700 text-slate-100 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 p-2.5 outline-none transition"
                  required
                />
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">المبلغ (دينار ليبي)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 p-2.5 outline-none transition"
                  required
                  placeholder="0.000"
                />
              </div>

              {/* Reference */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  رقم المرجع <span className="text-slate-500 text-xs">(شيك / إيصال إيداع)</span>
                </label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="w-full bg-slate-800 border-slate-700 text-slate-100 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 p-2.5 outline-none transition"
                  placeholder="رقم مرجعي اختياري..."
                />
              </div>

              {/* Cash Account */}
              <div className="col-span-2 space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  حساب الصندوق أو البنك المرتبط
                </label>
                <select
                  value={formData.cashAccountId}
                  onChange={(e) => setFormData({ ...formData, cashAccountId: Number(e.target.value) })}
                  className="w-full bg-slate-800 border-slate-700 text-slate-100 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 p-2.5 outline-none transition"
                  required
                >
                  <option value={0} disabled>-- الرجاء اختيار الصندوق / البنك --</option>
                  {cashAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
                {formData.cashAccountId > 0 && <p className="text-xs text-sky-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> سيتم أخذ قيمة القيد من هذا الحساب.</p>}
              </div>

              {/* Offset Account */}
              <div className="col-span-2 space-y-1.5 mt-2">
                <label className="block text-sm font-medium text-slate-300">
                  حساب التسوية / الحساب المقابل <span className="text-slate-500 text-xs">(مصروف، إيراد، مورد، عميل)</span>
                </label>
                <select
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: Number(e.target.value) })}
                  className="w-full bg-slate-800 border-slate-700 text-slate-100 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 p-2.5 outline-none transition"
                  required
                >
                  <option value={0} disabled>-- الرجاء البحث عن واختيار الحساب المقابل --</option>
                  {offsetAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              {/* Payee/Payer */}
              <div className="col-span-2 space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  {formData.type === VoucherType.PAYMENT ? 'يصرف للسيـد/ة / الجهـة' : 'استلمنا من السيـد/ة / الجهـة'}
                </label>
                <input
                  type="text"
                  value={formData.payeeOrPayer}
                  onChange={(e) => setFormData({ ...formData, payeeOrPayer: e.target.value })}
                  className="w-full bg-slate-800 border-slate-700 text-slate-100 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 p-2.5 outline-none transition"
                  placeholder="اسم الشخص أو الجهة المعنية في الإيصال..."
                />
              </div>

              {/* Notes */}
              <div className="col-span-2 space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">البيان (تفاصيل العملية الماليـة)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-slate-800 border-slate-700 text-slate-100 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 p-2.5 outline-none transition resize-none leading-relaxed"
                  placeholder="وذلك عن..."
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-800 hover:text-white transition font-medium cursor-pointer"
              >
                إلغاء الأمر
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-sky-600 text-white rounded-xl shadow-lg shadow-sky-900/20 hover:bg-sky-500 transition flex items-center gap-2 font-medium cursor-pointer"
              >
                <Save className="w-4 h-4" />
                حفظ كمسودة
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
