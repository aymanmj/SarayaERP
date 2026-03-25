import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../../api/apiClient';
import { Loader2, FileSignature, Activity, Users, Bed, AlertCircle } from 'lucide-react';
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
      alert('Failed to allocate bed');
    }
  };

  if (loading) return <div className="flex justify-center items-center h-[calc(100vh-200px)]"><Loader2 className="w-10 h-10 animate-spin text-sky-600" /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">ICU Central Dashboard</h1>
          <p className="text-slate-500 text-sm">Real-time overview of Intensive Care Units</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => fetchData()} className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            Refresh
          </button>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 flex items-center">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg mr-4">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Admitted Patients</p>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{patients.length}</h3>
          </div>
        </div>
        
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 flex items-center">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg mr-4">
            <Bed className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Available Beds</p>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{stats?.beds?.available ?? 0}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 flex items-center">
          <div className="p-3 bg-purple-100 text-purple-600 rounded-lg mr-4">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Active Ventilators</p>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{stats?.activeVentilators ?? 0}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 flex items-center">
          <div className="p-3 bg-amber-100 text-amber-600 rounded-lg mr-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Pending Transfers</p>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-white">{transfers.length}</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT COLUMN - PATIENTS (Spans 2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-500" /> Current ICU Patients
              </h2>
            </div>
            
            {patients.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No active patients in ICU right now.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {patients.map(p => (
                  <div key={p.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 font-semibold text-lg shrink-0">
                        {p.patient?.fullName?.charAt(0) || '?'}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 leading-tight">
                          {p.patient?.fullName}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                          <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-xs">MRN: {p.patient?.mrn}</span>
                          {p.bed && (
                            <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                              <Bed className="w-3 h-3" /> Bed {p.bed.bedNumber} ({p.bed.ward?.name})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => navigate(`/clinical/icu/patient/${p.encounterId}`)} 
                        className="px-3 py-1.5 bg-white border border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium transition-colors">
                        Details
                      </button>
                      <button 
                        onClick={() => navigate(`/clinical/icu/flowsheet/${p.encounterId}`)} 
                        className="px-3 py-1.5 bg-sky-600 text-white rounded hover:bg-sky-700 text-sm font-medium transition-colors">
                        Flowsheet
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN - TRANSFERS & OVERVIEW */}
        <div className="space-y-6">
          {/* PENDING TRANSFERS */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                Incoming Transfers
                {transfers.length > 0 && <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold">{transfers.length}</span>}
              </h2>
            </div>
            
            <div className="p-4">
              {transfers.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No pending incoming transfers.</p>
              ) : (
                <div className="space-y-3">
                  {transfers.map(t => (
                    <div key={t.id} className="p-3 border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800/30 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-amber-900 dark:text-amber-200 text-sm">{t.encounter?.patient?.fullName}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-amber-200/50 text-amber-800 dark:text-amber-300">{t.status.replace('_', ' ')}</span>
                      </div>
                      <p className="text-xs text-amber-700/80 dark:text-amber-400 mb-3">{t.reason}</p>
                      
                      <div className="flex flex-row flex-wrap gap-2 w-full mt-2">
                        {t.status === 'REQUESTED' && (
                          <button 
                             onClick={() => {
                               const bedIdStr = prompt('Enter Bed ID (1-10) to allocate:');
                               if (bedIdStr && !isNaN(Number(bedIdStr))) allocateBed(t.id, Number(bedIdStr));
                             }}
                             className="flex-1 py-1.5 px-2 bg-white border border-amber-300 text-amber-700 rounded text-xs font-semibold hover:bg-amber-100 transition-colors whitespace-nowrap">
                            Allocate Bed
                          </button>
                        )}
                        {(t.status === 'HANDOVER_SIGNED' || t.status === 'BED_ALLOCATED') && (
                          <button 
                             onClick={async () => {
                               await apiClient.patch(`/transfers/${t.id}/arrive`);
                               fetchData();
                             }}
                             className="flex-1 py-1.5 px-2 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap">
                            Confirm Arrival
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            setSelectedTransfer(t);
                            setShowHandoverModal(true);
                          }} 
                          className="flex-1 py-1.5 px-2 flex items-center justify-center gap-1.5 bg-indigo-600 text-white rounded text-xs font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap">
                           <FileSignature className="w-3.5 h-3.5" /> SBAR Handover Note
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* BED STATUS OVERVIEW */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
             <h2 className="text-lg font-semibold mb-4 text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2">Bed Utilization</h2>
             <ul className="space-y-3 text-sm">
               <li className="flex justify-between items-center">
                 <span className="text-slate-600 dark:text-slate-400">Total ICU Beds</span> 
                 <span className="font-bold text-slate-800 dark:text-slate-200">{stats?.beds?.total ?? 0}</span>
               </li>
               <li className="flex justify-between items-center">
                 <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500"></div> Occupied</span> 
                 <span className="font-bold text-slate-800 dark:text-slate-200">{stats?.beds?.occupied ?? 0}</span>
               </li>
               <li className="flex justify-between items-center">
                 <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Available</span> 
                 <span className="font-bold text-emerald-600 dark:text-emerald-400">{stats?.beds?.available ?? 0}</span>
               </li>
               <li className="flex justify-between items-center">
                 <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Cleaning/Maintenance</span> 
                 <span className="font-bold text-amber-600 dark:text-amber-400">{stats?.beds?.cleaning ?? 0}</span>
               </li>
             </ul>
             
             {/* Progress Bar */}
             <div className="mt-5">
                <div className="flex justify-between text-xs mb-1 text-slate-500">
                  <span>Occupancy Rate</span>
                  <span>{stats?.beds?.total ? Math.round((stats.beds.occupied / stats.beds.total) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden flex">
                  <div className="bg-red-500 h-2.5" style={{ width: `${stats?.beds?.total ? (stats.beds.occupied / stats.beds.total) * 100 : 0}%` }}></div>
                  <div className="bg-amber-500 h-2.5" style={{ width: `${stats?.beds?.total ? (stats.beds.cleaning / stats.beds.total) * 100 : 0}%` }}></div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {showHandoverModal && selectedTransfer && (
        <HandoverNoteModal
          isOpen={showHandoverModal}
          onClose={() => setShowHandoverModal(false)}
          transferId={selectedTransfer.id}
          patientName={selectedTransfer.encounter?.patient?.fullName}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
};
