import { useState, useRef } from "react";
import { toast } from "sonner";
import { apiClient } from "../../../api/apiClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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
      queryClient.invalidateQueries({ queryKey: ["consentForms", patientId] });
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
      queryClient.invalidateQueries({ queryKey: ["consentForms", patientId] });
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
