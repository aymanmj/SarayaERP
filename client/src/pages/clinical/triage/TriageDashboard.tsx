// src/pages/clinical/triage/TriageDashboard.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../../api/apiClient";
import { useNavigate } from "react-router-dom";
import {
  ClockIcon,
  UserIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

interface WaitingPatient {
  id: number;
  patient: {
    fullName: string;
    mrn: string;
    dateOfBirth: string;
    gender: string;
  };
  createdAt: string; // وقت الوصول
  _count: {
    triageAssessments: number;
  };
}

export function TriageDashboard() {
  const [waitingList, setWaitingList] = useState<WaitingPatient[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadWaitingList();
    const interval = setInterval(loadWaitingList, 30000); // تحديث كل 30 ثانية
    return () => clearInterval(interval);
  }, []);

  async function loadWaitingList() {
    try {
      const res = await apiClient.get("/triage/waiting");
      setWaitingList(res.data);
    } catch (err) {
      console.error("Failed to load waiting list", err);
    }
  }

  const getWaitTime = (arrivedAt: string) => {
    const diff = Date.now() - new Date(arrivedAt).getTime();
    const minutes = Math.floor(diff / 60000);
    return minutes;
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">
            شاشة فرز الطوارئ (Live Triage Board)
          </h1>
          <p className="text-slate-400">قائمة المرضى بانتظار الفرز أو الطبيب</p>
        </div>
        <div className="bg-slate-800 px-4 py-2 rounded-lg text-slate-300">
          العدد في الانتظار: <span className="font-bold text-white">{waitingList.length}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {waitingList.map((encounter) => {
          const waitMinutes = getWaitTime(encounter.createdAt);
          const needsTriage = encounter._count.triageAssessments === 0;

          return (
            <div
              key={encounter.id}
              onClick={() => navigate(`/clinical/triage/assess/${encounter.id}`)}
              className={`
                relative p-5 rounded-xl border cursor-pointer transition-all hover:scale-[1.02]
                ${
                  needsTriage
                    ? "bg-slate-900 border-l-4 border-l-amber-500 border-slate-700"
                    : "bg-slate-900 border-l-4 border-l-emerald-500 border-slate-700"
                }
              `}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                    <UserIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">
                      {encounter.patient.fullName}
                    </h3>
                    <div className="text-xs text-slate-500 font-mono">
                      MRN: {encounter.patient.mrn}
                    </div>
                  </div>
                </div>
                {waitMinutes > 30 && (
                  <ExclamationTriangleIcon className="w-5 h-5 text-red-500 animate-pulse" />
                )}
              </div>

              <div className="flex items-center justify-between text-sm mt-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <ClockIcon className="w-4 h-4" />
                  <span>انتظار: {waitMinutes} دقيقة</span>
                </div>
                {needsTriage ? (
                  <span className="bg-amber-500/10 text-amber-500 px-2 py-1 rounded text-xs font-bold">
                    بانتظار الفرز
                  </span>
                ) : (
                  <span className="bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded text-xs">
                    تم الفرز
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {waitingList.length === 0 && (
          <div className="col-span-full py-20 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
            لا يوجد مرضى في الانتظار حالياً
          </div>
        )}
      </div>
    </div>
  );
}
