import { useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { Search, Loader2, KeyRound, CheckCircle2, ShieldAlert } from "lucide-react";

interface MpiSearchModalProps {
  onClose: () => void;
}

export function MpiSearchModal({ onClose }: MpiSearchModalProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);

  // OTP State
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    setResults([]);
    setSelectedPatientId(null);
    setOtpRequired(false);
    setOtpSuccess(false);

    try {
      // Calls the MPI Search endpoint
      const res = await apiClient.get("/mpi/search", { params: { query } });
      
      // If the backend returns 403 or specific status indicating OTP required
      // But based on backend, search returns data but might mask it or return a flag.
      // Wait, in mpi.service.ts, searchMpi returns the patient and flags.
      // Let's assume it returns an array of patients.
      if (Array.isArray(res.data)) {
         setResults(res.data);
      } else if (res.data.data) {
         setResults(res.data.data);
      } else {
         setResults([res.data]); // fallback
      }
    } catch (err: any) {
      toast.error("حدث خطأ أثناء البحث في الشبكة");
    } finally {
      setLoading(false);
    }
  };

  const requestOtp = async (patientId: number) => {
    setSelectedPatientId(patientId);
    setOtpLoading(true);
    try {
      await apiClient.post("/mpi/consent/trigger", { targetPatientId: patientId });
      toast.success("تم إرسال رمز التحقق (OTP) للمريض بنجاح");
      setOtpRequired(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "فشل إرسال رمز التحقق");
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpCode || !selectedPatientId) return;
    setOtpLoading(true);
    try {
      await apiClient.post("/mpi/consent/verify", { 
        targetPatientId: selectedPatientId,
        otpCode 
      });
      toast.success("تم التحقق بنجاح! السجل الطبي متاح الآن.");
      setOtpSuccess(true);
      setOtpRequired(false);
      // Re-fetch search results to show full data now
      await handleSearch({ preventDefault: () => {} } as React.FormEvent);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "رمز التحقق غير صحيح أو منتهي الصلاحية");
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose} dir="rtl">
      <div className="bg-slate-950 border border-slate-700 w-full max-w-3xl rounded-3xl shadow-2xl p-6 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-sky-400" />
              البحث الإقليمي الموحد (MPI Federation)
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              ابحث عن سجلات المريض في جميع المستشفيات المرتبطة بالشبكة الوطنية.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center">✕</button>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex gap-3 mb-6">
          <input
            autoFocus
            type="text"
            placeholder="أدخل الرقم الوطني، رقم الجوال، أو رقم الملف..."
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none text-white"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button 
            type="submit"
            disabled={loading || !query.trim()}
            className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            بحث
          </button>
        </form>

        {/* Results */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
          {!searched && !loading && (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 space-y-3">
              <ShieldAlert className="w-10 h-10 opacity-20" />
              <p>البيانات المعروضة تخضع لسياسات الخصوصية. قد يتطلب عرض الملف موافقة المريض.</p>
            </div>
          )}

          {searched && !loading && results.length === 0 && (
            <div className="text-center py-10 text-slate-400">
              لا توجد نتائج مطابقة في الشبكة الإقليمية.
            </div>
          )}

          {results.map((patient: any) => {
            const needsOtp = patient.requiresOtp && !otpSuccess;
            
            return (
              <div key={patient.id || patient.nationalId} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      {patient.fullName}
                      {patient.hospitalName && (
                        <span className="text-[10px] bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800/50">
                          {patient.hospitalName}
                        </span>
                      )}
                    </h3>
                    <div className="flex gap-4 mt-2 text-sm text-slate-400">
                      <span>الرقم الوطني: {patient.nationalId || "—"}</span>
                      <span>الهاتف: {needsOtp ? "*********" : (patient.phone || "—")}</span>
                      <span>تاريخ الميلاد: {patient.dateOfBirth?.split('T')[0] || "—"}</span>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div>
                    {needsOtp ? (
                      <button 
                        onClick={() => requestOtp(patient.id)}
                        disabled={otpLoading && selectedPatientId === patient.id}
                        className="bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 border border-rose-800/50 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
                      >
                        {otpLoading && selectedPatientId === patient.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <KeyRound className="w-4 h-4" />
                        )}
                        طلب موافقة المريض (OTP)
                      </button>
                    ) : (
                      <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20">
                        <CheckCircle2 className="w-4 h-4" />
                        عرض الملف الطبي (مُصرح)
                      </button>
                    )}
                  </div>
                </div>

                {/* OTP Input Section */}
                {otpRequired && selectedPatientId === patient.id && !otpSuccess && (
                  <div className="mt-4 pt-4 border-t border-rose-900/30 flex items-center gap-3 bg-rose-950/20 p-4 rounded-xl">
                    <div className="flex-1">
                      <p className="text-xs text-rose-300 mb-1 font-medium">أدخل رمز التحقق (OTP) المرسل لهاتف المريض:</p>
                      <input 
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        className="bg-slate-950 border border-rose-900/50 rounded-lg px-4 py-2 text-center tracking-[0.5em] font-mono text-white focus:border-rose-500 outline-none w-48"
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value)}
                      />
                    </div>
                    <button 
                      onClick={verifyOtp}
                      disabled={otpCode.length < 6 || otpLoading}
                      className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold mt-4 transition-all flex items-center gap-2"
                    >
                      {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      تحقق
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
