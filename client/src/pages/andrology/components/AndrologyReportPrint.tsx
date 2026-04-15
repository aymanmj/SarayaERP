import { PatientInfo, SemenAnalysis, HormoneTest, AndrologySurgery, AndrologyMedication, AndrologyVisit } from "../types";

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
  
  const handlePrint = () => {
    window.print();
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("en-GB") : "—";
  const fmtNum = (n?: number | null) => n != null ? Number(n).toFixed(1) : "—";

  const latestVisit = visits[0];

  return (
    <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center overflow-y-auto">
      {/* Action Bar (Not printable) */}
      <div className="w-full bg-slate-900 border-b border-slate-700 p-4 sticky top-0 z-10 flex justify-between items-center print:hidden">
        <h2 className="text-white font-bold">📄 Medical Report Preview</h2>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-lg text-sm">Cancel</button>
          <button onClick={handlePrint} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20">🖨️ Print Report</button>
        </div>
      </div>

      {/* A4 Paper Container */}
      <div className="bg-white w-full max-w-[210mm] min-h-[297mm] my-8 shadow-2xl p-12 text-slate-900 print:my-0 print:shadow-none print:p-8" dir="ltr" style={{ direction: 'ltr', color: '#000' }}>
        
        {/* Header */}
        <div className="flex justify-between items-end border-b-2 border-slate-800 pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Medical Report</h1>
            <h2 className="text-sm font-bold text-slate-500 tracking-widest mt-1">DEPARTMENT OF ANDROLOGY</h2>
          </div>
          <div className="text-right">
            <h3 className="text-xl font-bold text-blue-900">Saraya Medical Center</h3>
            <p className="text-xs text-slate-500 mt-1">123 Health Avenue, Medical District</p>
            <p className="text-xs text-slate-500">Date: {new Date().toLocaleDateString('en-GB')}</p>
          </div>
        </div>

        {/* Patient Info */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-8 grid grid-cols-2 gap-4 text-sm">
          <div><span className="font-bold text-slate-500">Patient Name:</span> <span className="font-medium text-slate-900">{patient.fullName}</span></div>
          <div><span className="font-bold text-slate-500">MRN:</span> <span className="font-mono font-medium text-slate-900">{patient.mrn}</span></div>
          <div><span className="font-bold text-slate-500">Phone:</span> <span className="font-medium text-slate-900">{patient.phone || "—"}</span></div>
          <div><span className="font-bold text-slate-500">Ref Doctor:</span> <span className="font-medium text-slate-900">Dr. Clinic</span></div>
        </div>

        {/* Main Diagnosis */}
        {latestVisit && (
          <div className="mb-8">
            <h3 className="text-lg font-bold border-b border-slate-300 pb-2 mb-3 uppercase tracking-wider text-slate-800">1. Clinical Overview</h3>
            <div className="p-4 bg-slate-50 rounded-lg text-sm">
              <div className="mb-3"><span className="font-bold">Primary Diagnosis: </span>{latestVisit.diagnosis || "Under Evaluation"}</div>
              {latestVisit.chiefComplaint && <div className="mb-3"><span className="font-bold">Chief Complaint: </span>{latestVisit.chiefComplaint}</div>}
              {latestVisit.treatmentPlan && <div><span className="font-bold">Proposed Plan: </span>{latestVisit.treatmentPlan}</div>}
            </div>
          </div>
        )}

        {/* Semen Analyses Summary */}
        {analyses.length > 0 && (
          <div className="mb-8 items-start page-break-inside-avoid">
            <h3 className="text-lg font-bold border-b border-slate-300 pb-2 mb-3 uppercase tracking-wider text-slate-800">2. Semen Analysis History</h3>
            <table className="w-full text-left text-xs border border-slate-200">
              <thead className="bg-slate-100 font-bold">
                <tr>
                  <th className="p-2 border-b border-slate-200">Date</th>
                  <th className="p-2 border-b border-slate-200">Vol (ml)</th>
                  <th className="p-2 border-b border-slate-200">Conc. (M/ml)</th>
                  <th className="p-2 border-b border-slate-200">PR+NP (%)</th>
                  <th className="p-2 border-b border-slate-200">Normal (%)</th>
                  <th className="p-2 border-b border-slate-200">Classification</th>
                </tr>
              </thead>
              <tbody>
                {analyses.slice(0, 3).map((a, i) => (
                  <tr key={a.id || i} className="border-b border-slate-100">
                    <td className="p-2">{fmtDate(a.sampleDate)}</td>
                    <td className="p-2">{fmtNum(a.volumeMl)}</td>
                    <td className="p-2">{fmtNum(a.countMilPerMl)}</td>
                    <td className="p-2">{fmtNum(a.totalMotility)}</td>
                    <td className="p-2">{fmtNum(a.normalForms)}</td>
                    <td className="p-2 font-medium">{a.autoClassification || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Hormonal Profile */}
        {hormones.length > 0 && (
          <div className="mb-8 items-start page-break-inside-avoid">
            <h3 className="text-lg font-bold border-b border-slate-300 pb-2 mb-3 uppercase tracking-wider text-slate-800">3. Hormonal Profile</h3>
            <table className="w-full text-left text-xs border border-slate-200">
              <thead className="bg-slate-100 font-bold">
                <tr>
                  <th className="p-2 border-b border-slate-200">Date</th>
                  <th className="p-2 border-b border-slate-200">FSH (mIU/mL)</th>
                  <th className="p-2 border-b border-slate-200">LH (mIU/mL)</th>
                  <th className="p-2 border-b border-slate-200">Testosterone (ng/dL)</th>
                  <th className="p-2 border-b border-slate-200">Prolactin (ng/mL)</th>
                </tr>
              </thead>
              <tbody>
                {hormones.slice(0, 3).map((h, i) => (
                  <tr key={h.id || i} className="border-b border-slate-100">
                    <td className="p-2">{fmtDate(h.testDate)}</td>
                    <td className="p-2">{fmtNum(h.fsh)}</td>
                    <td className="p-2">{fmtNum(h.lh)}</td>
                    <td className="p-2">{fmtNum(h.totalTestosterone)}</td>
                    <td className="p-2">{fmtNum(h.prolactin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Surgical History */}
        {surgeries.length > 0 && (
          <div className="mb-8 items-start page-break-inside-avoid">
            <h3 className="text-lg font-bold border-b border-slate-300 pb-2 mb-3 uppercase tracking-wider text-slate-800">4. Surgical History</h3>
            <div className="space-y-4">
              {surgeries.map(s => (
                <div key={s.id} className="text-sm">
                  <div className="font-bold flex justify-between">
                    <span>{s.procedure}</span>
                    <span className="text-slate-500 font-normal text-xs">{fmtDate(s.surgeryDate)}</span>
                  </div>
                  {s.technique && <div className="text-xs text-slate-600 mt-1">Technique: {s.technique}</div>}
                  {s.findings && <div className="text-xs text-slate-600 mt-1">Findings: {s.findings}</div>}
                  <div className="text-xs font-medium text-slate-800 mt-1">Outcome: {s.outcome || (s.spermRetrieved ? "Successful Sperm Retrieval" : "No Sperm Retrieved")}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Medications */}
        {medications.length > 0 && (
          <div className="mb-8 items-start page-break-inside-avoid">
            <h3 className="text-lg font-bold border-b border-slate-300 pb-2 mb-3 uppercase tracking-wider text-slate-800">5. Pharmacological Therapy</h3>
            <ul className="list-disc pl-5 text-sm space-y-2">
              {medications.map(m => (
                <li key={m.id}>
                  <span className="font-bold">{m.medication}</span> 
                  {m.dose && ` - ${m.dose}`}
                  {m.frequency && ` (${m.frequency})`}
                  <div className="text-xs text-slate-500 mt-0.5">Started: {fmtDate(m.startDate)}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-16 pt-8 border-t border-slate-300 flex justify-end page-break-inside-avoid">
          <div className="text-center w-64">
            <div className="border-b border-slate-400 h-8 mb-2"></div>
            <p className="text-sm font-bold">Consultant Signature</p>
            <p className="text-xs text-slate-500">Andrology & Reproductive Medicine</p>
          </div>
        </div>

      </div>
    </div>
  );
}
