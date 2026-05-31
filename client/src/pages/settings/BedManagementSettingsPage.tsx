import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { Edit2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

// Types
type ServiceItemLite = { id: number; name: string; defaultPrice: number };
type Bed = { id: number; bedNumber: string; status: string };
type Room = { id: number; roomNumber: string; beds: Bed[] };
type Ward = {
  id: number;
  name: string;
  type: string;
  rooms: Room[];
  serviceItemId?: number;
  serviceItem?: ServiceItemLite;
  departmentId?: number;
  department?: { id: number; name: string };
};

type DepartmentLite = { id: number; name: string };

export default function BedManagementSettingsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [wards, setWards] = useState<Ward[]>([]);
  const [services, setServices] = useState<ServiceItemLite[]>([]);
  const [departments, setDepartments] = useState<DepartmentLite[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);

  // Modals specific state
  const [showWardModal, setShowWardModal] = useState(false);
  const [editWardId, setEditWardId] = useState<number | null>(null);
  const [wardForm, setWardForm] = useState({
    name: "",
    type: "General",
    serviceItemId: "",
    departmentId: "",
  });

  const [activeWardId, setActiveWardId] = useState<number | null>(null);
  const [newRoomNumber, setNewRoomNumber] = useState("");
  const [editRoomId, setEditRoomId] = useState<number | null>(null);
  const [editRoomNumber, setEditRoomNumber] = useState("");

  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [newBedNumber, setNewBedNumber] = useState("");
  const [editBedId, setEditBedId] = useState<number | null>(null);
  const [editBedNumber, setEditBedNumber] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [wRes, sRes, dRes] = await Promise.all([
        apiClient.get<Ward[]>("/beds/tree"),
        apiClient.get<ServiceItemLite[]>("/beds/services"),
        apiClient.get<DepartmentLite[]>("/departments"),
      ]);
      setWards(wRes.data);
      setServices(sRes.data);
      setDepartments(dRes.data);
    } catch {
      toast.error(t("beds.loadFailed", "فشل تحميل البيانات"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- WARDS ---
  const handleOpenWardModal = (ward?: Ward) => {
    if (ward) {
      setEditWardId(ward.id);
      setWardForm({
        name: ward.name,
        type: ward.type,
        serviceItemId: ward.serviceItemId?.toString() || "",
        departmentId: ward.departmentId?.toString() || "",
      });
    } else {
      setEditWardId(null);
      setWardForm({ name: "", type: "General", serviceItemId: "", departmentId: "" });
    }
    setShowWardModal(true);
  };

  const handleSaveWard = async () => {
    if (!wardForm.name) return;
    try {
      const payload = {
        name: wardForm.name,
        type: wardForm.type,
        gender: "Mixed",
        serviceItemId: wardForm.serviceItemId ? Number(wardForm.serviceItemId) : null,
        departmentId: wardForm.departmentId ? Number(wardForm.departmentId) : null,
      };

      if (editWardId) {
        await apiClient.patch(`/beds/wards/${editWardId}`, payload);
        toast.success(t("beds.updateSuccess", "تم التعديل بنجاح"));
      } else {
        await apiClient.post("/beds/wards", payload);
        toast.success(t("beds.wardCreated", "تم إنشاء العنبر"));
      }
      setShowWardModal(false);
      loadData();
    } catch {
      toast.error(t("beds.opFailed", "فشلت العملية"));
    }
  };

  const handleDeleteWard = async (id: number) => {
    if (!confirm(t("beds.confirmDeleteWard", "هل أنت متأكد من حذف هذا العنبر؟ (يجب ألا يحتوي على غرف)"))) return;
    try {
      await apiClient.delete(`/beds/wards/${id}`);
      toast.success(t("beds.deleteSuccess", "تم الحذف بنجاح"));
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t("beds.deleteFailed", "فشل الحذف"));
    }
  };

  // --- ROOMS ---
  const handleCreateRoom = async (wardId: number) => {
    if (!newRoomNumber) return;
    try {
      await apiClient.post("/beds/rooms", { wardId, roomNumber: newRoomNumber });
      toast.success(t("beds.roomAdded", "تمت إضافة الغرفة"));
      setNewRoomNumber("");
      setActiveWardId(null);
      loadData();
    } catch {
      toast.error(t("beds.roomAddFailed", "فشل إضافة الغرفة"));
    }
  };

  const handleUpdateRoom = async (roomId: number) => {
    if (!editRoomNumber) return;
    try {
      await apiClient.patch(`/beds/rooms/${roomId}`, { roomNumber: editRoomNumber });
      toast.success(t("beds.updateSuccess", "تم التعديل بنجاح"));
      setEditRoomId(null);
      loadData();
    } catch {
      toast.error(t("beds.updateFailed", "فشل التعديل"));
    }
  };

  const handleDeleteRoom = async (id: number) => {
    if (!confirm(t("beds.confirmDeleteRoom", "هل أنت متأكد من حذف هذه الغرفة؟ (يجب ألا تحتوي على أسِرة)"))) return;
    try {
      await apiClient.delete(`/beds/rooms/${id}`);
      toast.success(t("beds.deleteSuccess", "تم الحذف بنجاح"));
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t("beds.deleteFailed", "فشل الحذف"));
    }
  };

  // --- BEDS ---
  const handleCreateBed = async (roomId: number) => {
    if (!newBedNumber) return;
    try {
      await apiClient.post("/beds/beds", { roomId, bedNumber: newBedNumber });
      toast.success(t("beds.bedAdded", "تمت إضافة السرير"));
      setNewBedNumber("");
      setActiveRoomId(null);
      loadData();
    } catch {
      toast.error(t("beds.bedAddFailed", "فشل إضافة السرير"));
    }
  };

  const handleUpdateBed = async (bedId: number, currentStatus: string) => {
    if (!editBedNumber) return;
    try {
      await apiClient.patch(`/beds/beds/${bedId}`, { bedNumber: editBedNumber, status: currentStatus });
      toast.success(t("beds.updateSuccess", "تم التعديل بنجاح"));
      setEditBedId(null);
      loadData();
    } catch {
      toast.error(t("beds.updateFailed", "فشل التعديل"));
    }
  };

  const handleDeleteBed = async (id: number) => {
    if (!confirm(t("beds.confirmDeleteBed", "هل أنت متأكد من حذف هذا السرير؟ (لا يمكن الحذف إذا كان مريض منوماً فيه)"))) return;
    try {
      await apiClient.delete(`/beds/beds/${id}`);
      toast.success(t("beds.deleteSuccess", "تم الحذف بنجاح"));
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t("beds.deleteFailed", "فشل الحذف"));
    }
  };

  return (
    <div className="p-6 text-slate-100 h-full flex flex-col space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{t("beds.setupTitle")}</h1>
          <p className="text-sm text-slate-400">{t("beds.setupSubtitle")}</p>
        </div>
        <button
          onClick={() => handleOpenWardModal()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg"
        >
          {t("beds.addWardBtn")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 overflow-y-auto pb-10">
        {wards.map((ward) => (
          <div key={ward.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            
            {/* Ward Header */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3">
              <div className="flex gap-4 items-center">
                <div>
                  <h2 className="text-lg font-bold text-white">{ward.name}</h2>
                  <div className="text-xs text-slate-400 flex gap-2 mt-1">
                    <span>{t("beds.typeLabel")} {ward.type === "General" ? t("beds.wardTypeGeneral") : ward.type === "ICU" ? t("beds.wardTypeIcu") : ward.type === "Private" ? t("beds.wardTypePrivate") : ward.type}</span>
                    <span>•</span>
                    <span>
                      {t("beds.rateLabel")} {ward.serviceItem ? <span className="text-emerald-400 font-bold">{ward.serviceItem.defaultPrice} LYD</span> : <span className="text-rose-400">{t("beds.unpriced")}</span>}
                    </span>
                    {ward.department && <><span>•</span><span>{t("beds.deptLabel")} {ward.department.name}</span></>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleOpenWardModal(ward)} className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded transition"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDeleteWard(ward.id)} className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <button
                onClick={() => setActiveWardId(activeWardId === ward.id ? null : ward.id)}
                className="text-xs bg-slate-800 px-3 py-1.5 rounded hover:bg-slate-700"
              >
                {t("beds.addRoomBtn")}
              </button>
            </div>

            {/* Add Room Form */}
            {activeWardId === ward.id && (
              <div className="mb-4 flex gap-2 bg-slate-950 p-2 rounded-lg border border-slate-700">
                <input placeholder={t("beds.roomPh")} className="bg-transparent text-sm px-2 outline-none flex-1 focus:ring-1 focus:ring-emerald-500 rounded text-white" value={newRoomNumber} onChange={(e) => setNewRoomNumber(e.target.value)} />
                <button onClick={() => handleCreateRoom(ward.id)} className="text-xs bg-emerald-600 hover:bg-emerald-500 px-3 rounded text-white font-bold transition">{t("beds.saveBtn")}</button>
              </div>
            )}

            {/* Rooms Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {ward.rooms.map((room) => (
                <div key={room.id} className="bg-slate-950/40 border border-slate-700/50 rounded-xl p-3">
                  <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800/60">
                    
                    {editRoomId === room.id ? (
                      <div className="flex gap-1 w-full max-w-[150px]">
                        <input className="bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-xs w-20 outline-none text-white focus:border-sky-500" value={editRoomNumber} onChange={e => setEditRoomNumber(e.target.value)} />
                        <button onClick={() => handleUpdateRoom(room.id)} className="text-[10px] bg-emerald-600 px-2 rounded font-bold">{t("beds.saveBtn")}</button>
                        <button onClick={() => setEditRoomId(null)} className="text-[10px] bg-slate-700 px-2 rounded">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-sky-200">{t("beds.room")} {room.roomNumber}</span>
                        <div className="flex opacity-50 hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditRoomId(room.id); setEditRoomNumber(room.roomNumber); }} className="p-1 text-sky-400 hover:bg-slate-800 rounded"><Edit2 className="w-3 h-3" /></button>
                          <button onClick={() => handleDeleteRoom(room.id)} className="p-1 text-rose-400 hover:bg-slate-800 rounded"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    )}

                    <button onClick={() => setActiveRoomId(activeRoomId === room.id ? null : room.id)} className="text-[10px] text-slate-400 hover:text-white bg-slate-800 px-2 py-0.5 rounded transition">
                      {t("beds.addBedBtn")}
                    </button>
                  </div>

                  {/* Add Bed Form */}
                  {activeRoomId === room.id && (
                    <div className="mb-2 flex gap-1 animate-in fade-in zoom-in duration-200">
                      <input placeholder={t("beds.bedPh")} className="bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-xs w-20 outline-none focus:border-emerald-500 text-white" value={newBedNumber} onChange={(e) => setNewBedNumber(e.target.value)} />
                      <button onClick={() => handleCreateBed(room.id)} className="text-[10px] bg-emerald-600 px-2 rounded font-bold">{t("beds.createBtn")}</button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {room.beds.map((bed) => (
                      <div key={bed.id} className="relative group px-2 py-1 flex gap-1 items-center rounded bg-slate-800 border border-slate-700 text-xs text-slate-300">
                        {editBedId === bed.id ? (
                           <div className="flex gap-1 absolute inset-0 bg-slate-800 border-sky-500 border rounded z-10 px-1 items-center">
                             <input className="bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-xs w-12 outline-none text-white" value={editBedNumber} onChange={e => setEditBedNumber(e.target.value)} autoFocus />
                             <button onClick={() => handleUpdateBed(bed.id, bed.status)} className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">✓</button>
                             <button onClick={() => setEditBedId(null)} className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">✕</button>
                           </div>
                        ) : (
                          <>
                            <span>🛏️ {bed.bedNumber}</span>
                            <div className="hidden group-hover:flex right-0 ml-1 gap-1">
                              <button onClick={() => { setEditBedId(bed.id); setEditBedNumber(bed.bedNumber); }} className="text-sky-400 hover:bg-slate-700 p-0.5 rounded"><Edit2 className="w-3 h-3" /></button>
                              <button onClick={() => handleDeleteBed(bed.id)} className="text-rose-400 hover:bg-slate-700 p-0.5 rounded"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {room.beds.length === 0 && <span className="text-[10px] text-slate-600">{t("beds.emptyLabel")}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Ward Modal */}
      {showWardModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h3 className="font-bold text-lg">{editWardId ? t("beds.editWard") : t("beds.addWard")}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">{t("beds.wardName")}</label>
                <input className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm focus:outline-none focus:border-sky-500 transition text-white" value={wardForm.name} onChange={(e) => setWardForm({ ...wardForm, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">{t("beds.wardType")}</label>
                <select className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm focus:outline-none focus:border-sky-500 transition text-white" value={wardForm.type} onChange={(e) => setWardForm({ ...wardForm, type: e.target.value })}>
                  <option value="General">{t("beds.wardTypeGeneral")}</option>
                  <option value="ICU">{t("beds.wardTypeIcu")}</option>
                  <option value="Private">{t("beds.wardTypePrivate")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">{t("beds.wardDept")}</label>
                <select className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm focus:outline-none focus:border-sky-500 transition text-white" value={wardForm.departmentId} onChange={(e) => setWardForm({ ...wardForm, departmentId: e.target.value })}>
                  <option value="">{t("beds.selectWardDept")}</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">{t("beds.pricingService")}</label>
                <select className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm focus:outline-none focus:border-sky-500 transition text-white" value={wardForm.serviceItemId} onChange={(e) => setWardForm({ ...wardForm, serviceItemId: e.target.value })}>
                  <option value="">{t("beds.selectPricingService")}</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.defaultPrice} د.ل)</option>)}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">{t("beds.pricingNote")}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button onClick={() => setShowWardModal(false)} className="px-4 py-2.5 hover:bg-slate-800 rounded-xl text-sm font-medium transition text-slate-300 border border-transparent hover:border-slate-700">{t("beds.cancel")}</button>
              <button onClick={handleSaveWard} className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 rounded-xl text-sm font-bold shadow-lg shadow-sky-900/40 transition">{t("beds.saveChanges")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
