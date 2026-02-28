import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../api/apiClient";
import { ConsentFormDialog } from "../../../components/clinical/consent-forms/ConsentFormDialog";
import { useAuthStore } from "../../../stores/authStore";
import { toast } from "sonner";

export function ConsentFormsPage() {
  const { id: patientId } = useParams(); // Patient ID
  const { user } = useAuthStore();
  const hospitalId = user?.hospitalId;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);

  // Fetch Consents
  const { data: consentForms = [], isLoading } = useQuery({
    queryKey: ["consentForms", patientId],
    queryFn: async () => {
      const res = await apiClient.get(`/consent-forms/patient/${patientId}/${hospitalId}`);
      return res.data;
    },
    enabled: !!patientId && !!hospitalId,
  });

  // Revoke Mutation
  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.put(`/consent-forms/${id}/revoke`);
    },
    onSuccess: () => {
      toast.success("تم إلغاء النموذج بنجاح");
      queryClient.invalidateQueries({ queryKey: ["consentForms", patientId] });
    },
    onError: () => toast.error("حدث خطأ أثناء الإلغاء"),
  });

  const handleOpenDialog = (form?: any) => {
    setSelectedForm(form || null);
    setDialogOpen(true);
  };

  const handleRevoke = (formId: number) => {
    if (confirm("هل أنت متأكد من إلغاء هذه الموافقة/التفويض؟")) {
      revokeMutation.mutate(formId);
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            نماذج الموافقة الإلكترونية
          </h1>
          <p className="text-sm text-slate-400">
            إدارة التفويضات والموافقات الطبية للمريض للعمليات والإجراءات التخديرية
          </p>
        </div>
        <button
          onClick={() => handleOpenDialog()}
          className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl text-sm font-bold shadow-lg shadow-sky-900/20 transition-all active:scale-95"
        >
          + إنشاء نموذج جديد
        </button>
      </div>

      {/* Main Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        <div className="overflow-x-auto custom-scrollbar flex-1">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950/50 text-slate-500 sticky top-0 backdrop-blur z-10">
              <tr className="text-[11px] uppercase tracking-widest border-b border-slate-800">
                <th className="px-6 py-4 font-bold">الرقم</th>
                <th className="px-6 py-4 font-bold">النوع</th>
                <th className="px-6 py-4 font-bold min-w-[200px]">العنوان</th>
                <th className="px-6 py-4 font-bold">الطبيب المسئول</th>
                <th className="px-6 py-4 font-bold text-center">تاريخ الإنشاء</th>
                <th className="px-6 py-4 font-bold text-center">الحالة</th>
                <th className="px-6 py-4 font-bold text-center">تاريخ التوقيع</th>
                <th className="px-6 py-4 font-bold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10">جارِ التحميل...</td>
                </tr>
              ) : consentForms.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-500 text-lg">
                    لا توجد نماذج سابقة للمريض
                  </td>
                </tr>
              ) : (
                consentForms.map((form: any) => (
                  <tr key={form.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-400">#{form.id}</td>
                    <td className="px-6 py-4 font-bold text-xs">
                      {form.formType === "SURGERY" ? "عملية جراحية" : form.formType === "ANESTHESIA" ? "تخدير" : "عام"}
                    </td>
                    <td className="px-6 py-4 text-sky-400 font-bold">{form.title}</td>
                    <td className="px-6 py-4">{form.doctor?.fullName || "—"}</td>
                    <td className="px-6 py-4 text-center text-slate-400 font-mono text-xs">
                      {new Date(form.createdAt).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                        form.status === "SIGNED" ? "bg-emerald-900/40 text-emerald-400" :
                        form.status === "DRAFT" ? "bg-amber-900/40 text-amber-400" :
                        "bg-rose-900/40 text-rose-400"
                      }`}>
                        {form.status === "SIGNED" ? "موقع" : form.status === "DRAFT" ? "بانتظار التوقيع" : "ملغى"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-slate-400 font-mono text-xs">
                      {form.signedAt ? new Date(form.signedAt).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center items-center gap-2">
                        {form.status === "DRAFT" && (
                          <button
                            onClick={() => handleOpenDialog(form)}
                            className="p-1 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all text-xs font-bold"
                          >
                            توقيع ✍️
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenDialog(form)}
                          className="p-1.5 bg-slate-800 hover:bg-sky-900/40 text-sky-400 rounded-lg transition-all border border-slate-700"
                          title="عرض التفاصيل"
                        >
                          👁️
                        </button>
                        {form.status !== "REVOKED" && (
                          <button
                            onClick={() => handleRevoke(form.id)}
                            className="p-1.5 hover:bg-rose-900/30 text-slate-500 hover:text-rose-400 rounded-lg transition-all border hover:border-rose-900/50"
                            title="إلغاء النموذج"
                          >
                            🚫
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {dialogOpen && (
        <ConsentFormDialog
          isOpen={dialogOpen}
          onClose={() => setDialogOpen(false)}
          patientId={Number(patientId)}
          hospitalId={hospitalId ?? 0}
          doctorId={user?.id}
          existingForm={selectedForm}
        />
      )}
    </div>
  );
}
