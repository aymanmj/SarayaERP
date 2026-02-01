// src/pages/insurance/InsuranceProvidersPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type InsuranceProvider = {
  id: number;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  isActive: boolean;
  _count?: {
    policies: number;
    plans: number;
  };
};

export default function InsuranceProvidersPage() {
  const [providers, setProviders] = useState<InsuranceProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    phone: "",
    email: "",
    address: "",
    isActive: true,
  });

  const loadProviders = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<InsuranceProvider[]>(
        "/insurance/providers",
      );
      setProviders(res.data);
    } catch (err) {
      toast.error("فشل تحميل شركات التأمين");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  // فتح المودال للإضافة
  const openCreateModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({
      name: "",
      code: "",
      phone: "",
      email: "",
      address: "",
      isActive: true,
    });
    setShowModal(true);
  };

  // فتح المودال للتعديل
  const openEditModal = (provider: InsuranceProvider) => {
    setIsEditing(true);
    setEditingId(provider.id);
    setFormData({
      name: provider.name,
      code: provider.code,
      phone: provider.phone || "",
      email: provider.email || "",
      address: provider.address || "",
      isActive: provider.isActive,
    });
    setShowModal(true);
  };

  // الحفظ (إنشاء أو تعديل)
  const handleSave = async () => {
    if (!formData.name || !formData.code) {
      toast.warning("الاسم والكود مطلوبان");
      return;
    }

    try {
      if (isEditing && editingId) {
        // تعديل
        await apiClient.patch(`/insurance/providers/${editingId}`, formData);
        toast.success("تم تعديل بيانات الشركة بنجاح");
      } else {
        // إنشاء
        await apiClient.post("/insurance/providers", formData);
        toast.success("تم إضافة الشركة بنجاح");
      }
      setShowModal(false);
      loadProviders();
    } catch (err) {
      toast.error("فشل الحفظ");
    }
  };

  // الأرشفة (Soft Delete)
  const handleSoftDelete = async (id: number, name: string) => {
    if (!confirm(`هل أنت متأكد من أرشفة (إيقاف) شركة "${name}"؟`)) return;

    try {
      await apiClient.delete(`/insurance/providers/${id}`);
      toast.success("تم أرشفة الشركة بنجاح");
      loadProviders();
    } catch (err) {
      toast.error("فشل الأرشفة");
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            شركات التأمين (Insurance Providers)
          </h1>
          <p className="text-sm text-slate-400">
            إدارة عقود الشركات، البوالص، والخطط التأمينية.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2"
        >
          <span>+</span> شركة جديدة
        </button>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && (
          <div className="col-span-3 text-center text-slate-500">
            جارِ التحميل...
          </div>
        )}

        {!loading && providers.length === 0 && (
          <div className="col-span-3 text-center py-10 bg-slate-900/50 rounded-2xl border border-slate-800 text-slate-500">
            لا توجد شركات تأمين مضافة بعد.
          </div>
        )}

        {providers.map((prov) => (
          <div
            key={prov.id}
            className={`border rounded-2xl p-5 transition group relative flex flex-col justify-between
              ${
                prov.isActive
                  ? "bg-slate-900/60 border-slate-800 hover:border-sky-500/50"
                  : "bg-slate-900/30 border-slate-800 opacity-70"
              }
            `}
          >
            <div>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg text-white">{prov.name}</h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded border ${
                    prov.isActive
                      ? "bg-emerald-900/30 text-emerald-300 border-emerald-500/30"
                      : "bg-rose-900/30 text-rose-300 border-rose-500/30"
                  }`}
                >
                  {prov.isActive ? "نشط" : "أرشيف"}
                </span>
              </div>

              <div className="text-sm text-slate-400 space-y-1 mb-4">
                <div className="font-mono text-xs text-sky-400">
                  Code: {prov.code}
                </div>
                <div>{prov.phone || "—"}</div>
                <div>{prov.email || "—"}</div>
                <div className="text-xs text-slate-500 truncate">
                  {prov.address}
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
              <button
                onClick={() => navigate(`/insurance/providers/${prov.id}`)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg transition flex items-center gap-1"
              >
                <span>⚙️</span> إدارة الخطط
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(prov)}
                  className="text-slate-400 hover:text-white px-2 py-1 hover:bg-slate-800 rounded transition"
                >
                  تعديل
                </button>
                {prov.isActive && (
                  <button
                    onClick={() => handleSoftDelete(prov.id, prov.name)}
                    className="text-rose-400 hover:text-rose-300 px-2 py-1 hover:bg-rose-900/20 rounded transition"
                  >
                    أرشفة
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal (Create / Edit) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-4">
              {isEditing ? "تعديل شركة تأمين" : "إضافة شركة تأمين"}
            </h3>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-slate-400 mb-1 text-xs">
                  اسم الشركة <span className="text-rose-500">*</span>
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
                  placeholder="مثال: شركة ليبيا للتأمين"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 text-xs">
                  الكود التعريفي <span className="text-rose-500">*</span>
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:border-sky-500 outline-none font-mono"
                  placeholder="مثال: LIC-001"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 text-xs">
                    الهاتف
                  </label>
                  <input
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-xs">
                    البريد الإلكتروني
                  </label>
                  <input
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 text-xs">
                  العنوان
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                />
              </div>

              {isEditing && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData({ ...formData, isActive: e.target.checked })
                    }
                    className="w-4 h-4 rounded bg-slate-800 border-slate-600 accent-emerald-500"
                  />
                  <label
                    htmlFor="isActive"
                    className="text-sm text-slate-300 cursor-pointer"
                  >
                    الشركة نشطة (Active)
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800 mt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300 text-sm hover:bg-slate-700 transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg transition"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// // src/pages/insurance/InsuranceProvidersPage.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../api/apiClient";
// import { useNavigate } from "react-router-dom";
// import { toast } from "sonner";

// type InsuranceProvider = {
//   id: number;
//   code: string;
//   name: string;
//   phone?: string;
//   email?: string;
//   isActive: boolean;
//   _count?: {
//     policies: number;
//     plans: number;
//   };
// };

// export default function InsuranceProvidersPage() {
//   const [providers, setProviders] = useState<InsuranceProvider[]>([]);
//   const [loading, setLoading] = useState(false);
//   const navigate = useNavigate();

//   // Form State
//   const [showModal, setShowModal] = useState(false);
//   const [newProvider, setNewProvider] = useState({
//     name: "",
//     code: "",
//     phone: "",
//     email: "",
//     address: "",
//   });

//   const loadProviders = async () => {
//     setLoading(true);
//     try {
//       const res = await apiClient.get<InsuranceProvider[]>(
//         "/insurance/providers",
//       );
//       setProviders(res.data);
//     } catch (err) {
//       toast.error("فشل تحميل شركات التأمين");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     loadProviders();
//   }, []);

//   const handleCreate = async () => {
//     if (!newProvider.name || !newProvider.code) {
//       toast.warning("الاسم والكود مطلوبان");
//       return;
//     }
//     try {
//       await apiClient.post("/insurance/providers", newProvider);
//       toast.success("تم إضافة الشركة بنجاح");
//       setShowModal(false);
//       setNewProvider({ name: "", code: "", phone: "", email: "", address: "" });
//       loadProviders();
//     } catch (err) {
//       toast.error("فشل الإضافة");
//     }
//   };

//   return (
//     <div
//       className="p-6 text-slate-100 h-full flex flex-col space-y-6"
//       dir="rtl"
//     >
//       {/* Header */}
//       <div className="flex justify-between items-center">
//         <div>
//           <h1 className="text-2xl font-bold mb-1">
//             شركات التأمين (Insurance Providers)
//           </h1>
//           <p className="text-sm text-slate-400">
//             إدارة عقود الشركات، البوالص، والخطط التأمينية.
//           </p>
//         </div>
//         <button
//           onClick={() => setShowModal(true)}
//           className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold shadow-lg"
//         >
//           + شركة جديدة
//         </button>
//       </div>

//       {/* List */}
//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//         {loading && (
//           <div className="col-span-3 text-center text-slate-500">
//             جارِ التحميل...
//           </div>
//         )}

//         {!loading && providers.length === 0 && (
//           <div className="col-span-3 text-center py-10 bg-slate-900/50 rounded-2xl border border-slate-800 text-slate-500">
//             لا توجد شركات تأمين مضافة بعد.
//           </div>
//         )}

//         {providers.map((prov) => (
//           <div
//             key={prov.id}
//             className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-sky-500/50 transition group relative"
//           >
//             <div className="flex justify-between items-start mb-2">
//               <h3 className="font-bold text-lg text-white">{prov.name}</h3>
//               <span
//                 className={`text-[10px] px-2 py-0.5 rounded border ${prov.isActive ? "bg-emerald-900/30 text-emerald-300 border-emerald-500/30" : "bg-rose-900/30 text-rose-300 border-rose-500/30"}`}
//               >
//                 {prov.isActive ? "نشط" : "متوقف"}
//               </span>
//             </div>

//             <div className="text-sm text-slate-400 space-y-1 mb-4">
//               <div className="font-mono text-xs text-sky-400">
//                 Code: {prov.code}
//               </div>
//               <div>{prov.phone || "لا يوجد هاتف"}</div>
//               <div>{prov.email || "لا يوجد بريد"}</div>
//             </div>

//             <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
//               {/*
//                  ملاحظة: _count قد لا تأتي من الـ API إذا لم تطلبها في الـ Controller،
//                  لكن إذا عدلت الـ Controller لتشملها ستظهر هنا.
//                */}
//               <span>
//                 {/* بوالص: {prov._count?.policies ?? 0} | خطط: {prov._count?.plans ?? 0} */}
//               </span>
//               <button
//                 onClick={() => navigate(`/insurance/providers/${prov.id}`)}
//                 className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg transition"
//               >
//                 إدارة العقود والخطط ⚙️
//               </button>
//             </div>
//           </div>
//         ))}
//       </div>

//       {/* Modal */}
//       {showModal && (
//         <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
//           <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
//             <h3 className="text-lg font-bold text-white">إضافة شركة تأمين</h3>
//             <div className="space-y-3 text-sm">
//               <div>
//                 <label className="block text-slate-400 mb-1 text-xs">
//                   اسم الشركة *
//                 </label>
//                 <input
//                   className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
//                   placeholder="مثال: شركة ليبيا للتأمين"
//                   value={newProvider.name}
//                   onChange={(e) =>
//                     setNewProvider({ ...newProvider, name: e.target.value })
//                   }
//                 />
//               </div>
//               <div>
//                 <label className="block text-slate-400 mb-1 text-xs">
//                   الكود التعريفي (Code) *
//                 </label>
//                 <input
//                   className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
//                   placeholder="مثال: LIC-001"
//                   value={newProvider.code}
//                   onChange={(e) =>
//                     setNewProvider({ ...newProvider, code: e.target.value })
//                   }
//                 />
//               </div>
//               <div className="grid grid-cols-2 gap-3">
//                 <div>
//                   <label className="block text-slate-400 mb-1 text-xs">
//                     الهاتف
//                   </label>
//                   <input
//                     className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
//                     value={newProvider.phone}
//                     onChange={(e) =>
//                       setNewProvider({ ...newProvider, phone: e.target.value })
//                     }
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-slate-400 mb-1 text-xs">
//                     البريد الإلكتروني
//                   </label>
//                   <input
//                     className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
//                     value={newProvider.email}
//                     onChange={(e) =>
//                       setNewProvider({ ...newProvider, email: e.target.value })
//                     }
//                   />
//                 </div>
//               </div>
//               <div>
//                 <label className="block text-slate-400 mb-1 text-xs">
//                   العنوان
//                 </label>
//                 <input
//                   className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
//                   value={newProvider.address}
//                   onChange={(e) =>
//                     setNewProvider({ ...newProvider, address: e.target.value })
//                   }
//                 />
//               </div>
//             </div>
//             <div className="flex justify-end gap-2 pt-2">
//               <button
//                 onClick={() => setShowModal(false)}
//                 className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300 text-sm hover:bg-slate-700"
//               >
//                 إلغاء
//               </button>
//               <button
//                 onClick={handleCreate}
//                 className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg"
//               >
//                 حفظ
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }
