// src/pages/insurance/PlanRulesPage.tsx

import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import type { InsurancePlan, CoverageRule } from "../types/insurance";

type ServiceCategory = { id: number; name: string };
type ServiceItem = {
  id: number;
  name: string;
  code: string;
  category?: { id: number; name: string };
};

export default function PlanRulesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const planId = Number(id);

  const [plan, setPlan] = useState<
    (InsurancePlan & { rules: CoverageRule[] }) | null
  >(null);

  // Data for Dropdowns
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [form, setForm] = useState({
    targetType: "CATEGORY" as "CATEGORY" | "SERVICE",
    targetId: "", // سيخزن ID الفئة أو الخدمة
    ruleType: "INCLUSION", // INCLUSION / EXCLUSION
    copayType: "PERCENTAGE", // PERCENTAGE / FIXED_AMOUNT
    copayValue: "0",
    requiresApproval: false,
  });

  // Search State inside Modal
  const [searchService, setSearchService] = useState("");

  const loadPlan = async () => {
    try {
      const res = await apiClient.get(`/insurance/plans/${planId}`);
      setPlan(res.data);
    } catch (err) {
      toast.error("فشل تحميل بيانات الخطة");
    }
  };

  // تحميل الخدمات والفئات مرة واحدة
  const loadResources = async () => {
    setLoadingResources(true);
    try {
      // ✅ التعديل: جلب الفئات والخدمات بشكل متوازي ومستقل
      const [catRes, srvRes] = await Promise.all([
        apiClient.get<ServiceCategory[]>("/services/categories"), // الرابط الجديد
        apiClient.get<ServiceItem[]>("/services"),
      ]);

      setCategories(catRes.data);
      setServices(srvRes.data);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل قائمة الخدمات والفئات.");
    } finally {
      setLoadingResources(false);
    }
  };

  //   const loadResources = async () => {
  //     setLoadingResources(true);
  //     try {
  //       // 1. جلب الخدمات
  //       const srvRes = await apiClient.get<ServiceItem[]>("/services");
  //       setServices(srvRes.data);

  //       // 2. استخراج الفئات الفريدة من الخدمات (أو جلبها من endpoint مخصص لو وجد)
  //       // هنا سنقوم باستخراجها يدوياً من قائمة الخدمات لضمان التوافق
  //       const catsMap = new Map<number, string>();
  //       srvRes.data.forEach((s) => {
  //         if (s.category) {
  //           catsMap.set(s.category.id, s.category.name);
  //         }
  //       });

  //       const uniqueCats: ServiceCategory[] = Array.from(catsMap.entries()).map(
  //         ([id, name]) => ({ id, name }),
  //       );
  //       setCategories(uniqueCats);
  //     } catch (err) {
  //       console.error(err);
  //       toast.error("فشل تحميل قائمة الخدمات والفئات.");
  //     } finally {
  //       setLoadingResources(false);
  //     }
  //   };

  useEffect(() => {
    if (planId) {
      loadPlan();
      loadResources();
    }
  }, [planId]);

  const handleAddRule = async () => {
    if (!form.targetId) {
      toast.warning("يجب اختيار الفئة أو الخدمة المستهدفة.");
      return;
    }

    const payload: any = {
      ruleType: form.ruleType,
      copayType: form.copayType,
      copayValue:
        form.copayType === "PERCENTAGE"
          ? Number(form.copayValue) / 100
          : Number(form.copayValue),
      requiresApproval: form.requiresApproval,
    };

    if (form.targetType === "CATEGORY") {
      payload.serviceCategoryId = Number(form.targetId);
    } else {
      payload.serviceItemId = Number(form.targetId);
    }

    try {
      await apiClient.post(`/insurance/plans/${planId}/rules`, payload);
      toast.success("تم إضافة القاعدة بنجاح");
      setShowModal(false);
      // Reset Form
      setForm({
        targetType: "CATEGORY",
        targetId: "",
        ruleType: "INCLUSION",
        copayType: "PERCENTAGE",
        copayValue: "0",
        requiresApproval: false,
      });
      setSearchService("");
      loadPlan();
    } catch (err) {
      toast.error("فشل إضافة القاعدة");
    }
  };

  // تصفية الخدمات داخل المودال
  const filteredServices = useMemo(() => {
    if (!searchService) return services.slice(0, 20); // عرض أول 20 فقط
    return services
      .filter(
        (s) =>
          s.name.toLowerCase().includes(searchService.toLowerCase()) ||
          s.code?.toLowerCase().includes(searchService.toLowerCase()),
      )
      .slice(0, 20);
  }, [services, searchService]);

  if (!plan) return <div className="p-6 text-slate-400">جارِ التحميل...</div>;

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-slate-400 hover:text-white mb-1"
          >
            ➜ العودة
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>قواعد التغطية:</span>
            <span className="text-sky-400">{plan.name}</span>
          </h1>
          <p className="text-sm text-slate-400">
            تخصيص نسب التحمل والاستثناءات لهذه الخطة التأمينية.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold shadow-lg"
        >
          + إضافة قاعدة جديدة
        </button>
      </div>

      {/* Rules Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex-1">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">الهدف (النطاق)</th>
              <th className="px-4 py-3">نوع التغطية</th>
              <th className="px-4 py-3">قيمة التحمل (Copay)</th>
              <th className="px-4 py-3">موافقة مسبقة؟</th>
              <th className="px-4 py-3">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {plan.rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-slate-800/40 transition">
                <td className="px-4 py-3">
                  {rule.serviceCategory ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded border border-purple-500/20">
                        فئة كاملة
                      </span>
                      <span className="font-semibold">
                        {rule.serviceCategory.name}
                      </span>
                    </div>
                  ) : rule.serviceItem ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-sky-900/30 text-sky-300 px-2 py-0.5 rounded border border-sky-500/20">
                        خدمة محددة
                      </span>
                      <span>
                        {rule.serviceItem.name}
                        <span className="text-slate-500 text-xs mr-1">
                          ({rule.serviceItem.code})
                        </span>
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400">
                      قاعدة عامة (غير محدد)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {rule.ruleType === "EXCLUSION" ? (
                    <span className="text-rose-400 font-bold bg-rose-950/30 px-2 py-1 rounded">
                      🚫 غير مغطى (استثناء)
                    </span>
                  ) : (
                    <span className="text-emerald-400 bg-emerald-950/30 px-2 py-1 rounded">
                      ✅ مغطى
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {rule.ruleType === "EXCLUSION" ? (
                    "—"
                  ) : rule.copayType === "PERCENTAGE" ? (
                    <span className="font-mono text-amber-300">
                      {Number(rule.copayValue) * 100} %
                    </span>
                  ) : (
                    <span className="font-mono text-amber-300">
                      {Number(rule.copayValue).toFixed(3)} د.ل
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {rule.requiresApproval ? (
                    <span className="text-amber-400 flex items-center gap-1">
                      ⚠️ نعم
                    </span>
                  ) : (
                    <span className="text-slate-500">لا</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button className="text-rose-500 hover:text-rose-400 text-xs opacity-60 hover:opacity-100">
                    حذف
                  </button>
                </td>
              </tr>
            ))}
            {plan.rules.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-slate-500">
                  <div className="text-lg mb-1">لا توجد قواعد مخصصة</div>
                  <div className="text-xs">
                    سيتم تطبيق نسبة التحمل الافتراضية للخطة:
                    <span className="text-emerald-400 font-bold mx-1">
                      {Number(plan.defaultCopayRate) * 100}%
                    </span>
                    على جميع الخدمات.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal - إضافة قاعدة ذكية */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-lg space-y-5 shadow-2xl">
            <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-3">
              إضافة قاعدة تغطية جديدة
            </h3>

            <div className="space-y-4 text-sm">
              {/* 1. تحديد النطاق */}
              <div>
                <label className="block text-slate-400 text-xs mb-1">
                  نطاق تطبيق القاعدة
                </label>
                <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700 mb-2">
                  <button
                    onClick={() =>
                      setForm({ ...form, targetType: "CATEGORY", targetId: "" })
                    }
                    className={`flex-1 py-1.5 text-xs rounded-md transition ${form.targetType === "CATEGORY" ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    فئة خدمات (Category)
                  </button>
                  <button
                    onClick={() =>
                      setForm({ ...form, targetType: "SERVICE", targetId: "" })
                    }
                    className={`flex-1 py-1.5 text-xs rounded-md transition ${form.targetType === "SERVICE" ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
                  >
                    خدمة محددة (Service)
                  </button>
                </div>

                {/* اختيار الفئة أو الخدمة */}
                {form.targetType === "CATEGORY" ? (
                  <select
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
                    value={form.targetId}
                    onChange={(e) =>
                      setForm({ ...form, targetId: e.target.value })
                    }
                  >
                    <option value="">-- اختر الفئة --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    {categories.length === 0 && (
                      <option value="" disabled>
                        لا توجد فئات (يرجى إضافتها من إعدادات الخدمات)
                      </option>
                    )}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="ابحث عن الخدمة بالاسم أو الكود..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
                      value={searchService}
                      onChange={(e) => setSearchService(e.target.value)}
                    />
                    <div className="max-h-32 overflow-y-auto border border-slate-800 rounded-lg bg-slate-900">
                      {filteredServices.map((s) => (
                        <div
                          key={s.id}
                          onClick={() =>
                            setForm({ ...form, targetId: String(s.id) })
                          }
                          className={`px-3 py-2 text-xs cursor-pointer border-b border-slate-800 last:border-0 hover:bg-slate-800 ${form.targetId === String(s.id) ? "bg-sky-900/30 text-sky-300" : "text-slate-300"}`}
                        >
                          <span className="font-bold">{s.name}</span>
                          <span className="text-slate-500 mx-1">
                            ({s.code})
                          </span>
                        </div>
                      ))}
                      {filteredServices.length === 0 && (
                        <div className="p-2 text-center text-xs text-slate-500">
                          لا توجد نتائج
                        </div>
                      )}
                    </div>
                    {form.targetId && (
                      <div className="text-[10px] text-emerald-400">
                        تم اختيار الخدمة ID: {form.targetId}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800 my-2"></div>

              {/* 2. نوع القاعدة */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 text-xs mb-1">
                    نوع التغطية
                  </label>
                  <select
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none"
                    value={form.ruleType}
                    onChange={(e) =>
                      setForm({ ...form, ruleType: e.target.value })
                    }
                  >
                    <option value="INCLUSION">✅ تغطية (مشمول)</option>
                    <option value="EXCLUSION">🚫 استثناء (غير مشمول)</option>
                  </select>
                </div>

                {form.ruleType === "INCLUSION" && (
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">
                      تتطلب موافقة مسبقة؟
                    </label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none"
                      value={form.requiresApproval ? "YES" : "NO"}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          requiresApproval: e.target.value === "YES",
                        })
                      }
                    >
                      <option value="NO">لا</option>
                      <option value="YES">نعم (Pre-Auth)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* 3. التحمل (فقط إذا كانت تغطية) */}
              {form.ruleType === "INCLUSION" && (
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                  <div className="text-xs text-slate-400 mb-2 font-semibold">
                    قيمة التحمل (Co-Pay)
                  </div>
                  <div className="flex gap-2">
                    <div className="w-1/2">
                      <select
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs"
                        value={form.copayType}
                        onChange={(e) =>
                          setForm({ ...form, copayType: e.target.value })
                        }
                      >
                        <option value="PERCENTAGE">نسبة مئوية (%)</option>
                        <option value="FIXED_AMOUNT">مبلغ ثابت (LYD)</option>
                      </select>
                    </div>
                    <div className="w-1/2">
                      <input
                        type="number"
                        step={form.copayType === "PERCENTAGE" ? "1" : "0.001"}
                        min="0"
                        max={form.copayType === "PERCENTAGE" ? "100" : undefined}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-center"
                        placeholder={
                          form.copayType === "PERCENTAGE"
                            ? "مثلاً 20 (تمثل 20%)"
                            : "مثلاً 10.000"
                        }
                        value={form.copayValue}
                        onChange={(e) =>
                          setForm({ ...form, copayValue: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2">
                    {form.copayType === "PERCENTAGE"
                      ? `سيدفع المريض نسبة ${form.copayValue}% من سعر الخدمة.`
                      : `سيدفع المريض مبلغ ثابت ${form.copayValue} دينار.`}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300 text-sm hover:bg-slate-700 transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddRule}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg transition"
              >
                حفظ القاعدة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
