import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clinicalServices } from "../../../api/clinicalServices";
import { toast } from "sonner";
import { Calendar, Plus, X, Server, Clock, Search, MapPin, RefreshCw, XCircle } from "lucide-react";
import { useAuthStore } from "../../../stores/authStore";
import { Link } from "react-router-dom";

export default function ResourceSchedulerPage() {
  const { user } = useAuthStore();
  const hospitalId = user?.hospitalId || 1; // Fallback to 1
  const queryClient = useQueryClient();

  const [activeResource, setActiveResource] = useState<number | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  
  // Booking Form State
  const [patientId, setPatientId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");

  const { data: resources = [], isLoading: loadingResources } = useQuery({
    queryKey: ["resources", hospitalId],
    queryFn: () => clinicalServices.getResources(hospitalId),
  });

  // Calculate dates (e.g., today to +7 days)
  const fromDate = new Date();
  const toDate = new Date();
  toDate.setDate(toDate.getDate() + 7);

  const { data: bookings = [], isLoading: loadingBookings, refetch: refetchBookings } = useQuery({
    queryKey: ["resource-bookings", activeResource],
    queryFn: () => clinicalServices.getResourceBookings(activeResource!, fromDate.toISOString(), toDate.toISOString()),
    enabled: !!activeResource,
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      await clinicalServices.createBooking({
        resourceId: activeResource,
        patientId: Number(patientId),
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        notes,
      });
    },
    onSuccess: () => {
      toast.success("تم حجز المورد بنجاح.");
      setShowBookingModal(false);
      refetchBookings();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || "تعارض في الحجز أو فشل العملية"),
  });

  const cancelMutation = useMutation({
    mutationFn: (bookingId: number) => clinicalServices.cancelBooking(bookingId),
    onSuccess: () => {
      toast.success("تم إلغاء الحجز.");
      refetchBookings();
    },
    onError: () => toast.error("فشل الإلغاء."),
  });

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Server className="w-6 h-6" />
            </div>
            جدولة الموارد المتقدمة (ORs, MRI, الخ)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            إدارة وحجز غرف العمليات والمعدات الثقيلة مع منع التعارض (Conflict Prevention)
          </p>
        </div>
        <div className="relative z-10 flex gap-2">
           <Link
             to="/clinical/waitlist"
             className="bg-amber-600/20 text-amber-400 border border-amber-500/30 hover:bg-amber-600/40 px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 shadow-lg"
           >
             <Clock className="w-4 h-4" /> قوائم الانتظار
           </Link>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden">
        {/* Left Side: Resources List */}
        <div className="w-full lg:w-1/3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-200">الموارد المتاحة</h3>
          </div>
          
          <div className="relative mb-4">
            <Search className="w-4 h-4 absolute right-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="ابحث عن مورد..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 pr-9 pl-3 text-sm focus:border-indigo-500 outline-none"
            />
          </div>

          <div className="space-y-3">
            {loadingResources ? (
              <p className="text-center text-slate-500 py-4">جاري التحميل...</p>
            ) : (
              resources.map((res: any) => (
                <button
                  key={res.id}
                  onClick={() => setActiveResource(res.id)}
                  className={`w-full text-right p-4 rounded-xl border transition-all ${
                    activeResource === res.id
                      ? "bg-indigo-600/20 border-indigo-500 shadow-[0_0_15px_-3px_rgba(99,102,241,0.3)]"
                      : "bg-slate-950 border-slate-800 hover:border-slate-600"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-slate-200">{res.name}</div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                      {res.type}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-2 flex gap-3">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {res.location || "غير محدد"}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Calendar/Bookings */}
        <div className="w-full lg:w-2/3 bg-slate-900/40 border border-slate-800 rounded-2xl p-5 overflow-y-auto custom-scrollbar relative">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" /> 
              الحجوزات القادمة {activeResource ? `(7 أيام)` : ""}
            </h2>
            {activeResource && (
              <button
                onClick={() => setShowBookingModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> حجز المورد
              </button>
            )}
          </div>

          {!activeResource ? (
            <div className="flex flex-col items-center justify-center py-32 text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
              <Server className="w-16 h-16 mb-4 opacity-30" />
              <p>يرجى تحديد مورد من القائمة لعرض جدول حجوزاته.</p>
            </div>
          ) : loadingBookings ? (
            <div className="flex justify-center py-20 text-slate-400">جاري تحميل الحجوزات...</div>
          ) : bookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-900/30 rounded-xl border border-slate-800">
              <Calendar className="w-12 h-12 text-slate-600 mb-4 opacity-50" />
              <p>لا توجد حجوزات قادمة لهذا المورد.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {bookings.map((booking: any) => (
                <div key={booking.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex justify-between items-center hover:border-indigo-500/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-12 bg-indigo-500 rounded-full"></div>
                    <div>
                      <div className="font-bold text-slate-200">المريض #{booking.patientId}</div>
                      <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                        <Clock className="w-3 h-3" /> 
                        {new Date(booking.startTime).toLocaleString("ar-LY")} - {new Date(booking.endTime).toLocaleTimeString("ar-LY")}
                      </div>
                      {booking.notes && <div className="text-xs text-slate-500 mt-1">{booking.notes}</div>}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-bold px-3 py-1 bg-emerald-900/30 text-emerald-400 rounded-full border border-emerald-500/20">
                      {booking.status}
                    </span>
                    <button
                      onClick={() => {
                        if(confirm("هل تريد إلغاء هذا الحجز؟")) cancelMutation.mutate(booking.id);
                      }}
                      className="mr-3 text-rose-500 hover:text-rose-400 p-1"
                      title="إلغاء الحجز"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Booking Modal */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_0_40px_-10px_rgba(99,102,241,0.3)]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-lg font-bold text-indigo-400">حجز مورد جديد</h3>
              <button onClick={() => setShowBookingModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">رقم المريض (Patient ID)</label>
                <input
                  type="number"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-indigo-500 outline-none"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">وقت البداية</label>
                <input
                  type="datetime-local"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-indigo-500 outline-none"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">وقت النهاية</label>
                <input
                  type="datetime-local"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-indigo-500 outline-none"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">ملاحظات طبية</label>
                <textarea
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-indigo-500 outline-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                ></textarea>
              </div>
            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={() => setShowBookingModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={() => bookMutation.mutate()}
                disabled={!patientId || !startTime || !endTime || bookMutation.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-sm shadow-lg transition-colors disabled:opacity-50"
              >
                تأكيد الحجز
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
