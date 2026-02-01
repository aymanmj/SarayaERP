import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

// Types
type ServiceItemLite = { id: number; name: string; defaultPrice: number };
type Bed = { id: number; bedNumber: string; status: string };
type Room = { id: number; roomNumber: string; beds: Bed[] };
type Ward = {
  id: number;
  name: string;
  type: string;
  rooms: Room[];
  serviceItemId?: number; // السعر المرتبط
  serviceItem?: ServiceItemLite;
};

export default function BedManagementSettingsPage() {
  const [wards, setWards] = useState<Ward[]>([]);
  const [services, setServices] = useState<ServiceItemLite[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal States
  const [showWardModal, setShowWardModal] = useState(false);
  const [newWard, setNewWard] = useState({
    name: "",
    type: "General",
    serviceItemId: "",
  });

  const [activeWardId, setActiveWardId] = useState<number | null>(null);
  const [newRoomNumber, setNewRoomNumber] = useState("");

  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [newBedNumber, setNewBedNumber] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [wRes, sRes] = await Promise.all([
        apiClient.get<Ward[]>("/beds/tree"),
        apiClient.get<ServiceItemLite[]>("/beds/services"),
      ]);
      setWards(wRes.data);
      setServices(sRes.data);
    } catch {
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateWard = async () => {
    if (!newWard.name) return;
    try {
      await apiClient.post("/beds/wards", {
        name: newWard.name,
        type: newWard.type,
        gender: "Mixed",
        serviceItemId: newWard.serviceItemId
          ? Number(newWard.serviceItemId)
          : null,
      });
      toast.success("تم إنشاء العنبر");
      setShowWardModal(false);
      loadData();
    } catch {
      toast.error("فشل الإنشاء");
    }
  };

  const handleCreateRoom = async (wardId: number) => {
    if (!newRoomNumber) return;
    try {
      await apiClient.post("/beds/rooms", {
        wardId,
        roomNumber: newRoomNumber,
      });
      toast.success("تمت إضافة الغرفة");
      setNewRoomNumber("");
      setActiveWardId(null);
      loadData();
    } catch {
      toast.error("فشل إضافة الغرفة");
    }
  };

  const handleCreateBed = async (roomId: number) => {
    if (!newBedNumber) return;
    try {
      await apiClient.post("/beds/beds", { roomId, bedNumber: newBedNumber });
      toast.success("تمت إضافة السرير");
      setNewBedNumber("");
      setActiveRoomId(null);
      loadData();
    } catch {
      toast.error("فشل إضافة السرير");
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">
            إعدادات الأقسام الداخلية (Inpatient Setup)
          </h1>
          <p className="text-sm text-slate-400">
            إدارة العنابر، الغرف، الأسرة، وتسعير الإقامة.
          </p>
        </div>
        <button
          onClick={() => setShowWardModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg"
        >
          + إضافة عنبر جديد
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 overflow-y-auto pb-10">
        {wards.map((ward) => (
          <div
            key={ward.id}
            className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4"
          >
            {/* Ward Header */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3">
              <div>
                <h2 className="text-lg font-bold text-white">{ward.name}</h2>
                <div className="text-xs text-slate-400 flex gap-2 mt-1">
                  <span>النوع: {ward.type}</span>
                  <span>•</span>
                  <span>
                    سعر الليلة:{" "}
                    {ward.serviceItem ? (
                      <span className="text-emerald-400 font-bold">
                        {ward.serviceItem.defaultPrice} LYD
                      </span>
                    ) : (
                      <span className="text-rose-400">غير مسعر!</span>
                    )}
                  </span>
                </div>
              </div>
              <button
                onClick={() =>
                  setActiveWardId(activeWardId === ward.id ? null : ward.id)
                }
                className="text-xs bg-slate-800 px-3 py-1.5 rounded hover:bg-slate-700"
              >
                + إضافة غرفة
              </button>
            </div>

            {/* Add Room Form */}
            {activeWardId === ward.id && (
              <div className="mb-4 flex gap-2 bg-slate-950 p-2 rounded-lg border border-slate-700">
                <input
                  placeholder="رقم/اسم الغرفة"
                  className="bg-transparent text-sm px-2 outline-none flex-1"
                  value={newRoomNumber}
                  onChange={(e) => setNewRoomNumber(e.target.value)}
                />
                <button
                  onClick={() => handleCreateRoom(ward.id)}
                  className="text-xs bg-emerald-600 px-3 rounded text-white"
                >
                  حفظ
                </button>
              </div>
            )}

            {/* Rooms Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {ward.rooms.map((room) => (
                <div
                  key={room.id}
                  className="bg-slate-950/40 border border-slate-700/50 rounded-xl p-3"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-sky-200">
                      غرفة {room.roomNumber}
                    </span>
                    <button
                      onClick={() =>
                        setActiveRoomId(
                          activeRoomId === room.id ? null : room.id,
                        )
                      }
                      className="text-[10px] text-slate-400 hover:text-white bg-slate-800 px-2 py-0.5 rounded"
                    >
                      + سرير
                    </button>
                  </div>

                  {/* Add Bed Form */}
                  {activeRoomId === room.id && (
                    <div className="mb-2 flex gap-1">
                      <input
                        placeholder="رقم السرير"
                        className="bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-xs w-20 outline-none"
                        value={newBedNumber}
                        onChange={(e) => setNewBedNumber(e.target.value)}
                      />
                      <button
                        onClick={() => handleCreateBed(room.id)}
                        className="text-[10px] bg-emerald-600 px-2 rounded"
                      >
                        ✓
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {room.beds.map((bed) => (
                      <div
                        key={bed.id}
                        className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300"
                      >
                        🛏️ {bed.bedNumber}
                      </div>
                    ))}
                    {room.beds.length === 0 && (
                      <span className="text-[10px] text-slate-600">فارغة</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Create Ward Modal */}
      {showWardModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-lg">إضافة عنبر جديد</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  اسم العنبر
                </label>
                <input
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm"
                  value={newWard.name}
                  onChange={(e) =>
                    setNewWard({ ...newWard, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  النوع
                </label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm"
                  value={newWard.type}
                  onChange={(e) =>
                    setNewWard({ ...newWard, type: e.target.value })
                  }
                >
                  <option value="General">عام (General)</option>
                  <option value="ICU">عناية مركزة (ICU)</option>
                  <option value="Private">خاص (Private)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  خدمة التسعير (Service Item)
                </label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm"
                  value={newWard.serviceItemId}
                  onChange={(e) =>
                    setNewWard({ ...newWard, serviceItemId: e.target.value })
                  }
                >
                  <option value="">-- اختر خدمة السعر اليومي --</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.defaultPrice} د.ل)
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  يجب تعريف خدمات "إقامة" (Type: BED) في دليل الخدمات أولاً
                  لتظهر هنا.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowWardModal(false)}
                className="px-4 py-2 bg-slate-800 rounded text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreateWard}
                className="px-4 py-2 bg-emerald-600 rounded text-sm font-bold"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
