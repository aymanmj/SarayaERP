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

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">وحدات القياس (UOMs)</h1>
          <p className="text-slate-500 text-sm mt-1">إدارة الوحدات الأساسية والتحويلية في النظام</p>
        </div>
        <button
          onClick={() => {
            setEditingUOM(null);
            setFormData({ code: '', name: '', isActive: true });
            setShowModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <i className="fi fi-rr-plus ml-2"></i>
          إضافة وحدة
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">جاري التحميل...</div>
        ) : uoms.length === 0 ? (
          <div className="p-12 text-center text-slate-500">لا توجد وحدات معرفة حالياً</div>
        ) : (
          <table className="w-full text-right">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">الرمز</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">الاسم</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">الحالة</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-center w-24">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {uoms.map((uom) => (
                <tr key={uom.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-800 font-medium">{uom.code}</td>
                  <td className="px-6 py-4 text-sm text-slate-800">{uom.name}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${uom.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}>
                      {uom.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleEdit(uom)}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      <i className="fi fi-rr-edit"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">
                {editingUOM ? 'تعديل وحدة' : 'وحدة جديدة'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <i className="fi fi-rr-cross"></i>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">رمز الوحدة</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="مثال: BOX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">اسم الوحدة</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="مثال: علبة"
                />
              </div>

              <div className="flex items-center mt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="isActive" className="mr-2 block text-sm text-slate-700 cursor-pointer">
                  وحدة نشطة ومتاحة للاستخدام
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
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
