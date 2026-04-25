import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { clinicalServices } from "../../../api/clinicalServices";
import { toast } from "sonner";
import { Clock, Plus, UserPlus, Server, ArrowUpCircle } from "lucide-react";
import { useAuthStore } from "../../../stores/authStore";
import { Link } from "react-router-dom";

export default function WaitlistManager() {
  const { user } = useAuthStore();
  const hospitalId = user?.hospitalId || 1;

  const [showAddModal, setShowAddModal] = useState(false);
  
  // Add Waitlist State
  const [patientId, setPatientId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [notes, setNotes] = useState("");

  const { data: waitlist = [], isLoading, refetch } = useQuery({
    queryKey: ["waitlist", hospitalId],
    queryFn: () => clinicalServices.getWaitlist(hospitalId),
  });

  const { data: resources = [] } = useQuery({
    queryKey: ["resources", hospitalId],
    queryFn: () => clinicalServices.getResources(hospitalId),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      await clinicalServices.joinWaitlist({
        patientId: Number(patientId),
        resourceId: Number(resourceId),
        priority,
        notes,
      });
    },
    onSuccess: () => {
      toast.success("تمت إضافة المريض لقائمة الانتظار.");
      setShowAddModal(false);
      refetch();
    },
    onError: () => toast.error("فشل إضافة المريض לקائمة الانتظار."),
  });

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            قوائم الانتظار الذكية (Smart Waitlist)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            إدارة قوائم الانتظار للموارد وتصعيد المرضى تلقائياً عند الإلغاء
          </p>
        </div>
        <div className="relative z-10 flex gap-2">
           <Link
             to="/clinical/scheduling"
             className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/40 px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 shadow-lg"
           >
             <Server className="w-4 h-4" /> جدولة الموارد
           </Link>
           <button
             onClick={() => setShowAddModal(true)}
             className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg transition-colors flex items-center gap-2"
           >
             <UserPlus className="w-4 h-4" /> إضافة مريض
           </button>
        </div>
      </div>

      <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-2xl p-5 overflow-y-auto custom-scrollbar relative">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
             <div className="w-12 h-12 rounded-full border-4 border-amber-500/30 border-t-amber-500 animate-spin mb-4"></div>
             <p className="animate-pulse">جاري تحميل قوائم الانتظار...</p>
          </div>
        ) : waitlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
            <Clock className="w-16 h-16 text-slate-600 mb-4 opacity-50" />
            <p>قائمة الانتظار فارغة حالياً.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {waitlist.map((entry: any) => (
              <div
                key={entry.id}
                className={`bg-slate-900 border ${
                  entry.status === "NOTIFIED" 
                    ? "border-emerald-500/50 shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)]" 
                    : "border-slate-800"
                } rounded-2xl p-5 relative overflow-hidden`}
              >
                {entry.status === "NOTIFIED" && (
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mx-10 -my-10 pointer-events-none" />
                )}
                
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div>
                    <h3 className="font-bold text-slate-200 text-lg">المريض #{entry.patientId}</h3>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <Server className="w-3 h-3" /> المورد: {entry.resource?.name || "مورد محذوف"}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                      entry.priority === "HIGH" ? "bg-rose-900/30 text-rose-400 border border-rose-500/20" :
                      entry.priority === "URGENT" ? "bg-rose-600 text-white animate-pulse" :
                      "bg-slate-800 text-slate-400"
                    }`}>
                      {entry.priority === "HIGH" ? "عالي الأولوية" : entry.priority === "URGENT" ? "عاجل" : "عادي"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 relative z-10 flex justify-between items-center">
                  <div>
                    <span className={`text-xs font-bold ${
                      entry.status === "WAITING" ? "text-amber-400" :
                      entry.status === "NOTIFIED" ? "text-emerald-400 flex items-center gap-1" :
                      entry.status === "BOOKED" ? "text-sky-400" :
                      "text-slate-500"
                    }`}>
                      {entry.status === "NOTIFIED" && <ArrowUpCircle className="w-4 h-4" />}
                      {entry.status === "WAITING" ? "⏳ قيد الانتظار" :
                       entry.status === "NOTIFIED" ? "تم التبليغ والإشعار" :
                       entry.status === "BOOKED" ? "تم الحجز" : entry.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    انضم: {new Date(entry.joinedAt).toLocaleDateString("ar-LY")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_0_40px_-10px_rgba(245,158,11,0.2)]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-lg font-bold text-amber-400">إضافة مريض لقائمة الانتظار</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">رقم المريض (Patient ID)</label>
                <input
                  type="number"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-amber-500 outline-none"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">المورد المطلوب</label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-amber-500 outline-none"
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                >
                  <option value="">-- اختر المورد --</option>
                  {resources.map((res: any) => (
                    <option key={res.id} value={res.id}>{res.name} ({res.type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">الأولوية</label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-amber-500 outline-none"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="NORMAL">عادي</option>
                  <option value="HIGH">عالي</option>
                  <option value="URGENT">عاجل</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">ملاحظات</label>
                <textarea
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-amber-500 outline-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                ></textarea>
              </div>
            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={() => addMutation.mutate()}
                disabled={!patientId || !resourceId || addMutation.isPending}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-sm shadow-lg transition-colors disabled:opacity-50"
              >
                إضافة للقائمة
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
