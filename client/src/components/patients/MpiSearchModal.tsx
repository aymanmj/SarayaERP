import { useState } from "react";
import { apiClient } from "../../api/apiClient";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  KeyRound,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CheckCircle2,
  ShieldAlert,
  Building2,
  Lock,
  Unlock,
  Send,
} from "lucide-react";

interface Facility {
  hospitalId: number;
  hospitalName: string;
  status: "REQUIRES_OTP" | "ACCESSIBLE";
  patientId?: number;
  localMrn?: string;
  fhirReference?: string;
}

interface GlobalPatient {
  globalId: number;
  fullName: string;
  nationalId: string;
  dateOfBirth: string;
  gender: string;
  facilities: Facility[];
}

interface MpiSearchModalProps {
  onClose: () => void;
}

export function MpiSearchModal({ onClose }: MpiSearchModalProps) {
  const navigate = useNavigate();
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalPatient[]>([]);
  const [searched, setSearched] = useState(false);

  // OTP State
  const [otpTarget, setOtpTarget] = useState<{
    patientId: number;
    facilityIndex: string;
  } | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifiedFacilities, setVerifiedFacilities] = useState<Set<string>>(
    new Set()
  );
  const [fhirReferences, setFhirReferences] = useState<Record<string, string>>({});

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!nationalId.trim() && !phone.trim()) {
      toast.warning("أدخل الرقم الوطني أو رقم الهاتف للبحث");
      return;
    }

    setLoading(true);
    setSearched(true);
    setResults([]);
    setOtpTarget(null);
    setOtpSent(false);
    setOtpCode("");

    try {
      const params: Record<string, string> = {};
      if (nationalId.trim()) params.nationalId = nationalId.trim();
      if (phone.trim()) params.phone = phone.trim();

      const res = await apiClient.get("/mpi/search", { params });

      if (Array.isArray(res.data)) {
        setResults(res.data);
      } else {
        setResults([]);
      }
     
    } catch (err: any) {
      if (err.response?.status === 403) {
        toast.error(
          err.response.data.message ||
            "تبادل البيانات معطّل بواسطة سياسات المؤسسة"
        );
      } else {
        toast.error("حدث خطأ أثناء البحث في الشبكة");
      }
    } finally {
      setLoading(false);
    }
  };

  const requestOtp = async (patientId: number, facilityKey: string) => {
    setOtpTarget({ patientId, facilityIndex: facilityKey });
    setOtpLoading(true);
    setOtpSent(false);
    setOtpCode("");
    try {
      await apiClient.post(`/mpi/consent/trigger?patientId=${patientId}`);
      toast.success("تم إرسال رمز التحقق (OTP) للمريض بنجاح");
      setOtpSent(true);
     
    } catch (err: any) {
      if (err.response?.status === 400) {
        toast.warning(
          err.response.data.message || "يرجى الانتظار قبل طلب رمز جديد"
        );
      } else {
        toast.error(err.response?.data?.message || "فشل إرسال رمز التحقق");
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpCode || !otpTarget) return;
    setOtpLoading(true);
    try {
      const res = await apiClient.post(
        `/mpi/consent/verify?patientId=${otpTarget.patientId}&otp=${otpCode}`
      );
      toast.success("تم التحقق بنجاح! السجل الطبي متاح الآن.");

      // Mark this facility as verified
      setVerifiedFacilities((prev) => {
        const next = new Set(prev);
        next.add(otpTarget.facilityIndex);
        return next;
      });
      if (res.data?.fhirReference) {
        setFhirReferences((prev) => ({
          ...prev,
          [otpTarget.facilityIndex]: res.data.fhirReference,
        }));
      }

      setOtpTarget(null);
      setOtpSent(false);
      setOtpCode("");
     
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || "رمز التحقق غير صحيح أو منتهي الصلاحية"
      );
    } finally {
      setOtpLoading(false);
    }
  };

  const getFacilityKey = (globalId: number, hospitalId: number) =>
    `${globalId}-${hospitalId}`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-slate-950 border border-slate-700 w-full max-w-3xl rounded-3xl shadow-2xl p-6 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-sky-400" />
              البحث الإقليمي الموحد (MPI Federation)
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              ابحث عن سجلات المريض في جميع المستشفيات المرتبطة بالشبكة.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="flex gap-3 mb-6">
          <input
            autoFocus
            type="text"
            placeholder="الرقم الوطني / رقم الهوية..."
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none text-white"
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
          />
          <input
            type="text"
            placeholder="رقم الجوال (اختياري)..."
            className="w-48 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none text-white"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || (!nationalId.trim() && !phone.trim())}
            className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            بحث
          </button>
        </form>

        {/* Results */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
          {!searched && !loading && (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 space-y-3">
              <ShieldAlert className="w-10 h-10 opacity-20" />
              <p className="text-sm text-center">
                البيانات المعروضة تخضع لسياسات الخصوصية.
                <br />
                قد يتطلب عرض الملف موافقة المريض عبر رمز OTP.
              </p>
            </div>
          )}

          {searched && !loading && results.length === 0 && (
            <div className="text-center py-10 text-slate-400">
              لا توجد نتائج مطابقة في الشبكة الإقليمية.
            </div>
          )}

          {results.map((patient) => (
            <div
              key={patient.globalId}
              className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5"
            >
              {/* Patient Info */}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-white">
                  {patient.fullName}
                </h3>
                <div className="flex gap-6 mt-2 text-sm text-slate-400">
                  <span>الرقم الوطني: {patient.nationalId || "—"}</span>
                  <span>
                    تاريخ الميلاد:{" "}
                    {patient.dateOfBirth?.split("T")[0] || "—"}
                  </span>
                  <span>الجنس: {patient.gender === "MALE" ? "ذكر" : "أنثى"}</span>
                </div>
              </div>

              {/* Facilities */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  المنشآت المرتبطة ({patient.facilities.length})
                </p>
                {patient.facilities.map((facility) => {
                  const fKey = getFacilityKey(
                    patient.globalId,
                    facility.hospitalId
                  );
                  const isVerified = verifiedFacilities.has(fKey);
                  const isOtpTarget =
                    otpTarget?.facilityIndex === fKey;
                  const isAccessible =
                    facility.status === "ACCESSIBLE" || isVerified;

                  return (
                    <div
                      key={fKey}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                        isAccessible
                          ? "bg-emerald-950/20 border-emerald-800/40"
                          : "bg-slate-950/50 border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Building2
                          className={`w-4 h-4 ${isAccessible ? "text-emerald-400" : "text-slate-500"}`}
                        />
                        <div>
                          <span className="text-sm font-bold text-white">
                            {facility.hospitalName}
                          </span>
                          {isAccessible && facility.localMrn && (
                            <span className="text-xs text-slate-400 mr-2">
                              MRN: {facility.localMrn}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isAccessible ? (
                          <button 
                            onClick={() => {
                              const targetPatientId = facility.patientId || otpTarget?.patientId;
                              if (targetPatientId) {
                                onClose();
                                navigate(`/patients/${targetPatientId}/chart`);
                              } else {
                                const refUrl = fhirReferences[fKey] || facility.fhirReference;
                                if (refUrl) window.open(refUrl, '_blank');
                                else toast.error("رابط السجل غير متاح");
                              }
                            }}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-900/20 transition-all"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            عرض السجل
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              requestOtp(facility.patientId!, fKey)
                            }
                            disabled={otpLoading && isOtpTarget}
                            className="bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 border border-rose-800/50 px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                          >
                            {otpLoading && isOtpTarget ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Lock className="w-3.5 h-3.5" />
                            )}
                            طلب موافقة (OTP)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* OTP Input Panel */}
              {otpSent &&
                otpTarget &&
                patient.facilities.some(
                  (f) =>
                    getFacilityKey(patient.globalId, f.hospitalId) ===
                    otpTarget.facilityIndex
                ) && (
                  <div className="mt-4 pt-4 border-t border-rose-900/30 bg-rose-950/20 p-4 rounded-xl">
                    <p className="text-xs text-rose-300 mb-3 font-medium flex items-center gap-2">
                      <KeyRound className="w-4 h-4" />
                      أدخل رمز التحقق (OTP) الذي استلمه المريض:
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        autoFocus
                        className="bg-slate-950 border border-rose-900/50 rounded-lg px-4 py-2.5 text-center tracking-[0.5em] font-mono text-white text-lg focus:border-rose-500 outline-none w-48"
                        value={otpCode}
                        onChange={(e) =>
                          setOtpCode(
                            e.target.value.replace(/\D/g, "").slice(0, 6)
                          )
                        }
                      />
                      <button
                        onClick={verifyOtp}
                        disabled={otpCode.length < 6 || otpLoading}
                        className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                      >
                        {otpLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        تحقق
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-2">
                      صالح لمدة 15 دقيقة • يمكن إعادة الطلب بعد دقيقة واحدة
                    </p>
                  </div>
                )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
