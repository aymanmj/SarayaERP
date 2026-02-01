// src/pages/clinical/triage/TriageAssessmentForm.tsx

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../../../api/apiClient";
import {
  HeartIcon,
  ExclamationTriangleIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/outline";

export function TriageAssessmentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [patientName, setPatientName] = useState("");

  const [vitals, setVitals] = useState({
    heartRate: "",
    respRate: "",
    o2Sat: "",
    painScore: "0",
    bpSystolic: "",
    bpDiastolic: "",
    temperature: "",
  });

  const [chiefComplaint, setChiefComplaint] = useState("");
  const [suggestedLevel, setSuggestedLevel] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string>("");

  useEffect(() => {
    // Load patient basics
    apiClient.get(`/encounters/${id}`).then((res) => {
      setPatientName(res.data.patient.fullName);
    });
  }, [id]);

  // Smart Suggestion Logic Hook
  useEffect(() => {
    const timer = setTimeout(() => {
      if (vitals.heartRate || vitals.o2Sat || vitals.respRate) {
        checkSuggestion();
      }
    }, 1000); // Debounce
    return () => clearTimeout(timer);
  }, [vitals]);

  async function checkSuggestion() {
    try {
      const res = await apiClient.post("/triage/suggest", {
        vitals: {
          heartRate: Number(vitals.heartRate),
          respRate: Number(vitals.respRate),
          o2Sat: Number(vitals.o2Sat),
          painScore: Number(vitals.painScore),
        },
      });
      setSuggestedLevel(res.data.suggestedLevel);
      // Auto-select if not manually overridden
      if (!selectedLevel) {
        setSelectedLevel(res.data.suggestedLevel);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.post("/triage/assess", {
        encounterId: id,
        level: selectedLevel,
        chiefComplaint,
        vitals: {
          heartRate: Number(vitals.heartRate),
          respRate: Number(vitals.respRate),
          o2Sat: Number(vitals.o2Sat),
          painScore: Number(vitals.painScore),
          bpSystolic: Number(vitals.bpSystolic),
          bpDiastolic: Number(vitals.bpDiastolic),
          temperature: Number(vitals.temperature),
        },
      });
      navigate("/triage"); // Back to board
    } catch (err) {
      alert("Failed to save assessment");
    } finally {
      setLoading(false);
    }
  }

  const levels = [
    { id: "RESUSCITATION", label: "مستوى 1 - إنعاش (Resuscitation)", color: "bg-red-600" },
    { id: "EMERGENT", label: "مستوى 2 - طارئ جداً (Emergent)", color: "bg-orange-500" },
    { id: "URGENT", label: "مستوى 3 - عاجل (Urgent)", color: "bg-yellow-500 text-black" },
    { id: "LESS_URGENT", label: "مستوى 4 - أقل استعجالاً", color: "bg-green-600" },
    { id: "NON_URGENT", label: "مستوى 5 - غير عاجل", color: "bg-blue-600" },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-white mb-6">
        فرز المريض: <span className="text-sky-400">{patientName}</span>
      </h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Vitals Section */}
        <div className="space-y-4 bg-slate-900 p-6 rounded-xl border border-slate-800">
          <h2 className="font-bold text-lg text-slate-300 flex items-center gap-2">
            <HeartIcon className="w-5 h-5" /> العلامات الحيوية
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">النبض (HR)</label>
              <input
                name="vitalSigns.heartRate"
                type="number"
                value={vitals.heartRate}
                onChange={(e) => setVitals({ ...vitals, heartRate: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white"
                placeholder="bpm"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">الأكسجين (SpO2)</label>
              <input
                name="vitalSigns.oxygenSaturation"
                type="number"
                value={vitals.o2Sat}
                onChange={(e) => setVitals({ ...vitals, o2Sat: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white"
                placeholder="%"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">التنفس (RR)</label>
              <input
                name="vitalSigns.respRate"
                type="number"
                value={vitals.respRate}
                onChange={(e) => setVitals({ ...vitals, respRate: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white"
                placeholder="bpm"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">مقياس الألم (0-10)</label>
              <input
                name="vitalSigns.painScore"
                type="number"
                max="10"
                value={vitals.painScore}
                onChange={(e) => setVitals({ ...vitals, painScore: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">الضغط (SYS)</label>
              <input
                name="vitalSigns.bloodPressureSystolic"
                type="number"
                value={vitals.bpSystolic}
                onChange={(e) => setVitals({ ...vitals, bpSystolic: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">الضغط (DIA)</label>
              <input
                name="vitalSigns.bloodPressureDiastolic"
                type="number"
                value={vitals.bpDiastolic}
                onChange={(e) => setVitals({ ...vitals, bpDiastolic: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white"
              />
            </div>
            <div>
               <label className="block text-sm text-slate-400 mb-1">الحرارة (Temp)</label>
               <input
                 name="vitalSigns.temperature"
                 type="number"
                 step="0.1"
                 value={vitals.temperature}
                 onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })}
                 className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white"
               />
            </div>
          </div>
        </div>

        {/* Triage Level & Complaint */}
        <div className="space-y-6">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <h2 className="font-bold text-lg text-slate-300 mb-4">الشكوى والمستوى</h2>
            
            <textarea
              name="chiefComplaint"
              className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white h-24 mb-6"
              placeholder="الشكوى الرئيسية (Chief Complaint)..."
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              required
            ></textarea>

            {suggestedLevel && (
              <div className="mb-4 p-3 bg-sky-900/30 border border-sky-500/30 rounded-lg flex items-center gap-3">
                <ExclamationTriangleIcon className="w-6 h-6 text-sky-400" />
                <div>
                  <div className="text-xs text-sky-400 uppercase font-bold">اقتراح النظام الذكي</div>
                  <div className="text-white font-bold">{suggestedLevel}</div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm text-slate-400">مستوى الخطورة</label>
              <div className="space-y-2">
                {levels.map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setSelectedLevel(lvl.id)}
                    className={`
                      w-full p-3 rounded-lg text-right transition-all flex justify-between items-center
                      ${selectedLevel === lvl.id ? lvl.color + " ring-2 ring-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}
                    `}
                  >
                    <span>{lvl.label}</span>
                    {selectedLevel === lvl.id && <CheckBadgeIcon className="w-5 h-5" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !selectedLevel}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "جاري الحفظ..." : "حفظ التقييم (Save Assessment)"}
          </button>
        </div>
      </form>
    </div>
  );
}
