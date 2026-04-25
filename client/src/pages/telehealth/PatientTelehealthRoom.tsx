import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "../../api/apiClient";
import { clinicalServices } from "../../api/clinicalServices";
import { toast } from "sonner";
import { Video, Clock, ShieldCheck, Stethoscope } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";

export default function PatientTelehealthRoom() {
  const { id } = useParams();
  const appointmentId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [inWaitingRoom, setInWaitingRoom] = useState(false);
  const [activeRoomUrl, setActiveRoomUrl] = useState<string | null>(null);

  // Poll for room access once in the waiting room
  const { data: accessData, refetch: pollAccess } = useQuery({
    queryKey: ["telehealth-access", appointmentId],
    queryFn: async () => {
      const data = await clinicalServices.getPatientRoomAccess(appointmentId);
      if (data.roomUrl && !activeRoomUrl) {
        setActiveRoomUrl(data.roomUrl);
        toast.success("بدأ الطبيب الجلسة، يمكنك الآن الانضمام.");
      }
      return data;
    },
    enabled: inWaitingRoom && !activeRoomUrl,
    refetchInterval: 3000, // poll every 3 seconds
  });

  const enterWaitingRoomMutation = useMutation({
    mutationFn: async () => {
      await clinicalServices.enterWaitingRoom(appointmentId);
    },
    onSuccess: () => {
      setInWaitingRoom(true);
      toast.success("أنت الآن في غرفة الانتظار الافتراضية.");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "فشل دخول غرفة الانتظار");
    },
  });

  if (activeRoomUrl) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950">
        <div className="bg-slate-900 border-b border-indigo-500/30 p-4 flex justify-between items-center shadow-[0_0_20px_-5px_rgba(99,102,241,0.2)]">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Video className="w-6 h-6 text-indigo-400" /> استشارة طبية عن بعد
          </h1>
          <button
            onClick={() => {
              if (confirm("هل أنت متأكد من الخروج من الجلسة؟")) {
                navigate("/portal"); // Or whatever the patient portal route is
              }
            }}
            className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg transition-colors"
          >
            مغادرة الجلسة
          </button>
        </div>
        <div className="flex-1 bg-black p-2">
          {/* Embed Jitsi Meet */}
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
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden max-w-4xl mx-auto w-full pt-10">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col items-center text-center shadow-lg relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-20 h-20 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]">
          <Video className="w-10 h-10" />
        </div>

        <h1 className="text-3xl font-bold text-white mb-4">العيادة الافتراضية</h1>
        <p className="text-slate-400 max-w-md mb-8">
          مرحباً بك في العيادة الافتراضية. يمكنك الانضمام لغرفة الانتظار وسيتم إدخالك تلقائياً عندما يبدأ الطبيب جلستك.
        </p>

        {!inWaitingRoom ? (
          <button
            onClick={() => enterWaitingRoomMutation.mutate()}
            disabled={enterWaitingRoomMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl text-lg font-bold shadow-lg transition-all flex items-center gap-3 disabled:opacity-50 group"
          >
            <ShieldCheck className="w-6 h-6 group-hover:scale-110 transition-transform" />
            {enterWaitingRoomMutation.isPending ? "جاري الدخول..." : "دخول غرفة الانتظار المأمونة"}
          </button>
        ) : (
          <div className="bg-slate-950 border border-indigo-500/50 p-6 rounded-2xl w-full max-w-md flex flex-col items-center">
            <div className="w-16 h-16 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin mb-6"></div>
            <h3 className="text-xl font-bold text-indigo-400 mb-2">أنت الآن في غرفة الانتظار</h3>
            <p className="text-sm text-slate-300">
              يرجى الانتظار، سيقوم الطبيب بالانضمام للجلسة قريباً. سيتم نقلك تلقائياً فور بدء الاتصال.
            </p>
          </div>
        )}

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-right border-t border-slate-800 pt-8">
          <div className="flex flex-col gap-2">
            <Stethoscope className="w-6 h-6 text-emerald-400" />
            <h4 className="font-bold text-slate-200">استشارة طبية آمنة</h4>
            <p className="text-xs text-slate-500">
              تتم جميع الاتصالات عبر خوادم آمنة ومشفرة تماماً (End-to-End Encryption).
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Clock className="w-6 h-6 text-sky-400" />
            <h4 className="font-bold text-slate-200">في الوقت المحدد</h4>
            <p className="text-xs text-slate-500">
              يُرجى البقاء في هذه الصفحة، ستتغير الشاشة تلقائياً عند بدء الموعد.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Video className="w-6 h-6 text-amber-400" />
            <h4 className="font-bold text-slate-200">تجهيز الكاميرا</h4>
            <p className="text-xs text-slate-500">
              يرجى التأكد من عمل الكاميرا والمايكروفون ومنح الصلاحيات للمتصفح عند الطلب.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
