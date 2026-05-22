// src/pages/inventory/WarehouseManagementPage.tsx
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, Warehouse, WarehouseZone, WarehouseBin } from '../../api/inventoryApi';
import { toast } from 'sonner';

// ─────────────────── Icons ───────────────────
const WarehouseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect x="6" y="10" width="12" height="12"/></svg>
);
const ZoneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
);
const BinIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22.08V12"/></svg>
);
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
);
const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
);
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
);
const ChevronDown = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
);
const ChevronUp = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
);
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);
const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
);

// ─────────────────── Modal Component ───────────────────
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-0 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-gradient-to-l from-sky-500/5 to-transparent">
          <h3 className="text-lg font-bold text-slate-100">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors"><XIcon /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ─────────────────── Form Input ───────────────────
function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-300">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass = "w-full bg-slate-800/80 border border-slate-600/50 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 outline-none transition-all";
const btnPrimary = "flex items-center gap-2 px-5 py-2.5 bg-gradient-to-l from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-sky-500/20 transition-all duration-200 disabled:opacity-50";
const btnSecondary = "flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-xl text-sm transition-all";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const btnDanger = "flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs transition-all";
const btnSmall = "flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/40 hover:bg-slate-600/40 text-slate-300 rounded-lg text-xs transition-all";

// ─────────────────── Warehouse Card ───────────────────
function WarehouseCard({ warehouse, onEdit, onSelect, isSelected }: {
  warehouse: Warehouse;
  onEdit: () => void;
  onSelect: () => void;
  isSelected: boolean;
}) {
  return (
    <div
      onClick={onSelect}
      className={`group relative p-5 rounded-2xl border cursor-pointer transition-all duration-300 ${
        isSelected
          ? 'border-sky-500/50 bg-sky-500/5 shadow-lg shadow-sky-500/10 ring-1 ring-sky-500/20'
          : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600/50 hover:bg-slate-800/50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isSelected ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-700/50 text-slate-400 group-hover:text-sky-400'} transition-colors`}>
            <WarehouseIcon />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-base">{warehouse.name}</h3>
            {warehouse.code && (
              <span className="text-xs text-slate-500 font-mono bg-slate-700/30 px-2 py-0.5 rounded-md">{warehouse.code}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${
            warehouse.isActive
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-slate-700/50 text-slate-500 border border-slate-600/30'
          }`}>
            {warehouse.isActive ? 'نشط' : 'معطل'}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-slate-600/50 text-slate-400 hover:text-sky-400 transition-all"
          >
            <EditIcon />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <ZoneIcon />
          <span>{warehouse._count?.zones ?? 0} مناطق</span>
        </div>
        <div className="flex items-center gap-1.5">
          <BinIcon />
          <span>{warehouse._count?.productStocks ?? 0} صنف مخزني</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────── Zone / Bin Tree ───────────────────
function ZoneBinTree({ warehouse, onRefresh }: { warehouse: Warehouse; onRefresh: () => void }) {
  const [expandedZones, setExpandedZones] = useState<Set<number>>(new Set());
  const [addingZone, setAddingZone] = useState(false);
  const [addingBinForZone, setAddingBinForZone] = useState<number | null>(null);
  const [editingZone, setEditingZone] = useState<WarehouseZone | null>(null);
  const [editingBin, setEditingBin] = useState<WarehouseBin | null>(null);

  // Zone form state
  const [zoneCode, setZoneCode] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [zoneDesc, setZoneDesc] = useState('');

  // Bin form state
  const [binCode, setBinCode] = useState('');
  const [binName, setBinName] = useState('');
  const [binDesc, setBinDesc] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const queryClient = useQueryClient();

  const createZoneMut = useMutation({
    mutationFn: () => {
      if (!warehouse) throw new Error('Warehouse not loaded');
      return inventoryApi.createZone(warehouse.id, { code: zoneCode, name: zoneName, description: zoneDesc || undefined });
    },
    onSuccess: () => { toast.success('تم إضافة المنطقة بنجاح'); resetZoneForm(); onRefresh(); },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error(e?.response?.data?.message || 'فشل في إضافة المنطقة'),
  });

  const updateZoneMut = useMutation({
    mutationFn: () => inventoryApi.updateZone(editingZone!.id, { code: zoneCode, name: zoneName, description: zoneDesc || undefined }),
    onSuccess: () => { toast.success('تم تعديل المنطقة'); resetZoneForm(); onRefresh(); },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error(e?.response?.data?.message || 'فشل في تعديل المنطقة'),
  });

  const deleteZoneMut = useMutation({
    mutationFn: (id: number) => inventoryApi.deleteZone(id),
    onSuccess: () => { toast.success('تم حذف المنطقة'); onRefresh(); },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error(e?.response?.data?.message || 'فشل في حذف المنطقة'),
  });

  const createBinMut = useMutation({
    mutationFn: () => inventoryApi.createBin(addingBinForZone!, { code: binCode, name: binName, description: binDesc || undefined }),
    onSuccess: () => { toast.success('تم إضافة الرف بنجاح'); resetBinForm(); onRefresh(); },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error(e?.response?.data?.message || 'فشل في إضافة الرف'),
  });

  const updateBinMut = useMutation({
    mutationFn: () => inventoryApi.updateBin(editingBin!.id, { code: binCode, name: binName, description: binDesc || undefined }),
    onSuccess: () => { toast.success('تم تعديل الرف'); resetBinForm(); onRefresh(); },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error(e?.response?.data?.message || 'فشل في تعديل الرف'),
  });

  const deleteBinMut = useMutation({
    mutationFn: (id: number) => inventoryApi.deleteBin(id),
    onSuccess: () => { toast.success('تم حذف الرف'); onRefresh(); },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error(e?.response?.data?.message || 'فشل في حذف الرف'),
  });

  if (!warehouse) {
    return <div className="text-center p-4 text-slate-500 text-sm">جاري تحميل بيانات المستودع...</div>;
  }

  const toggleZone = (id: number) => {
    setExpandedZones(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const resetZoneForm = (closeForm: boolean | React.MouseEvent = true) => {
    const shouldClose = typeof closeForm === 'boolean' ? closeForm : true;
    setZoneCode('');
    setZoneName('');
    setZoneDesc('');
    if (shouldClose) setAddingZone(false);
    setEditingZone(null);
  };

  const resetBinForm = (closeForm: boolean | React.MouseEvent = true) => {
    const shouldClose = typeof closeForm === 'boolean' ? closeForm : true;
    setBinCode('');
    setBinName('');
    setBinDesc('');
    if (shouldClose) setAddingBinForZone(null);
    setEditingBin(null);
  };

  const startEditZone = (z: WarehouseZone) => {
    setEditingZone(z);
    setZoneCode(z.code);
    setZoneName(z.name);
    setZoneDesc(z.description || '');
  };

  const startEditBin = (b: WarehouseBin) => {
    setEditingBin(b);
    setBinCode(b.code);
    setBinName(b.name);
    setBinDesc(b.description || '');
  };

  const zones = warehouse.zones || [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <ZoneIcon /> المناطق والأرفف
          <span className="text-xs text-slate-500">({zones.length} منطقة)</span>
        </h4>
        <button onClick={(e) => { e.stopPropagation(); resetZoneForm(false); setAddingZone(true); }} className={btnSmall}>
          <PlusIcon /> إضافة منطقة
        </button>
      </div>

      {/* Add Zone Inline */}
      {addingZone && (
        <div className="p-4 rounded-xl border border-sky-500/30 bg-sky-500/5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={zoneCode} onChange={e => setZoneCode(e.target.value)} placeholder="كود المنطقة (مثل: Z01)" className={inputClass} />
            <input value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="اسم المنطقة" className={inputClass} />
          </div>
          <input value={zoneDesc} onChange={e => setZoneDesc(e.target.value)} placeholder="وصف (اختياري)" className={inputClass} />
          <div className="flex gap-2 justify-end">
            <button onClick={resetZoneForm} className={btnSecondary}>إلغاء</button>
            <button onClick={() => createZoneMut.mutate()} disabled={!zoneCode || !zoneName || createZoneMut.isPending} className={btnPrimary}>
              <CheckIcon /> حفظ
            </button>
          </div>
        </div>
      )}

      {/* Edit Zone Modal */}
      <Modal open={!!editingZone} onClose={resetZoneForm} title="تعديل المنطقة">
        <div className="space-y-4">
          <FormField label="كود المنطقة" required>
            <input value={zoneCode} onChange={e => setZoneCode(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="اسم المنطقة" required>
            <input value={zoneName} onChange={e => setZoneName(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="وصف">
            <input value={zoneDesc} onChange={e => setZoneDesc(e.target.value)} className={inputClass} />
          </FormField>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={resetZoneForm} className={btnSecondary}>إلغاء</button>
            <button onClick={() => updateZoneMut.mutate()} disabled={!zoneCode || !zoneName || updateZoneMut.isPending} className={btnPrimary}>
              <CheckIcon /> حفظ التعديلات
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Bin Modal */}
      <Modal open={!!editingBin} onClose={resetBinForm} title="تعديل الرف">
        <div className="space-y-4">
          <FormField label="كود الرف" required>
            <input value={binCode} onChange={e => setBinCode(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="اسم الرف" required>
            <input value={binName} onChange={e => setBinName(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="وصف">
            <input value={binDesc} onChange={e => setBinDesc(e.target.value)} className={inputClass} />
          </FormField>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={resetBinForm} className={btnSecondary}>إلغاء</button>
            <button onClick={() => updateBinMut.mutate()} disabled={!binCode || !binName || updateBinMut.isPending} className={btnPrimary}>
              <CheckIcon /> حفظ التعديلات
            </button>
          </div>
        </div>
      </Modal>

      {/* Zones List */}
      {zones.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          <ZoneIcon />
          <p className="mt-2">لا توجد مناطق بعد. أضف أول منطقة للمستودع.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {zones.map(zone => (
            <div key={zone.id} className="rounded-xl border border-slate-700/40 bg-slate-800/20 overflow-hidden">
              {/* Zone Header */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-700/20 transition-colors"
                onClick={() => toggleZone(zone.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">{expandedZones.has(zone.id) ? <ChevronUp /> : <ChevronDown />}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-md">{zone.code}</span>
                    <span className="text-sm font-medium text-slate-200">{zone.name}</span>
                    <span className="text-xs text-slate-500">({zone.bins?.length || 0} رف)</span>
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { resetBinForm(); setAddingBinForZone(zone.id); }} className={btnSmall}><PlusIcon /> رف</button>
                  <button onClick={() => startEditZone(zone)} className="p-1.5 rounded-lg hover:bg-slate-600/50 text-slate-400 hover:text-sky-400 transition-all"><EditIcon /></button>
                  <button
                    onClick={() => { if (confirm('هل أنت متأكد من حذف هذه المنطقة؟')) deleteZoneMut.mutate(zone.id); }}
                    className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-all"
                  ><TrashIcon /></button>
                </div>
              </div>

              {/* Expanded Zone Content */}
              {expandedZones.has(zone.id) && (
                <div className="border-t border-slate-700/30 bg-slate-900/30">
                  {/* Add Bin Inline */}
                  {addingBinForZone === zone.id && (
                    <div className="p-3 mx-3 mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input value={binCode} onChange={e => setBinCode(e.target.value)} placeholder="كود الرف (مثل: B01)" className={inputClass} />
                        <input value={binName} onChange={e => setBinName(e.target.value)} placeholder="اسم الرف" className={inputClass} />
                      </div>
                      <input value={binDesc} onChange={e => setBinDesc(e.target.value)} placeholder="وصف (اختياري)" className={inputClass} />
                      <div className="flex gap-2 justify-end">
                        <button onClick={resetBinForm} className={btnSecondary}>إلغاء</button>
                        <button onClick={() => createBinMut.mutate()} disabled={!binCode || !binName || createBinMut.isPending} className={btnPrimary}>
                          <CheckIcon /> حفظ
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Bins List */}
                  {zone.bins && zone.bins.length > 0 ? (
                    <div className="p-3 space-y-1.5">
                      {zone.bins.map(bin => (
                        <div key={bin.id} className="group flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-700/20 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <span className="text-slate-600"><BinIcon /></span>
                            <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">{bin.code}</span>
                            <span className="text-sm text-slate-300">{bin.name}</span>
                            {bin.description && <span className="text-xs text-slate-500">— {bin.description}</span>}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEditBin(bin)} className="p-1 rounded hover:bg-slate-600/50 text-slate-400 hover:text-sky-400"><EditIcon /></button>
                            <button
                              onClick={() => { if (confirm('هل أنت متأكد من حذف هذا الرف؟')) deleteBinMut.mutate(bin.id); }}
                              className="p-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-400"
                            ><TrashIcon /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-xs text-slate-500">لا يوجد أرفف في هذه المنطقة</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────── Main Page ───────────────────
export function WarehouseManagementPage() {
  const queryClient = useQueryClient();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);

  // Form state
  const [whName, setWhName] = useState('');
  const [whCode, setWhCode] = useState('');
  const [whActive, setWhActive] = useState(true);

  // Queries
  const warehousesQuery = useQuery({
    queryKey: ['warehouses-detailed'],
    queryFn: inventoryApi.listWarehousesDetailed,
  });

  const selectedWarehouseQuery = useQuery({
    queryKey: ['warehouse-details', selectedWarehouseId],
    queryFn: () => inventoryApi.getWarehouseDetails(selectedWarehouseId!),
    enabled: !!selectedWarehouseId,
  });

  // Stock for selected warehouse
  const stockQuery = useQuery({
    queryKey: ['warehouse-stock', selectedWarehouseId],
    queryFn: () => inventoryApi.getWarehouseStock(selectedWarehouseId!),
    enabled: !!selectedWarehouseId,
  });

  // Mutations
  const createMut = useMutation({
    mutationFn: () => inventoryApi.createWarehouse({ name: whName, code: whCode || undefined, isActive: whActive }),
    onSuccess: () => {
      toast.success('تم إنشاء المستودع بنجاح');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['warehouses-detailed'] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error(e?.response?.data?.message || 'فشل في إنشاء المستودع'),
  });

  const updateMut = useMutation({
    mutationFn: () => inventoryApi.updateWarehouse(editingWarehouse!.id, { name: whName, code: whCode || undefined, isActive: whActive }),
    onSuccess: () => {
      toast.success('تم تعديل المستودع بنجاح');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['warehouses-detailed'] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error(e?.response?.data?.message || 'فشل في تعديل المستودع'),
  });

  const resetForm = (closeModal: boolean | React.MouseEvent = true) => { 
    const shouldClose = typeof closeModal === 'boolean' ? closeModal : true;
    setWhName(''); 
    setWhCode(''); 
    setWhActive(true); 
    if (shouldClose) setShowAddWarehouse(false); 
    setEditingWarehouse(null); 
  };

  const startEdit = (wh: Warehouse) => {
    setEditingWarehouse(wh);
    setWhName(wh.name);
    setWhCode(wh.code || '');
    setWhActive(wh.isActive);
  };

  const refreshSelected = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['warehouse-details', selectedWarehouseId] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-stock', selectedWarehouseId] });
    queryClient.invalidateQueries({ queryKey: ['warehouses-detailed'] });
  }, [selectedWarehouseId, queryClient]);

  const warehouses = warehousesQuery.data || [];

  return (
    <div className="space-y-6 p-1">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <span className="p-2 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 rounded-xl text-sky-400"><WarehouseIcon /></span>
            إدارة المستودعات
          </h1>
          <p className="text-sm text-slate-500 mt-1">إنشاء وتنظيم المستودعات والمناطق وأماكن التخزين</p>
        </div>
        <button onClick={() => { resetForm(false); setShowAddWarehouse(true); }} className={btnPrimary}>
          <PlusIcon /> إضافة مستودع جديد
        </button>
      </div>

      {/* Add/Edit Warehouse Modal */}
      <Modal
        open={showAddWarehouse || !!editingWarehouse}
        onClose={resetForm}
        title={editingWarehouse ? 'تعديل المستودع' : 'إضافة مستودع جديد'}
      >
        <div className="space-y-4">
          <FormField label="اسم المستودع" required>
            <input value={whName} onChange={e => setWhName(e.target.value)} placeholder="مثال: المستودع الرئيسي" className={inputClass} autoFocus />
          </FormField>
          <FormField label="كود المستودع">
            <input value={whCode} onChange={e => setWhCode(e.target.value)} placeholder="مثال: WH-MAIN" className={inputClass} dir="ltr" />
          </FormField>
          <FormField label="الحالة">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setWhActive(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${whActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700/30 text-slate-500 border border-slate-600/30'}`}
              >نشط</button>
              <button
                onClick={() => setWhActive(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${!whActive ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-700/30 text-slate-500 border border-slate-600/30'}`}
              >معطل</button>
            </div>
          </FormField>
          <div className="flex gap-3 justify-end pt-3 border-t border-slate-700/50">
            <button onClick={resetForm} className={btnSecondary}>إلغاء</button>
            <button
              onClick={() => editingWarehouse ? updateMut.mutate() : createMut.mutate()}
              disabled={!whName || createMut.isPending || updateMut.isPending}
              className={btnPrimary}
            >
              <CheckIcon /> {editingWarehouse ? 'حفظ التعديلات' : 'إنشاء المستودع'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Warehouses List */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">المستودعات ({warehouses.length})</h2>
          {warehousesQuery.isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-800/30 animate-pulse" />)}</div>
          ) : warehouses.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <WarehouseIcon />
              <p className="mt-3 text-sm">لا توجد مستودعات بعد</p>
              <button onClick={() => setShowAddWarehouse(true)} className={`${btnPrimary} mt-4 mx-auto`}>
                <PlusIcon /> إضافة أول مستودع
              </button>
            </div>
          ) : (
            warehouses.map(wh => (
              <WarehouseCard
                key={wh.id}
                warehouse={wh}
                isSelected={selectedWarehouseId === wh.id}
                onSelect={() => setSelectedWarehouseId(wh.id)}
                onEdit={() => startEdit(wh)}
              />
            ))
          )}
        </div>

        {/* Selected Warehouse Details */}
        <div className="lg:col-span-2">
          {selectedWarehouseId && selectedWarehouseQuery.data ? (
            <div className="space-y-6">
              {/* Warehouse Summary */}
              <div className="p-5 rounded-2xl border border-slate-700/40 bg-gradient-to-bl from-sky-500/5 via-slate-800/20 to-slate-800/20">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-slate-100">{selectedWarehouseQuery.data.name}</h2>
                  {selectedWarehouseQuery.data.code && (
                    <span className="font-mono text-sm bg-slate-700/40 text-slate-400 px-3 py-1 rounded-lg">{selectedWarehouseQuery.data.code}</span>
                  )}
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/30 text-center">
                    <div className="text-2xl font-bold text-sky-400">{selectedWarehouseQuery.data.zones?.length || 0}</div>
                    <div className="text-xs text-slate-500 mt-1">مناطق</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/30 text-center">
                    <div className="text-2xl font-bold text-emerald-400">
                      {selectedWarehouseQuery.data.zones?.reduce((acc, z) => acc + (z.bins?.length || 0), 0) || 0}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">أرفف</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/30 text-center">
                    <div className="text-2xl font-bold text-amber-400">{stockQuery.data?.length || 0}</div>
                    <div className="text-xs text-slate-500 mt-1">أصناف مخزنة</div>
                  </div>
                </div>
              </div>

              {/* Zone/Bin Tree */}
              <div className="p-5 rounded-2xl border border-slate-700/40 bg-slate-800/20">
                <ZoneBinTree warehouse={selectedWarehouseQuery.data} onRefresh={refreshSelected} />
              </div>

              {/* Stock in Warehouse */}
              {stockQuery.data && stockQuery.data.length > 0 && (
                <div className="p-5 rounded-2xl border border-slate-700/40 bg-slate-800/20">
                  <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <BinIcon /> الأصناف المخزنة ({stockQuery.data.length})
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500 border-b border-slate-700/30">
                          <th className="text-right py-2 pr-3">الصنف</th>
                          <th className="text-right py-2">الكود</th>
                          <th className="text-center py-2">الكمية</th>
                          <th className="text-center py-2">الحد الأدنى</th>
                          <th className="text-center py-2">التشغيلة</th>
                          <th className="text-center py-2">الصلاحية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockQuery.data.slice(0, 20).map(stock => (
                          <tr key={stock.id} className="border-b border-slate-700/20 hover:bg-slate-700/10 transition-colors">
                            <td className="py-2 pr-3 text-slate-200">{stock.product?.name}</td>
                            <td className="py-2 text-slate-500 font-mono text-xs">{stock.product?.code || '-'}</td>
                            <td className={`py-2 text-center font-medium ${Number(stock.quantity) <= Number(stock.minStock) ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {Number(stock.quantity).toLocaleString()}
                            </td>
                            <td className="py-2 text-center text-slate-500">{Number(stock.minStock).toLocaleString()}</td>
                            <td className="py-2 text-center text-slate-500 text-xs">{stock.batchNumber || '-'}</td>
                            <td className="py-2 text-center text-slate-500 text-xs">
                              {stock.expiryDate ? new Date(stock.expiryDate).toLocaleDateString('ar-SA') : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-500 text-sm rounded-2xl border border-dashed border-slate-700/40">
              <div className="text-center">
                <WarehouseIcon />
                <p className="mt-3">اختر مستودعاً من القائمة لعرض التفاصيل</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
