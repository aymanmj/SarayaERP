import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../../api/apiClient';
import { Loader2, FileSignature, Activity, Users, Bed, AlertCircle, HeartPulse, ShieldAlert } from 'lucide-react';
import { HandoverNoteModal } from '../transfers/HandoverNoteModal';

export const IcuDashboard = () => {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Handover Modal State
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [transfersRes, statsRes, patientsRes] = await Promise.all([
        apiClient.get('/transfers/pending'),
        apiClient.get('/icu/dashboard/stats'),
        apiClient.get('/icu/patients')
      ]);
      setTransfers(transfersRes.data);
      setStats(statsRes.data);
      setPatients(patientsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const allocateBed = async (id: number, bedId: number) => {
    try {
      await apiClient.patch(`/transfers/${id}/allocate`, { toBedId: bedId });
      fetchData();
    } catch (err) {
      console.error(err);
      alert('فشل تعيين السرير');
    }
  };

  const confirmArrival = async (id: number) => {
    try {
      await apiClient.patch(`/transfers/${id}/arrive`);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('فشل تأكيد الوصول');
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-slate-400">
      <Loader2 className="w-10 h-10 animate-spin text-sky-500 mb-4" />
      <span className="text-sm animate-pulse">جارِ تحميل بيانات العناية المركزة...</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 lg:p-6 space-y-6 overflow-hidden max-w-7xl mx-auto" dir="rtl">
      
      {/* 1. Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <div className="p-2 bg-sky-900/30 text-sky-400 rounded-xl border border-sky-500/30">
              <Activity className="w-6 h-6" />
            </div>
            لوحة تحكم العناية المركزة (ICU)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            مراقبة حية للمرضى، الأسرة، والتحويلات القادمة للعناية الفائقة
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => fetchData()} 
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium shadow-sm"
          >
            <span>🔄</span> تحديث البيانات
          </button>
        </div>
      </div>

      {/* 2. STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center hover:border-slate-700 transition-colors shadow-sm relative overflow-hidden group">
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-xl"></div>
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-bl-full"></div>
          <div className="p-3 bg-blue-900/30 text-blue-400 border border-blue-500/30 rounded-xl ml-4 z-10">
            <Users className="w-6 h-6" />
          </div>
          <div className="z-10">
            <p className="text-xs text-slate-400 font-medium mb-1">المرضى المنومين</p>
            <h3 className="text-2xl font-bold text-white">{patients.length}</h3>
          </div>
        </div>
        
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center hover:border-slate-700 transition-colors shadow-sm relative overflow-hidden group">
           <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-xl"></div>
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-bl-full"></div>
          <div className="p-3 bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 rounded-xl ml-4 z-10">
            <Bed className="w-6 h-6" />
          </div>
          <div className="z-10">
            <p className="text-xs text-slate-400 font-medium mb-1">الأسرة المتاحة</p>
            <h3 className="text-2xl font-bold text-white">{stats?.beds?.available ?? 0}</h3>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center hover:border-slate-700 transition-colors shadow-sm relative overflow-hidden group">
           <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-xl"></div>
          <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/10 rounded-bl-full"></div>
          <div className="p-3 bg-purple-900/30 text-purple-400 border border-purple-500/30 rounded-xl ml-4 z-10">
            <HeartPulse className="w-6 h-6" />
          </div>
          <div className="z-10">
            <p className="text-xs text-slate-400 font-medium mb-1">أجهزة التنفس النشطة</p>
            <h3 className="text-2xl font-bold text-white">{stats?.activeVentilators ?? 0}</h3>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center hover:border-slate-700 transition-colors shadow-sm relative overflow-hidden group">
           <div className="absolute -inset-1 bg-gradient-to-r from-rose-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-xl"></div>
          <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-bl-full"></div>
          <div className="p-3 bg-rose-900/30 text-rose-400 border border-rose-500/30 rounded-xl ml-4 z-10">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="z-10">
            <p className="text-xs text-slate-400 font-medium mb-1">طلبات نقل معلقة</p>
            <h3 className="text-2xl font-bold text-white">{transfers.length}</h3>
          </div>
        </div>
      </div>

      {/* 3. MAIN CONTENT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        
        {/* RIGHT COLUMN (RTL) / MAIN AREA - PATIENTS (Spans 2 cols) */}
        <div className="lg:col-span-2 flex flex-col bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-sm h-[600px] lg:h-auto">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-900 shrink-0">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400" /> مرضى العناية المركزة حالياً
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {patients.length === 0 ? (
              <div className="text-center text-slate-500 flex flex-col items-center justify-center h-full">
                <Bed className="w-16 h-16 mb-4 opacity-20" />
                <p>لا يوجد مرضى منومين في العناية المركزة حالياً.</p>
              </div>
            ) : (
              patients.map(p => (
                <div key={p.id} className="p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-slate-950 border border-slate-700 flex items-center justify-center text-sky-400 font-bold text-xl shrink-0 shadow-inner group-hover:border-sky-500/50 transition-colors">
                      {p.patient?.fullName?.charAt(0) || '?'}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm leading-tight mb-2">
                        {p.patient?.fullName}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] md:text-xs">
                        <span className="text-slate-500 font-mono">#{p.patient?.mrn}</span>
                        {p.bed && (
                          <span className="bg-sky-900/30 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded flex items-center gap-1 font-medium">
                            <Bed className="w-3 h-3" /> سرير {p.bed.bedNumber} ({p.bed.ward?.name})
                          </span>
                        )}
                        <span className="bg-emerald-900/20 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-medium">
                          مستقر
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                    <button 
                      onClick={() => navigate(`/clinical/icu/patient/${p.encounterId}`)} 
                      className="flex-1 sm:flex-none px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors shadow-sm"
                    >
                      الملف الطبي
                    </button>
                    <button 
                      onClick={() => navigate(`/clinical/icu/flowsheet/${p.encounterId}`)} 
                      className="flex-1 sm:flex-none px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-sky-900/50"
                    >
                      المخطط السريري
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* LEFT COLUMN (RTL) - TRANSFERS & OVERVIEW */}
        <div className="flex flex-col gap-6 h-full overflow-hidden shrink-0">
          
          {/* PENDING TRANSFERS */}
          <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm h-[400px]">
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center shrink-0">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                تحويلات قادمة
              </h2>
              {transfers.length > 0 && <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] px-2 py-0.5 rounded font-bold">{transfers.length} معلق</span>}
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
              {transfers.length === 0 ? (
                <div className="text-center py-8">
                   <AlertCircle className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                  <p className="text-xs text-slate-500">لا توجد طلبات نقل معلقة حالياً.</p>
                </div>
              ) : (
                transfers.map(t => (
                  <div key={t.id} className="p-4 border border-slate-800 bg-slate-950 rounded-2xl shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-1 h-full bg-amber-500"></div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="font-bold text-slate-200 text-sm">{t.encounter?.patient?.fullName}</span>
                    </div>
                    
                    <div className="mb-4">
                      <span className={`inline-block text-[10px] font-bold px-2 py-1 rounded mb-2 tracking-wide ${
                        t.status === 'REQUESTED' ? 'bg-amber-900/40 text-amber-400 border border-amber-500/30' : 
                        t.status === 'BED_ALLOCATED' ? 'bg-purple-900/40 text-purple-400 border border-purple-500/30' :
                        'bg-sky-900/40 text-sky-400 border border-sky-500/30'
                      }`}>
                        {t.status === 'REQUESTED' ? 'طلب جديد - في انتظار سرير' : 
                         t.status === 'BED_ALLOCATED' ? 'تم تعيين سرير - بانتظار المريض' :
                         t.status === 'HANDOVER_SIGNED' ? 'اكتمل تسليم الحالة' : t.status}
                      </span>
                      <p className="text-xs text-slate-400 bg-slate-900 p-3 rounded-xl border border-slate-800 leading-relaxed">
                        <span className="text-slate-500 block mb-1">سبب تحويل الحالة:</span>
                        {t.reason}
                      </p>
                    </div>
                    
                    <div className="flex flex-col gap-2 w-full mt-2">
                      {t.status === 'REQUESTED' && (
                        <button 
                           onClick={() => {
                             const bedIdStr = prompt('أدخل رقم الـ ID للسرير المتاح (مثال: 1 أو 2):');
                             if (bedIdStr && !isNaN(Number(bedIdStr))) allocateBed(t.id, Number(bedIdStr));
                           }}
                           className="w-full py-2.5 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/50 text-amber-400 rounded-xl text-xs font-bold transition-all">
                          تخصيص سرير لاستقبال الحالة
                        </button>
                      )}
                      
                      {t.status === 'BED_ALLOCATED' && (
                         <button 
                           onClick={() => {
                             setSelectedTransfer(t);
                             setShowHandoverModal(true);
                           }} 
                           className="w-full py-2.5 flex items-center justify-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-400 rounded-xl text-xs font-bold transition-all">
                            <FileSignature className="w-3.5 h-3.5" /> استلام المريض ومراجعة SBAR
                         </button>
                      )}

                      {t.status === 'HANDOVER_SIGNED' && (
                        <button 
                           onClick={() => confirmArrival(t.id)}
                           className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-900/20">
                          تأكيد وصول المريض للعناية
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* BED UTILIZATION COMPACT */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm shrink-0">
             <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
               <Bed className="w-4 h-4 text-emerald-400" /> ملخص الأسرة
             </h2>
             <div className="space-y-3">
                <div className="flex justify-between items-center bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400">إجمالي أسرة العناية</span> 
                  <span className="font-bold text-slate-200">{stats?.beds?.total ?? 0}</span>
                </div>
                <div className="flex justify-between items-center bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500"></div> مشغول</span> 
                  <span className="font-bold text-rose-400">{stats?.beds?.occupied ?? 0}</span>
                </div>
                <div className="flex justify-between items-center bg-slate-950 p-2.5 rounded-xl border border-emerald-500/20 shadow-[inset_0_0_10px_rgba(16,185,129,0.05)]">
                  <span className="text-xs text-emerald-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div> متاح (Available)</span> 
                  <span className="font-bold text-emerald-400 text-lg">{stats?.beds?.available ?? 0}</span>
                </div>
             </div>
          </div>

        </div>
      </div>

      <HandoverNoteModal 
        isOpen={showHandoverModal} 
        onClose={() => setShowHandoverModal(false)}
        transferId={selectedTransfer?.id}
        patientName={selectedTransfer?.encounter?.patient?.fullName || ''}
        onSuccess={() => {
          setShowHandoverModal(false);
          fetchData();
        }}
      />
    </div>
  );
};
