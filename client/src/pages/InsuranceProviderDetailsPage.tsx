// src/pages/insurance/InsuranceProviderDetailsPage.tsx

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import type { InsurancePlan } from "../types/insurance";

type Policy = {
  id: number;
  name: string;
  policyNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  plan?: { name: string } | null;
};

export default function InsuranceProviderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const providerId = Number(id);

  const [plans, setPlans] = useState<InsurancePlan[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]); // ✅
  const [providerName, setProviderName] = useState("");
  const [loading, setLoading] = useState(false);

  // Modals
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false); // ✅

  // Forms
  const [newPlan, setNewPlan] = useState({
    name: "",
    defaultCopayRate: "0",
    maxCopayAmount: "",
  });

  const [newPolicy, setNewPolicy] = useState({
    name: "",
    policyNumber: "",
    planId: "",
    startDate: "",
    endDate: "",
    maxCoverageAmount: "",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      // نحتاج لجلب بيانات الشركة بالتفصيل (خطط + بوالص)
      // للأسف الـ endpoint العام findAllProviders يعيد مصفوفة
      // سنستخدمه ونبحث فيه مؤقتاً، أو الأفضل عمل endpoint getOne
      const res = await apiClient.get<any[]>("/insurance/providers");
      const provider = res.data.find((p) => p.id === providerId);

      if (provider) {
        setProviderName(provider.name);
        setPlans(provider.plans || []);
        setPolicies(provider.policies || []); // ✅
      }
    } catch (err) {
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (providerId) loadData();
  }, [providerId]);

  // إنشاء خطة
  const handleCreatePlan = async () => {
    if (!newPlan.name) return;
    try {
      await apiClient.post(`/insurance/providers/${providerId}/plans`, {
        name: newPlan.name,
        defaultCopayRate: Number(newPlan.defaultCopayRate),
        maxCopayAmount: newPlan.maxCopayAmount
          ? Number(newPlan.maxCopayAmount)
          : null,
      });
      toast.success("تم إنشاء الخطة");
      setShowPlanModal(false);
      setNewPlan({ name: "", defaultCopayRate: "0", maxCopayAmount: "" });
      loadData();
    } catch (err) {
      toast.error("فشل إنشاء الخطة");
    }
  };

  // ✅ إنشاء بوليصة
  const handleCreatePolicy = async () => {
    if (!newPolicy.name) {
      toast.warning("اسم البوليصة مطلوب");
      return;
    }
    try {
      await apiClient.post(`/insurance/providers/${providerId}/policies`, {
        name: newPolicy.name,
        policyNumber: newPolicy.policyNumber || undefined,
        planId: newPolicy.planId ? Number(newPolicy.planId) : undefined, // ربط بالخطة
        startDate: newPolicy.startDate || undefined,
        endDate: newPolicy.endDate || undefined,
        maxCoverageAmount: newPolicy.maxCoverageAmount
          ? Number(newPolicy.maxCoverageAmount)
          : undefined,
      });
      toast.success("تم إنشاء البوليصة");
      setShowPolicyModal(false);
      setNewPolicy({
        name: "",
        policyNumber: "",
        planId: "",
        startDate: "",
        endDate: "",
        maxCoverageAmount: "",
      });
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("فشل إنشاء البوليصة");
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-8"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <div>
          <button
            onClick={() => navigate("/insurance/providers")}
            className="text-xs text-slate-400 hover:text-white mb-1"
          >
            ➜ العودة لقائمة الشركات
          </button>
          <h1 className="text-2xl font-bold">إدارة: {providerName}</h1>
        </div>
      </div>

      {/* SECTION 1: POLICIES (العقود/البوالص) */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-emerald-400">
            📋 البوالص / العقود السارية
          </h2>
          <button
            onClick={() => setShowPolicyModal(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold shadow-lg"
          >
            + عقد / بوليصة جديدة
          </button>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-2">اسم البوليصة</th>
                <th className="px-4 py-2">رقم البوليصة</th>
                <th className="px-4 py-2">الخطة المرتبطة</th>
                <th className="px-4 py-2">الصلاحية</th>
                <th className="px-4 py-2">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {policies.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-slate-500">
                    لا توجد بوالص. يجب إضافة بوليصة لربط المرضى.
                  </td>
                </tr>
              )}
              {policies.map((pol) => (
                <tr key={pol.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-2 font-semibold">{pol.name}</td>
                  <td className="px-4 py-2 font-mono text-slate-400">
                    {pol.policyNumber || "—"}
                  </td>
                  <td className="px-4 py-2 text-sky-300">
                    {pol.plan?.name || "بدون خطة (نقدي/عام)"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {pol.startDate
                      ? formatDate(pol.startDate)
                      : "?"}
                    {" -> "}
                    {pol.endDate
                      ? formatDate(pol.endDate)
                      : "?"}
                  </td>
                  <td className="px-4 py-2">
                    {pol.isActive ? (
                      <span className="text-emerald-400 text-xs">نشط</span>
                    ) : (
                      <span className="text-rose-400 text-xs">منتهي</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 2: PLANS (الخطط) */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-sky-400">
            ⚙️ خطط التغطية (Plans)
          </h2>
          <button
            onClick={() => setShowPlanModal(true)}
            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-bold shadow-lg"
          >
            + خطة جديدة
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 hover:border-sky-500/30 transition group"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-base text-white">{plan.name}</h3>
              </div>

              <div className="text-xs text-slate-400 space-y-1 mb-3">
                <div>
                  التحمل الافتراضي:{" "}
                  <span className="text-slate-200">
                    {(plan.defaultCopayRate * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => navigate(`/insurance/plans/${plan.id}`)}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded text-xs transition"
                >
                  إدارة القواعد ⚙️
                </button>
              </div>
            </div>
          ))}
          {plans.length === 0 && (
            <div className="col-span-3 text-center py-6 text-slate-500 border border-dashed border-slate-700 rounded-xl">
              لا توجد خطط تأمينية. قم بإنشاء خطة أولاً ثم اربطها ببوليصة.
            </div>
          )}
        </div>
      </section>

      {/* Modal: Create Plan */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold">إضافة خطة تأمين جديدة</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">اسم الخطة</label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
                  placeholder="مثال: الفئة الذهبية (Gold)"
                  value={newPlan.name}
                  onChange={(e) =>
                    setNewPlan({ ...newPlan, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  نسبة التحمل الافتراضية (0.0 - 1.0)
                </label>
                <input
                  type="number"
                  step="0.01"
                  max="1"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
                  value={newPlan.defaultCopayRate}
                  onChange={(e) =>
                    setNewPlan({ ...newPlan, defaultCopayRate: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPlanModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300 text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreatePlan}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Policy */}
      {showPolicyModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-emerald-400">
              إضافة عقد / بوليصة جديدة
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">
                  اسم البوليصة / العقد *
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
                  placeholder="مثال: عقد موظفي الشركة 2025"
                  value={newPolicy.name}
                  onChange={(e) =>
                    setNewPolicy({ ...newPolicy, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  رقم البوليصة
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
                  value={newPolicy.policyNumber}
                  onChange={(e) =>
                    setNewPolicy({ ...newPolicy, policyNumber: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  الخطة المرتبطة (Plan)
                </label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
                  value={newPolicy.planId}
                  onChange={(e) =>
                    setNewPolicy({ ...newPolicy, planId: e.target.value })
                  }
                >
                  <option value="">-- بدون خطة (تغطية عامة) --</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-slate-400 mb-1">
                    تاريخ البدء
                  </label>
                  <DatePicker
                    date={newPolicy.startDate ? new Date(newPolicy.startDate) : undefined}
                    onChange={(d) =>
                      setNewPolicy({ ...newPolicy, startDate: d ? d.toISOString().slice(0, 10) : "" })
                    }
                    className="w-full bg-slate-900 border-slate-700 h-9 px-2"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-slate-400 mb-1">
                    تاريخ الانتهاء
                  </label>
                  <DatePicker
                    date={newPolicy.endDate ? new Date(newPolicy.endDate) : undefined}
                    onChange={(d) =>
                      setNewPolicy({ ...newPolicy, endDate: d ? d.toISOString().slice(0, 10) : "" })
                    }
                    className="w-full bg-slate-900 border-slate-700 h-9 px-2"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPolicyModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300 text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreatePolicy}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
              >
                حفظ البوليصة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// // src/pages/insurance/InsuranceProviderDetailsPage.tsx

// import { useEffect, useState } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import { apiClient } from "../api/apiClient";
// import { toast } from "sonner";
// import type { InsurancePlan } from "../types/insurance";

// export default function InsuranceProviderDetailsPage() {
//   const { id } = useParams<{ id: string }>();
//   const navigate = useNavigate();
//   const providerId = Number(id);

//   const [plans, setPlans] = useState<InsurancePlan[]>([]);
//   const [providerName, setProviderName] = useState("");
//   const [loading, setLoading] = useState(false);

//   // Form for new Plan
//   const [showModal, setShowModal] = useState(false);
//   const [newPlan, setNewPlan] = useState({
//     name: "",
//     defaultCopayRate: "0",
//     maxCopayAmount: "",
//   });

//   const loadData = async () => {
//     setLoading(true);
//     try {
//       // نفترض أن هذا الـ Endpoint يعيد الشركة مع الخطط
//       // أو يمكنك جلب الخطط بشكل منفصل إذا لم تكن مضمنة
//       // هنا سنستخدم الـ endpoint العام للشركات ونفلتر (مؤقتاً) أو الأفضل عمل endpoint getOne
//       // للتبسيط، سنفترض أن القائمة العامة تعيد البيانات المطلوبة
//       const res = await apiClient.get<any[]>("/insurance/providers");
//       const provider = res.data.find((p) => p.id === providerId);
//       if (provider) {
//         setProviderName(provider.name);
//         setPlans(provider.plans || []);
//       }
//     } catch (err) {
//       toast.error("فشل تحميل البيانات");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     if (providerId) loadData();
//   }, [providerId]);

//   const handleCreatePlan = async () => {
//     if (!newPlan.name) return;
//     try {
//       await apiClient.post(`/insurance/providers/${providerId}/plans`, {
//         name: newPlan.name,
//         defaultCopayRate: Number(newPlan.defaultCopayRate),
//         maxCopayAmount: newPlan.maxCopayAmount
//           ? Number(newPlan.maxCopayAmount)
//           : null,
//       });
//       toast.success("تم إنشاء الخطة");
//       setShowModal(false);
//       loadData();
//     } catch (err) {
//       toast.error("فشل الإنشاء");
//     }
//   };

//   return (
//     <div
//       className="p-6 text-slate-100 h-full flex flex-col space-y-6"
//       dir="rtl"
//     >
//       <div className="flex justify-between items-center">
//         <div>
//           <button
//             onClick={() => navigate("/insurance/providers")}
//             className="text-xs text-slate-400 hover:text-white mb-1"
//           >
//             ➜ العودة لقائمة الشركات
//           </button>
//           <h1 className="text-2xl font-bold">إدارة: {providerName}</h1>
//           <p className="text-sm text-slate-400">
//             الخطط التأمينية (Plans) وقواعد التغطية.
//           </p>
//         </div>
//         <button
//           onClick={() => setShowModal(true)}
//           className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-sm font-bold shadow-lg"
//         >
//           + خطة جديدة
//         </button>
//       </div>

//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//         {plans.map((plan) => (
//           <div
//             key={plan.id}
//             className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-sky-500/50 transition group"
//           >
//             <div className="flex justify-between items-start mb-2">
//               <h3 className="font-bold text-lg text-white">{plan.name}</h3>
//               <span className="bg-emerald-900/30 text-emerald-300 text-[10px] px-2 py-0.5 rounded">
//                 نشط
//               </span>
//             </div>

//             <div className="text-sm text-slate-400 space-y-1 mb-4">
//               <div>
//                 التحمل الافتراضي:{" "}
//                 <span className="text-slate-200">
//                   {(plan.defaultCopayRate * 100).toFixed(0)}%
//                 </span>
//               </div>
//               <div>
//                 الحد الأقصى للتحمل:{" "}
//                 <span className="text-slate-200">
//                   {plan.maxCopayAmount
//                     ? `${plan.maxCopayAmount} د.ل`
//                     : "غير محدد"}
//                 </span>
//               </div>
//             </div>

//             <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
//               <span className="text-xs text-slate-500">
//                 {plan._count?.rules ?? 0} قاعدة مسجلة
//               </span>
//               <button
//                 onClick={() => navigate(`/insurance/plans/${plan.id}`)}
//                 className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg text-xs transition"
//               >
//                 إدارة القواعد ⚙️
//               </button>
//             </div>
//           </div>
//         ))}
//       </div>

//       {/* Modal */}
//       {showModal && (
//         <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
//           <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
//             <h3 className="text-lg font-bold">إضافة خطة تأمين جديدة</h3>
//             <div className="space-y-3 text-xs">
//               <div>
//                 <label className="block text-slate-400 mb-1">اسم الخطة</label>
//                 <input
//                   className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
//                   placeholder="مثال: الفئة الذهبية (Gold)"
//                   value={newPlan.name}
//                   onChange={(e) =>
//                     setNewPlan({ ...newPlan, name: e.target.value })
//                   }
//                 />
//               </div>
//               <div>
//                 <label className="block text-slate-400 mb-1">
//                   نسبة التحمل الافتراضية (0.0 - 1.0)
//                 </label>
//                 <div className="flex gap-2 items-center">
//                   <input
//                     type="number"
//                     step="0.01"
//                     max="1"
//                     className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
//                     value={newPlan.defaultCopayRate}
//                     onChange={(e) =>
//                       setNewPlan({
//                         ...newPlan,
//                         defaultCopayRate: e.target.value,
//                       })
//                     }
//                   />
//                   <span className="text-slate-500">
//                     {(Number(newPlan.defaultCopayRate) * 100).toFixed(0)}%
//                   </span>
//                 </div>
//               </div>
//               <div>
//                 <label className="block text-slate-400 mb-1">
//                   سقف التحمل (اختياري)
//                 </label>
//                 <input
//                   type="number"
//                   className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
//                   placeholder="مثال: 50 د.ل"
//                   value={newPlan.maxCopayAmount}
//                   onChange={(e) =>
//                     setNewPlan({ ...newPlan, maxCopayAmount: e.target.value })
//                   }
//                 />
//               </div>
//             </div>
//             <div className="flex justify-end gap-2 pt-2">
//               <button
//                 onClick={() => setShowModal(false)}
//                 className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300 text-sm"
//               >
//                 إلغاء
//               </button>
//               <button
//                 onClick={handleCreatePlan}
//                 className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold"
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
