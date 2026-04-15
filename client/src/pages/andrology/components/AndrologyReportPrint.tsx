import { useEffect, useState } from "react";
import { apiClient } from "../../../api/apiClient";
import { PatientInfo, SemenAnalysis, HormoneTest, AndrologySurgery, AndrologyMedication, AndrologyVisit } from "../types";

type OrgSettings = {
  displayName?: string;
  legalName?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
};

type Props = {
  patient: PatientInfo;
  analyses: SemenAnalysis[];
  hormones: HormoneTest[];
  surgeries: AndrologySurgery[];
  medications: AndrologyMedication[];
  visits: AndrologyVisit[];
  onClose: () => void;
};

export default function AndrologyReportPrint({ patient, analyses, hormones, surgeries, medications, visits, onClose }: Props) {
  const [org, setOrg] = useState<OrgSettings | null>(null);

  useEffect(() => {
    apiClient.get("/settings/organization").then(r => setOrg(r.data)).catch(() => {});
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("en-GB") : "—";
  const fmtNum = (n?: number | null) => n != null ? Number(n).toFixed(1) : "—";

  const latestVisit = visits[0];
  const hospitalName = org?.displayName || org?.legalName || "Medical Center";
  const hospitalAddress = org?.address || "";
  const hospitalPhone = org?.phone || "";
  const hospitalEmail = org?.email || "";
  const hospitalLogo = org?.logo || "/sarayalogo.png";

  return (
    <>
      {/* Print-specific styles */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm 10mm;
          }
          body > *:not(.andrology-report-overlay) {
            display: none !important;
          }
          .andrology-report-overlay {
            position: static !important;
            background: white !important;
          }
          .andrology-report-overlay .print-hidden {
            display: none !important;
          }
          .andrology-report-overlay .report-paper {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            min-height: auto !important;
          }
        }
      `}</style>

      <div className="andrology-report-overlay fixed inset-0 bg-black/90 z-[100] flex flex-col items-center overflow-y-auto">
        {/* Action Bar (Not printable) */}
        <div className="print-hidden w-full bg-slate-900 border-b border-slate-700 p-4 sticky top-0 z-10 flex justify-between items-center">
          <h2 className="text-white font-bold">📄 Medical Report Preview</h2>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-lg text-sm">Cancel</button>
            <button onClick={handlePrint} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20">🖨️ Print Report</button>
          </div>
        </div>

        {/* A4 Paper Container */}
        <div className="report-paper bg-white w-full max-w-[210mm] my-8 shadow-2xl px-10 pt-8 pb-6 text-slate-900" dir="ltr" style={{ direction: 'ltr', color: '#000' }}>
          
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-800 pb-5 mb-6">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Medical Report</h1>
              <h2 className="text-xs font-bold text-slate-500 tracking-widest mt-1">DEPARTMENT OF ANDROLOGY & REPRODUCTIVE MEDICINE</h2>
            </div>
            <div className="text-right flex items-start gap-3">
              <div>
                <h3 className="text-lg font-bold text-blue-900">{hospitalName}</h3>
                {hospitalAddress && <p className="text-[10px] text-slate-500 mt-0.5 max-w-[200px]">{hospitalAddress}</p>}
                {hospitalPhone && <p className="text-[10px] text-slate-500">Tel: {hospitalPhone}</p>}
                {hospitalEmail && <p className="text-[10px] text-slate-500">{hospitalEmail}</p>}
                <p className="text-[10px] text-slate-400 mt-1">Date: {new Date().toLocaleDateString('en-GB')}</p>
              </div>
              <img src={hospitalLogo} alt="Logo" className="w-14 h-14 object-contain rounded-lg border border-slate-200" onError={(e) => { (e.target as HTMLImageElement).src = '/sarayalogo.png'; }} />
            </div>
          </div>

          {/* Patient Info */}
          <div className="bg-slate-50 px-4 py-3 rounded-lg border border-slate-200 mb-5 grid grid-cols-2 gap-3 text-xs">
            <div><span className="font-bold text-slate-500">Patient Name:</span> <span className="font-medium text-slate-900">{patient.fullName}</span></div>
            <div><span className="font-bold text-slate-500">MRN:</span> <span className="font-mono font-medium text-slate-900">{patient.mrn}</span></div>
            <div><span className="font-bold text-slate-500">Phone:</span> <span className="font-medium text-slate-900">{patient.phone || "—"}</span></div>
            <div><span className="font-bold text-slate-500">Report Date:</span> <span className="font-medium text-slate-900">{new Date().toLocaleDateString('en-GB')}</span></div>
          </div>

          {/* Main Diagnosis */}
          {latestVisit && (
            <div className="mb-5">
              <h3 className="text-sm font-bold border-b border-slate-300 pb-1.5 mb-2 uppercase tracking-wider text-slate-800">1. Clinical Overview</h3>
              <div className="px-3 py-2 bg-slate-50 rounded-lg text-xs leading-relaxed">
                <div className="mb-1.5"><span className="font-bold">Primary Diagnosis: </span>{latestVisit.diagnosis || "Under Evaluation"}</div>
                {latestVisit.chiefComplaint && <div className="mb-1.5"><span className="font-bold">Chief Complaint: </span>{latestVisit.chiefComplaint}</div>}
                {latestVisit.treatmentPlan && <div><span className="font-bold">Proposed Plan: </span>{latestVisit.treatmentPlan}</div>}
              </div>
            </div>
          )}

          {/* Semen Analyses Summary */}
          {analyses.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-bold border-b border-slate-300 pb-1.5 mb-2 uppercase tracking-wider text-slate-800">
                {latestVisit ? '2' : '1'}. Semen Analysis History
              </h3>
              <table className="w-full text-left text-[10px] border border-slate-200">
                <thead className="bg-slate-100 font-bold">
                  <tr>
                    <th className="p-1.5 border-b border-slate-200">Date</th>
                    <th className="p-1.5 border-b border-slate-200">Vol (ml)</th>
                    <th className="p-1.5 border-b border-slate-200">Conc. (M/ml)</th>
                    <th className="p-1.5 border-b border-slate-200">PR+NP (%)</th>
                    <th className="p-1.5 border-b border-slate-200">Normal (%)</th>
                    <th className="p-1.5 border-b border-slate-200">Classification</th>
                  </tr>
                </thead>
                <tbody>
                  {analyses.slice(0, 4).map((a, i) => (
                    <tr key={a.id || i} className="border-b border-slate-100">
                      <td className="p-1.5">{fmtDate(a.sampleDate)}</td>
                      <td className="p-1.5">{fmtNum(a.volumeMl)}</td>
                      <td className="p-1.5">{fmtNum(a.countMilPerMl)}</td>
                      <td className="p-1.5">{fmtNum(a.totalMotility)}</td>
                      <td className="p-1.5">{fmtNum(a.normalForms)}</td>
                      <td className="p-1.5 font-medium">{a.autoClassification || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Hormonal Profile */}
          {hormones.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-bold border-b border-slate-300 pb-1.5 mb-2 uppercase tracking-wider text-slate-800">
                {latestVisit ? (analyses.length > 0 ? '3' : '2') : (analyses.length > 0 ? '2' : '1')}. Hormonal Profile
              </h3>
              <table className="w-full text-left text-[10px] border border-slate-200">
                <thead className="bg-slate-100 font-bold">
                  <tr>
                    <th className="p-1.5 border-b border-slate-200">Date</th>
                    <th className="p-1.5 border-b border-slate-200">FSH (mIU/mL)</th>
                    <th className="p-1.5 border-b border-slate-200">LH (mIU/mL)</th>
                    <th className="p-1.5 border-b border-slate-200">Testosterone (ng/dL)</th>
                    <th className="p-1.5 border-b border-slate-200">Prolactin (ng/mL)</th>
                  </tr>
                </thead>
                <tbody>
                  {hormones.slice(0, 4).map((h, i) => (
                    <tr key={h.id || i} className="border-b border-slate-100">
                      <td className="p-1.5">{fmtDate(h.testDate)}</td>
                      <td className="p-1.5">{fmtNum(h.fsh)}</td>
                      <td className="p-1.5">{fmtNum(h.lh)}</td>
                      <td className="p-1.5">{fmtNum(h.totalTestosterone)}</td>
                      <td className="p-1.5">{fmtNum(h.prolactin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Surgical History */}
          {surgeries.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-bold border-b border-slate-300 pb-1.5 mb-2 uppercase tracking-wider text-slate-800">Surgical History</h3>
              <div className="space-y-2">
                {surgeries.map(s => (
                  <div key={s.id} className="text-[11px] bg-slate-50 p-2 rounded-lg">
                    <div className="font-bold flex justify-between">
                      <span>{s.procedure}</span>
                      <span className="text-slate-500 font-normal text-[10px]">{fmtDate(s.surgeryDate)}</span>
                    </div>
                    {s.technique && <div className="text-[10px] text-slate-600 mt-0.5">Technique: {s.technique}</div>}
                    <div className="text-[10px] font-medium text-slate-800 mt-0.5">Outcome: {s.outcome || (s.spermRetrieved ? "Successful Sperm Retrieval ✓" : "No Sperm Retrieved")}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Medications */}
          {medications.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-bold border-b border-slate-300 pb-1.5 mb-2 uppercase tracking-wider text-slate-800">Pharmacological Therapy</h3>
              <ul className="list-disc pl-5 text-[11px] space-y-1">
                {medications.map(m => (
                  <li key={m.id}>
                    <span className="font-bold">{m.medication}</span> 
                    {m.dose && ` — ${m.dose}`}
                    {m.frequency && ` (${m.frequency})`}
                    <span className="text-slate-500 ml-2">Started: {fmtDate(m.startDate)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Signature area */}
          <div className="mt-10 pt-5 border-t border-slate-300 flex justify-end">
            <div className="text-center w-56">
              <div className="border-b border-slate-400 h-6 mb-1.5"></div>
              <p className="text-xs font-bold">Consultant Signature</p>
              <p className="text-[9px] text-slate-500">Andrology & Reproductive Medicine</p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 text-center text-[8px] text-slate-400">
            Generated electronically by Saraya Medical ERP • {new Date().toLocaleDateString('en-GB')}
          </div>

        </div>
      </div>
    </>
  );
}
