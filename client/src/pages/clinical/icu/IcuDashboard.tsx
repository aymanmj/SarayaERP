import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../../api/apiClient';
import { Loader2 } from 'lucide-react';

export const IcuDashboard = () => {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPendingTransfers();
  }, []);

  const fetchPendingTransfers = async () => {
    try {
      const res = await apiClient.get('/transfers/pending');
      setTransfers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const allocateBed = async (id: number, bedId: number) => {
    try {
      await apiClient.patch(`/transfers/${id}/allocate`, { toBedId: bedId });
      fetchPendingTransfers();
    } catch (err) {
      console.error(err);
      alert('Failed to allocate bed');
    }
  };

  if (loading) return <div className="flex justify-center items-center p-8"><Loader2 className="w-8 h-8 animate-spin text-sky-600" /></div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">ICU Central Dashboard</h1>
        <button className="px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-700">All ICU Beds</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Pending Transfers Window */}
        <div className="col-span-1 lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl shadow p-4 border border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold mb-4 text-slate-700 dark:text-slate-200">Pending Transfers (Ward / ER ➡ ICU)</h2>
          {transfers.length === 0 ? (
            <p className="text-slate-500">No pending transfers.</p>
          ) : (
            <div className="space-y-3">
              {transfers.map(t => (
                <div key={t.id} className="p-4 border border-sky-100 dark:border-slate-600 bg-sky-50 dark:bg-slate-700 rounded-lg flex flex-col sm:flex-row justify-between sm:items-center">
                  <div>
                    <h3 className="font-bold text-sky-800 dark:text-sky-300">
                      {t.encounter?.patient?.fullName} - {t.encounter?.patient?.mrn}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Status: <span className="font-semibold">{t.status}</span>
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Reason: {t.reason}</p>
                  </div>
                  <div className="mt-3 sm:mt-0 flex gap-2">
                    {t.status === 'REQUESTED' && (
                      <button 
                         onClick={() => {
                           const bedIdStr = prompt('Enter Bed ID to allocate:');
                           if (bedIdStr && !isNaN(Number(bedIdStr))) allocateBed(t.id, Number(bedIdStr));
                         }}
                         className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                        Allocate Bed
                      </button>
                    )}
                    {(t.status === 'HANDOVER_SIGNED' || t.status === 'BED_ALLOCATED') && (
                      <button 
                         onClick={async () => {
                           await apiClient.patch(`/transfers/${t.id}/arrive`);
                           fetchPendingTransfers();
                         }}
                         className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                        Confirm Arrival
                      </button>
                    )}
                    <button onClick={() => navigate(`/clinical/icu/flowsheet/${t.encounterId}`)} className="px-3 py-1 bg-slate-600 text-white rounded text-sm hover:bg-slate-700">
                       View Flowsheet
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Stats or something else */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4 border border-slate-200 dark:border-slate-700">
           <h2 className="text-xl font-semibold mb-4 text-slate-700 dark:text-slate-200">ICU Status Overview</h2>
           <ul className="space-y-2 text-slate-600 dark:text-slate-400">
             <li className="flex justify-between border-b pb-2 dark:border-slate-700"><span>Occupied Beds</span> <span className="font-bold">12</span></li>
             <li className="flex justify-between border-b pb-2 dark:border-slate-700"><span>Available Beds</span> <span className="font-bold text-green-500">3</span></li>
             <li className="flex justify-between border-b pb-2 dark:border-slate-700"><span>Needs Cleaning</span> <span className="font-bold text-orange-500">1</span></li>
             <li className="flex justify-between border-b pb-2 dark:border-slate-700"><span>Active NICU Separations</span> <span className="font-bold text-purple-500">2</span></li>
           </ul>
        </div>
      </div>
    </div>
  );
};
