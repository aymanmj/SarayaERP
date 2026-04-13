import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
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

  const cashAccounts = accounts.filter(a => a.type === 'ASSET' && (a.name.includes('صندوق') || a.name.includes('خزينة') || a.name.includes('بنك') || a.code.startsWith('10')));
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
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="mx-auto w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl pointer-events-auto overflow-y-auto max-h-[90vh]" dir="rtl">
          <div className="flex justify-between items-center mb-6 border-b pb-4">
            <h2 className="text-xl font-bold">
              {initialData ? 'تعديل السند' : 'إنشاء سند جديد'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">نوع السند</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as VoucherType })}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  required
                  disabled={!!initialData}
                >
                  <option value={VoucherType.PAYMENT}>سند صرف (Payment)</option>
                  <option value={VoucherType.RECEIPT}>سند قبض (Receipt)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ السند</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  رقم المرجع (شيك/إيصال)
                </label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="w-full border-gray-300 rounded-md shadow-sm"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  حساب الصندوق / البنك
                </label>
                <select
                  value={formData.cashAccountId}
                  onChange={(e) => setFormData({ ...formData, cashAccountId: Number(e.target.value) })}
                  className="w-full border-gray-300 rounded-md shadow-sm"
                  required
                >
                  <option value={0}>-- الرجاء اختيار الصندوق/البنك --</option>
                  {cashAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الحساب المقابل (مصروف / إيراد / ذمة)
                </label>
                <select
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: Number(e.target.value) })}
                  className="w-full border-gray-300 rounded-md shadow-sm"
                  required
                >
                  <option value={0}>-- الرجاء اختيار الحساب --</option>
                  {offsetAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formData.type === VoucherType.PAYMENT ? 'يصرف للسيد/ة' : 'استلمنا من السيد/ة'}
                </label>
                <input
                  type="text"
                  value={formData.payeeOrPayer}
                  onChange={(e) => setFormData({ ...formData, payeeOrPayer: e.target.value })}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">البيان (التفاصيل)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 bg-white cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
              >
                حفظ كمسودة
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
