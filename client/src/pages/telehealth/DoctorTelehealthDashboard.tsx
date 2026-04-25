import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "../../api/apiClient";
import { clinicalServices } from "../../api/clinicalServices";
import { toast } from "sonner";
import { Video, Clock, CheckCircle2, User, RefreshCw, LogIn } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";

type VirtualAppointment = {
  id: number;
  appointmentDate: string;
  patient: { id: number; fullName: string; gender: string };
  status: string;
  type: string;
};

export default function DoctorTelehealthDashboard() {
  const { user } = useAuthStore();
  const [activeRoomUrl, setActiveRoomUrl] = useState<string | null>(null);

  const { data: appointments = [], isLoading, refetch } = useQuery({
    queryKey: ["doctor-virtual-appointments"],
    queryFn: async () => {
      // Fetching doctor's appointments for today
      // Assuming a generic endpoint, we will filter for VIRTUAL on the frontend if the backend doesn't
      const res = await apiClient.get<VirtualAppointment[]>("/appointments/my-appointments");
      return res.data.filter((app) => app.type === "VIRTUAL");
    },
  });

  const startSessionMutation = useMutation({
    mutationFn: async (appointmentId: number) => {
      // 1. Init (generates JWT and saves room URL in DB if not exists)
      await clinicalServices.initSession(appointmentId);
      // 2. Start (doctor enters, status changes to IN_PROGRESS)
      const data = await clinicalServices.startSession(appointmentId);
      return data.roomUrl;
    },
    onSuccess: (roomUrl) => {
      setActiveRoomUrl(roomUrl);
      toast.success("تم بدء الجلسة الافتراضية بنجاح.");
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "فشل بدء الجلسة الافتراضية");
    },
  });

  if (activeRoomUrl) {
    return (
      <div className="flex flex-col h-full bg-slate-950">
        <div className="bg-slate-900 border-b border-indigo-500/30 p-4 flex justify-between items-center shadow-[0_0_20px_-5px_rgba(99,102,241,0.2)]">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Video className="w-6 h-6 text-indigo-400" /> العيادة الافتراضية (جلسة نشطة)
          </h1>
          <button
            onClick={() => {
              if (confirm("هل أنت متأكد من إنهاء الجلسة والخروج من غرفة الاتصال؟")) {
                setActiveRoomUrl(null);
                refetch();
              }
            }}
            className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg transition-colors"
          >
            إنهاء الجلسة
          </button>
        </div>
        <div className="flex-1 bg-black p-2">
          {/* Embedding Jitsi Meet or similar via iframe */}
          <iframe
            src={activeRoomUrl}
            allow="camera; microphone; fullscreen; display-capture"
            className="w-full h-full rounded-xl border border-slate-800"
            style={{ border: 0 }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mx-20 -my-20 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Video className="w-6 h-6" />
            </div>
            لوحة العيادة الافتراضية (Telehealth)
          </h1>
          <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
            إدارة جلسات التطبيب عن بعد للمرضى
          </p>
        </div>
        <div className="relative z-10">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-bold transition-colors border border-slate-700"
          >
            <RefreshCw className="w-4 h-4" /> تحديث القائمة
          </button>
        </div>
      </div>

      {/* Appointments List */}
      <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-2xl p-5 overflow-y-auto custom-scrollbar relative">
        <h2 className="text-lg font-bold text-slate-200 mb-6 flex items-center gap-2">
          مواعيد اليوم الافتراضية
        </h2>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-12 h-12 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin mb-4"></div>
            <p className="animate-pulse">جاري تحميل المواعيد...</p>
          </div>
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
            <Video className="w-16 h-16 text-slate-600 mb-4 opacity-50" />
            <p>لا توجد مواعيد افتراضية مجدولة لليوم.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {appointments.map((app) => {
              const appDate = new Date(app.appointmentDate);
              const isPast = appDate < new Date();
              return (
                <div
                  key={app.id}
                  className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 transition-all shadow-sm group relative overflow-hidden"
                >
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-lg">
                        {app.patient.fullName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-200 truncate max-w-[150px]">
                          {app.patient.fullName}
                        </h3>
                        <div className="text-xs text-slate-500">
                          {app.patient.gender === "MALE" ? "ذكر" : "أنثى"}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                        {appDate.toLocaleTimeString("ar-LY", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-6 relative z-10">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          app.status === "COMPLETED"
                            ? "bg-emerald-500"
                            : app.status === "IN_PROGRESS"
                            ? "bg-amber-500 animate-pulse"
                            : "bg-slate-500"
                        }`}
                      ></span>
                      <span className="text-xs text-slate-400">
                        {app.status === "COMPLETED"
                          ? "مكتمل"
                          : app.status === "IN_PROGRESS"
                          ? "قيد الاتصال"
                          : "مجدول"}
                      </span>
                    </div>

                    <button
                      onClick={() => startSessionMutation.mutate(app.id)}
                      disabled={startSessionMutation.isPending || app.status === "COMPLETED"}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      {startSessionMutation.isPending ? "جاري البدء..." : <><LogIn className="w-4 h-4" /> بدء الاتصال</>}
                    </button>
                  </div>

                  {/* Decorative background glow on hover */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/0 via-indigo-500/0 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
