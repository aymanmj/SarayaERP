import { useState, useRef } from "react";
import { toast } from "sonner";
import { apiClient } from "../../../api/apiClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLicenseStore } from "../../../stores/licenseStore";

interface ConsentFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: number;
  hospitalId: number;
  encounterId?: number;
  doctorId?: number; // the current logged in user (doctor)
  existingForm?: any; // If we are opening a pending form to sign it
}

export function ConsentFormDialog({
  isOpen,
  onClose,
  patientId,
  hospitalId,
  encounterId,
  doctorId,
  existingForm,
}: ConsentFormDialogProps) {
  const queryClient = useQueryClient();
  const { details: licenseDetails } = useLicenseStore();
  const hospitalName = licenseDetails?.hospitalName;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signedByRef, setSignedByRef] = useState("المريض نفسه");
  const [formType, setFormType] = useState<string>(existingForm?.formType || "GENERAL");
  const [title, setTitle] = useState(existingForm?.title || "");
  const [content, setContent] = useState(
    existingForm?.content || "أقر أنا الموقع أدناه بموافقتي الكاملة على الإجراء الطبي..."
  );

  const isSignMode = !!existingForm && existingForm.status === "DRAFT";
  const isViewMode = !!existingForm && existingForm.status !== "DRAFT";

  // --- Draw Handlers ---
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isViewMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || isViewMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const endDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    if (isViewMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // --- API Mutations ---
  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        hospitalId,
        patientId,
        encounterId,
        doctorId,
        formType,
        title,
        content,
      };
      await apiClient.post("/consent-forms", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consentForms", String(patientId)] });
      toast.success("تم تدوين النموذج بنجاح");
      onClose();
    },
    onError: () => toast.error("حدث خطأ أثناء حفظ النموذج"),
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!existingForm) return;
      
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas not found");
      const signature = canvas.toDataURL("image/png"); // base64

      const payload = {
        signature,
        signedByRef,
      };

      await apiClient.put(`/consent-forms/${existingForm.id}/sign`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consentForms", String(patientId)] });
      toast.success("تم توقيع النموذج وحفظه");
      onClose();
    },
    onError: () => toast.error("حدث خطأ أثناء التوقيع"),
  });

  const handleSubmit = () => {
    if (!existingForm) {
      if (!title) return toast.error("الرجاء إدخال عنوان للنموذج");
      createMutation.mutate();
    } else if (isSignMode) {
      signMutation.mutate();
    }
  };

  // --- Print ---
  const handlePrint = () => {
    const formData = existingForm || { formType, title, content, status: "DRAFT", signedAt: null, signature: null, signedByRef: null };
    const typeLabel = formData.formType === "SURGERY" ? "عملية جراحية" : formData.formType === "ANESTHESIA" ? "تخدير" : formData.formType === "PROCEDURE" ? "إجراء طبي" : "موافقة عامة";
    const statusLabel = formData.status === "SIGNED" ? "موقّع" : formData.status === "REVOKED" ? "ملغى" : "مسودة - بانتظار التوقيع";
    const createdDate = formData.createdAt ? new Date(formData.createdAt).toLocaleDateString("ar-LY", { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString("ar-LY", { year: "numeric", month: "long", day: "numeric" });
    const signedDate = formData.signedAt ? new Date(formData.signedAt).toLocaleDateString("ar-LY", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

    const printWindow = window.open("", "_blank", "width=800,height=1000");
    if (!printWindow) { toast.error("الرجاء السماح بالنوافذ المنبثقة للطباعة"); return; }

    printWindow.document.write(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>نموذج موافقة - ${formData.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cairo', sans-serif; direction: rtl; color: #1a1a2e; padding: 30px 40px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 3px double #1a1a2e; padding-bottom: 16px; margin-bottom: 20px; }
    .header h1 { font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
    .header .subtitle { font-size: 13px; color: #475569; }
    .form-type-badge { display: inline-block; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 3px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-top: 10px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; }
    .info-item { font-size: 13px; }
    .info-item .label { color: #64748b; font-weight: 600; }
    .info-item .value { color: #0f172a; font-weight: 700; }
    .consent-text { border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px; line-height: 2; font-size: 14px; background: #fff; min-height: 120px; white-space: pre-wrap; }
    .consent-text-title { font-size: 15px; font-weight: 700; margin-bottom: 10px; color: #334155; }
    .signature-section { border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin-bottom: 20px; }
    .signature-section h3 { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: #334155; }
    .signature-box { border: 2px dashed #94a3b8; border-radius: 8px; min-height: 100px; display: flex; align-items: center; justify-content: center; background: #fafafa; }
    .signature-box img { max-width: 300px; max-height: 120px; }
    .signature-box .placeholder { color: #94a3b8; font-size: 13px; }
    .signature-meta { display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px; color: #64748b; }
    .footer { text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 20px; font-size: 11px; color: #94a3b8; }
    .status-badge { display: inline-block; padding: 2px 12px; border-radius: 12px; font-size: 11px; font-weight: 700; }
    .status-signed { background: #d1fae5; color: #065f46; }
    .status-draft { background: #fef3c7; color: #92400e; }
    .status-revoked { background: #fee2e2; color: #991b1b; }
    @media print { body { padding: 10px 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <img src="/sarayalogo.png" alt="" style="width:60px;height:60px;border-radius:10px;margin:0 auto 8px;display:block;object-fit:contain;" />
    <h1>${hospitalName || "المستشفى"}</h1>
    <div class="subtitle">نموذج موافقة / تفويض طبي</div>
    <div class="form-type-badge">${typeLabel}</div>
  </div>

  <div class="info-grid">
    <div class="info-item"><span class="label">عنوان النموذج: </span><span class="value">${formData.title}</span></div>
    <div class="info-item"><span class="label">رقم النموذج: </span><span class="value">#${formData.id || "جديد"}</span></div>
    <div class="info-item"><span class="label">تاريخ الإنشاء: </span><span class="value">${createdDate}</span></div>
    <div class="info-item"><span class="label">الحالة: </span><span class="status-badge ${formData.status === "SIGNED" ? "status-signed" : formData.status === "REVOKED" ? "status-revoked" : "status-draft"}">${statusLabel}</span></div>
    ${formData.doctor?.fullName ? `<div class="info-item"><span class="label">الطبيب المسئول: </span><span class="value">${formData.doctor.fullName}</span></div>` : ""}
  </div>

  <div class="consent-text-title">📝 نص الموافقة / التفويض:</div>
  <div class="consent-text">${formData.content}</div>

  <div class="signature-section">
    <h3>✉️ التوقيع:</h3>
    <div class="signature-box">
      ${formData.signature ? `<img src="${formData.signature}" alt="توقيع" />` : `<span class="placeholder">مساحة التوقيع</span>`}
    </div>
    <div class="signature-meta">
      <span>صاحب التوقيع: ${formData.signedByRef || "________________"}</span>
      <span>تاريخ التوقيع: ${signedDate || "____/____/________"}</span>
    </div>
  </div>

  <div class="footer">
    تم إنشاء هذا النموذج إلكترونياً بواسطة نظام السرايا الطبي &bull; ${new Date().toLocaleDateString("ar-LY")}
  </div>
</body>
</html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 400);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" dir="rtl">
      <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center text-slate-100">
          <h2 className="text-xl font-bold">
            {isViewMode ? "عرض التفويض الطبي" : isSignMode ? "توقيع التفويض الطبي" : "إنشاء تفويض طبي جديد"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">✖</button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-300">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-slate-400 text-xs font-bold">نوع النموذج</label>
              <select
                disabled={!!existingForm}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white disabled:opacity-50 outline-none"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                <option value="GENERAL">موافقة عامة</option>
                <option value="SURGERY">عملية جراحية</option>
                <option value="ANESTHESIA">تخدير</option>
                <option value="PROCEDURE">إجراء طبي</option>
                <option value="OTHER">أخرى</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 text-xs font-bold">العنوان / الإجراء</label>
              <input
                disabled={!!existingForm}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white disabled:opacity-50 outline-none"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: عملية استئصال الزائدة"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 text-xs font-bold">نص الموافقة</label>
            <textarea
              disabled={!!existingForm}
              rows={5}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white disabled:opacity-50 outline-none resize-none"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          {(isSignMode || isViewMode) && (
            <div className="border border-slate-700 p-5 rounded-xl bg-slate-900/50 space-y-4">
              <div className="flex items-center gap-4">
                <label className="text-slate-400 font-bold">صاحب التوقيع:</label>
                <input
                  disabled={isViewMode}
                  className="bg-slate-800 border-none rounded px-3 py-1 text-white disabled:opacity-50"
                  value={isViewMode ? existingForm.signedByRef : signedByRef}
                  onChange={(e) => setSignedByRef(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-2">توقيع المريض / الوصي:</label>
                {isViewMode && existingForm.signature ? (
                  <img src={existingForm.signature} alt="Signature" className="max-w-xs bg-white rounded border border-slate-700 p-2" />
                ) : isViewMode ? (
                  <div className="text-rose-400 italic">لا يوجد توقيع</div>
                ) : (
                  <div className="space-y-2">
                    <canvas
                      ref={canvasRef}
                      width={500}
                      height={200}
                      className="border-2 border-dashed border-sky-800 bg-slate-100 rounded-xl cursor-crosshair max-w-full touch-none"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={endDrawing}
                      onMouseLeave={endDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={endDrawing}
                    ></canvas>
                    <button
                      onClick={clearCanvas}
                      className="text-xs text-rose-400 hover:text-rose-300 underline"
                    >
                      مسح التوقيع
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-900 border-t border-slate-800 p-4 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={handlePrint}
            className="px-5 py-2 rounded-xl text-slate-300 font-bold hover:bg-slate-800 transition border border-slate-700"
            title="طباعة النموذج"
          >
            🖨️ طباعة
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-slate-300 font-bold hover:bg-slate-800 transition"
          >
            إغلاق
          </button>
          {!isViewMode && (
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || signMutation.isPending}
              className="px-6 py-2 rounded-xl text-white font-bold bg-sky-600 hover:bg-sky-500 transition shadow-lg disabled:opacity-50"
            >
              {createMutation.isPending || signMutation.isPending ? "جاري الحفظ..." : existingForm ? "اعتماد التوقيع" : "حفظ كمسودة للتوقيع"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
