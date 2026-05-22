import React, { useState, useEffect } from 'react';
import { inventoryApi } from '../../../api/inventoryApi';
import { toast } from 'sonner';

export const UOMManagementPage: React.FC = () => {
  const [uoms, setUoms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingUOM, setEditingUOM] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    isActive: true,
  });

  const fetchUOMs = async () => {
    try {
      setLoading(true);
      const data = await inventoryApi.getUOMs();
      setUoms(data);
    } catch (error) {
      toast.error('حدث خطأ أثناء تحميل الوحدات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUOMs();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) {
      toast.error('الرجاء إدخال الرمز والاسم');
      return;
    }

    try {
      if (editingUOM) {
        await inventoryApi.updateUOM(editingUOM.id, formData);
        toast.success('تم التحديث بنجاح');
      } else {
        await inventoryApi.createUOM(formData);
        toast.success('تمت الإضافة بنجاح');
      }
      setShowModal(false);
      fetchUOMs();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'حدث خطأ أثناء الحفظ');
    }
  };

  const handleEdit = (uom: any) => {
    setEditingUOM(uom);
    setFormData({
      code: uom.code || '',
      name: uom.name,
      isActive: uom.isActive,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('هل أنت متأكد من رغبتك في حذف هذه الوحدة؟ لا يمكن التراجع عن هذا الإجراء.')) {
      try {
        await inventoryApi.deleteUOM(id);
        toast.success('تم حذف الوحدة بنجاح');
        fetchUOMs();
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'فشل في حذف الوحدة؛ قد تكون مرتبطة بأصناف أو حركات مخزنية حالية');
      }
    }
  };

  return (
    <div className="p-6 text-slate-100" dir="rtl">
      <div className="flex justify-between items-center mb-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">📏</span>
            إدارة وحدات القياس (UOMs)
          </h1>
          <p className="text-slate-400 text-sm mt-1">إدارة الوحدات الأساسية والتحويلية في النظام للربط والمخزون</p>
        </div>
        <button
          onClick={() => {
            setEditingUOM(null);
            setFormData({ code: '', name: '', isActive: true });
            setShowModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2"
        >
          <span>+</span> إضافة وحدة قياس
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-500">جاري التحميل...</div>
        ) : uoms.length === 0 ? (
          <div className="p-12 text-center text-slate-500">لا توجد وحدات قياس معرّفة حالياً</div>
        ) : (
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-bold">
              <tr>
                <th className="px-6 py-4 font-bold text-right">الرمز</th>
                <th className="px-6 py-4 font-bold text-right">الاسم</th>
                <th className="px-6 py-4 font-bold text-right">الحالة</th>
                <th className="px-6 py-4 font-bold text-center w-32">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {uoms.map((uom) => (
                <tr key={uom.id} className="hover:bg-slate-800/30 transition-colors border-b border-slate-800/30">
                  <td className="px-6 py-4 font-mono font-medium text-slate-200">{uom.code}</td>
                  <td className="px-6 py-4 text-slate-300">{uom.name}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${uom.isActive ? 'bg-green-500/10 text-green-400' : 'bg-slate-500/10 text-slate-400'}`}>
                      {uom.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center items-center gap-3">
                      <button
                        onClick={() => handleEdit(uom)}
                        className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        title="تعديل"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(uom.id)}
                        className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="حذف"
                      >
                        ❌
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" dir="rtl">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-lg font-bold text-white">
                {editingUOM ? 'تعديل وحدة قياس' : 'وحدة قياس جديدة'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition-colors text-xl font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">رمز الوحدة (UOM Code)</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-slate-200 placeholder:text-slate-600 font-mono"
                  placeholder="مثال: PCS, BOX, KG"
                />
                <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                  الرمز القياسي للوحدة (يُكتب بالإنجليزية الكبيرة). يُستخدم كمعيار مرجعي لربط الحسابات وتكامل منظومة الفاتورة الإلكترونية.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">اسم الوحدة</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-slate-200 placeholder:text-slate-500"
                  placeholder="مثال: قطعة، علبة، صندوق"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 bg-slate-950 border-slate-700 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="isActive" className="text-sm text-slate-300 cursor-pointer select-none">
                  وحدة نشطة ومتاحة للاستخدام في الأصناف
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-8 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2 text-sm font-bold text-slate-300 bg-slate-850 hover:bg-slate-800 rounded-xl transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-900/20 transition-all"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
