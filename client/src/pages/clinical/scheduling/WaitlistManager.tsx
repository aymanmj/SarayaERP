import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpCircle,
  Clock,
  Search,
  Server,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { clinicalServices } from "../../../api/clinicalServices";
import { apiClient } from "../../../api/apiClient";
import { useAuthStore } from "../../../stores/authStore";

const PRIORITY_MAP: Record<string, number> = {
  URGENT: 1,
  HIGH: 2,
  NORMAL: 3,
};

export default function WaitlistManager() {
  const { user } = useAuthStore();
  const hospitalId = user?.hospitalId || 1;

  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [foundPatient, setFoundPatient] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
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

  const selectedResource = useMemo(
    () => resources.find((resource: any) => resource.id === Number(resourceId)),
    [resourceId, resources],
  );

  const addMutation = useMutation({
    mutationFn: async () => {
      const noteParts = [
        selectedResource ? `المورد المطلوب: ${selectedResource.name}` : null,
        notes.trim() || null,
      ].filter(Boolean);

      await clinicalServices.joinWaitlist({
        hospitalId,
        patientId: foundPatient.id,
        departmentId: selectedResource?.departmentId || undefined,
        priority: PRIORITY_MAP[priority] ?? 3,
        notes: noteParts.join("\n"),
      });
    },
    onSuccess: () => {
      toast.success("تمت إضافة المريض لقائمة الانتظار.");
      setShowAddModal(false);
      setFoundPatient(null);
      setSearchQuery("");
      setResourceId("");
      setPriority("NORMAL");
      setNotes("");
      refetch();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || "فشل إضافة المريض لقائمة الانتظار."),
  });

  const searchPatient = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await apiClient.get(
        `/patients/search?query=${encodeURIComponent(searchQuery)}`,
      );
      if (res.data.length > 0) {
        setFoundPatient(res.data[0]);
        toast.success("تم العثور على المريض");
      } else {
        toast.error("لم يتم العثور على المريض");
        setFoundPatient(null);
      }
    } catch {
      toast.error("خطأ في البحث");
      setFoundPatient(null);
    } finally {
      setIsSearching(false);
    }
  };

  const statusLabel = (status: string) => {
    if (status === "NOTIFIED") return "تم الإشعار";
    if (status === "BOOKED") return "تم الحجز";
    if (status === "CANCELLED") return "ملغى";
    return "قيد الانتظار";
  };

  const priorityLabel = (value: number) => {
    if (value === 1) return "عاجل";
    if (value === 2) return "عالي";
    return "عادي";
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            قوائم الانتظار الذكية
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            متابعة المرضى بانتظار الموارد السريرية مع ترتيب حسب الأولوية والقسم.
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
            <p className="animate-pulse">جاري تحميل قائمة الانتظار...</p>
          </div>
        ) : waitlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
            <Clock className="w-16 h-16 text-slate-600 mb-4 opacity-50" />
            <p>قائمة الانتظار فارغة حاليًا.</p>
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
                    <h3 className="font-bold text-slate-200 text-lg">
                      {entry.patient?.fullName || `المريض #${entry.patientId}`}
                    </h3>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <Server className="w-3 h-3" />
                      {entry.department?.name || "بدون قسم محدد"}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2 py-1 rounded text-[10px] font-bold ${
                        entry.priority === 1
                          ? "bg-rose-600 text-white animate-pulse"
                          : entry.priority === 2
                            ? "bg-rose-900/30 text-rose-400 border border-rose-500/20"
                            : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {priorityLabel(entry.priority)}
                    </span>
                  </div>
                </div>

                {entry.notes && (
                  <div className="text-xs text-slate-400 bg-slate-950/70 border border-slate-800 rounded-xl p-3 mb-4 whitespace-pre-line">
                    {entry.notes}
                  </div>
                )}

                <div className="mt-4 relative z-10 flex justify-between items-center">
                  <div>
                    <span
                      className={`text-xs font-bold ${
                        entry.status === "WAITING"
                          ? "text-amber-400"
                          : entry.status === "NOTIFIED"
                            ? "text-emerald-400 flex items-center gap-1"
                            : "text-slate-500"
                      }`}
                    >
                      {entry.status === "NOTIFIED" && (
                        <ArrowUpCircle className="w-4 h-4" />
                      )}
                      {statusLabel(entry.status)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    أضيف:{" "}
                    {new Date(entry.requestedDate || entry.createdAt).toLocaleDateString(
                      "ar-LY",
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_0_40px_-10px_rgba(245,158,11,0.2)]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-lg font-bold text-amber-400">إضافة مريض لقائمة الانتظار</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  البحث عن مريض
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-amber-500 outline-none"
                    placeholder="الاسم، رقم الملف، أو الهاتف..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchPatient()}
                  />
                  <button
                    onClick={searchPatient}
                    disabled={isSearching}
                    className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                  >
                    {isSearching ? "بحث..." : "بحث"}
                  </button>
                </div>
                {foundPatient && (
                  <div className="mt-3 bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 text-sm">
                    <div className="font-bold text-white">{foundPatient.fullName}</div>
                    <div className="text-xs text-amber-300 mt-1">
                      MRN: {foundPatient.mrn}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  المورد المطلوب
                </label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-amber-500 outline-none"
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                >
                  <option value="">-- اختر المورد --</option>
                  {resources.map((resource: any) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name} ({resource.type})
                    </option>
                  ))}
                </select>
                {selectedResource?.department?.name && (
                  <div className="text-[11px] text-slate-500 mt-2">
                    سيتم ربط الطلب بالقسم: {selectedResource.department.name}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  الأولوية
                </label>
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
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  ملاحظات
                </label>
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
                disabled={!foundPatient || !resourceId || addMutation.isPending}
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
