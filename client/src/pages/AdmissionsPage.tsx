import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Users, User, Bed as BedIcon, Stethoscope, AlertTriangle, Activity, Calendar, ShieldAlert, ArrowRight, ArrowLeft, CheckCircle2, Search, X, Shield, PlusCircle, AlertCircle } from "lucide-react";

// Types
type BedStatus = "AVAILABLE" | "OCCUPIED" | "CLEANING" | "MAINTENANCE" | "BLOCKED";

type Bed = {
  id: number;
  bedNumber: string;
  status: BedStatus;
  wardName?: string;
  number?: string;
};

type Room = {
  id: number;
  roomNumber: string;
  beds: Bed[];
};

type Ward = {
  id: number;
  name: string;
  type: string | null;
  gender: string | null;
  rooms: Room[];
};

type PatientLite = {
  id: number;
  fullName: string;
  mrn: string;
};

type DoctorLite = {
  id: number;
  fullName: string;
  departmentId?: number;
};

type PatientsListResponse = {
  items: PatientLite[];
  meta: any;
};

export default function AdmissionsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const navigate = useNavigate();

  // Data State
  const [wards, setWards] = useState<Ward[]>([]);
  const [patients, setPatients] = useState<PatientLite[]>([]);
  const [doctors, setDoctors] = useState<DoctorLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Search filter for patients
  const [patientSearch, setPatientSearch] = useState("");

  // Wizard State
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1
    patientId: "",
    admissionType: "ELECTIVE",
    priority: "MEDIUM",
    admissionReason: "",
    primaryDiagnosis: "",
    // Step 2
    admittingDoctorId: "",
    primaryPhysicianId: "",
    // Step 3
    wardId: "",
    bedId: "",
    // Step 4
    isolationRequired: false,
    isolationType: "NONE",
    expectedDischargeDate: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
  });

  const [selectedBedObj, setSelectedBedObj] = useState<Bed | null>(null);

  // Quick Admission Modal
  const [showQuickModal, setShowQuickModal] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [wardsRes, patientsRes, doctorsRes] = await Promise.all([
          apiClient.get<Ward[]>("/beds/tree"),
          apiClient.get<PatientsListResponse>("/patients?limit=1000"), // Load more for search
          apiClient.get<DoctorLite[]>("/users/doctors-list"),
        ]);
        setWards(wardsRes.data);
        setPatients(patientsRes.data.items);
        setDoctors(doctorsRes.data);
        
        if (wardsRes.data.length > 0) {
            setFormData(prev => ({ ...prev, wardId: wardsRes.data[0].id.toString() }));
        }
      } catch (err) {
        console.error(err);
        toast.error(t("admissions.admitError", "حدث خطأ أثناء تحميل بيانات الإيواء."));
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [t]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const nextStep = () => {
    // Validation
    if (step === 1 && !formData.patientId) return toast.warning(t("admissions.wizard.warnings.selectPatient"));
    if (step === 2 && (!formData.admittingDoctorId || !formData.primaryPhysicianId)) return toast.warning(t("admissions.wizard.warnings.selectTeam"));
    if (step === 3 && !formData.bedId) return toast.warning(t("admissions.wizard.warnings.selectBed"));
    
    setStep(s => Math.min(s + 1, 4));
  };

  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const resetForm = () => {
    setFormData({
      patientId: "", admissionType: "ELECTIVE", priority: "MEDIUM", admissionReason: "", primaryDiagnosis: "",
      admittingDoctorId: "", primaryPhysicianId: "", wardId: wards[0]?.id.toString() || "", bedId: "",
      isolationRequired: false, isolationType: "NONE", expectedDischargeDate: "",
      emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelation: ""
    });
    setSelectedBedObj(null);
    setStep(1);
    setPatientSearch("");
  };

  const handleAdmission = async () => {
    if (!formData.patientId || !formData.bedId || !formData.admittingDoctorId) {
      toast.warning(t("admissions.wizard.warnings.missingData"));
      return;
    }

    setSubmitting(true);
    try {
      const selectedDoctor = doctors.find(d => d.id === Number(formData.admittingDoctorId));
      
      const admissionData = {
        patientId: Number(formData.patientId),
        bedId: Number(formData.bedId),
        admittingDoctorId: Number(formData.admittingDoctorId),
        primaryPhysicianId: Number(formData.primaryPhysicianId),
        departmentId: selectedDoctor?.departmentId || 1,
        admissionType: formData.admissionType,
        priority: formData.priority,
        admissionReason: formData.admissionReason || t("admissions.admitReasonDefault", "دخول إيواء"),
        primaryDiagnosis: formData.primaryDiagnosis,
        isEmergency: formData.admissionType === 'EMERGENCY',
        isolationRequired: formData.isolationRequired,
        isolationType: formData.isolationRequired ? formData.isolationType : "NONE",
        expectedDischargeDate: formData.expectedDischargeDate ? new Date(formData.expectedDischargeDate).toISOString() : undefined,
        emergencyContact: (formData.emergencyContactName || formData.emergencyContactPhone) ? {
            name: formData.emergencyContactName,
            phone: formData.emergencyContactPhone,
            relation: formData.emergencyContactRelation
        } : undefined
      };

      const admissionRes = await apiClient.post("/admissions", admissionData);
      
      if (admissionRes.data.id) {
        toast.success(t("admissions.wizard.success.admit"));
        resetForm();
        const wardsRes = await apiClient.get<Ward[]>("/beds/tree");
        setWards(wardsRes.data);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || t("admissions.admitErrorMsg", "فشل عملية الإيواء."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickEmergencyAdmission = async () => {
    if (!formData.patientId || !formData.bedId || !formData.admittingDoctorId) {
      toast.warning(t("admissions.wizard.warnings.quickMissing"));
      return;
    }
    
    setSubmitting(true);
    try {
      const selectedDoctor = doctors.find(d => d.id === Number(formData.admittingDoctorId));
      const quickAdmissionData = {
        patientId: Number(formData.patientId),
        bedId: Number(formData.bedId),
        admittingDoctorId: Number(formData.admittingDoctorId),
        departmentId: selectedDoctor?.departmentId || 1,
        admissionReason: formData.admissionReason || t("admissions.admitReasonQuick", "حالة طارئة - إيواء سريع"),
        primaryDiagnosis: formData.primaryDiagnosis || t("admissions.wizard.form.typeEmergency"),
      };

      const admissionRes = await apiClient.post("/admissions/quick-admission", quickAdmissionData);
      if (admissionRes.data.id) {
        toast.success(t("admissions.wizard.success.quickAdmit"));
        setShowQuickModal(false);
        resetForm();
        const wardsRes = await apiClient.get<Ward[]>("/beds/tree");
        setWards(wardsRes.data);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || t("admissions.admitErrorMsg", "فشل الإيواء السريع."));
    } finally {
      setSubmitting(false);
    }
  };

  const getBedColor = (status: BedStatus) => {
    switch (status) {
      case "AVAILABLE": return "bg-emerald-600/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-600/40 cursor-pointer";
      case "OCCUPIED": return "bg-rose-900/40 border-rose-700/50 text-rose-400 cursor-not-allowed opacity-80";
      case "CLEANING": return "bg-amber-600/30 border-amber-500/50 text-amber-400 cursor-not-allowed";
      case "MAINTENANCE": return "bg-slate-700/50 border-slate-600 text-slate-400 cursor-not-allowed";
      default: return "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed";
    }
  };

  const filteredPatients = patients.filter(p => 
    p.fullName.toLowerCase().includes(patientSearch.toLowerCase()) || 
    p.mrn.includes(patientSearch)
  ).slice(0, 50); // limit to 50 for performance

  const selectedWard = wards.find(w => w.id.toString() === formData.wardId);

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mb-4"></div>
        <p>{t("admissions.wizard.loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-700/50 shadow-sm backdrop-blur-xl">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent mb-1">
             {t("admissions.wizard.title")}
          </h1>
          <p className="text-sm text-slate-400">
            {t("admissions.wizard.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowQuickModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600/10 text-rose-500 hover:bg-rose-600 hover:text-white border border-rose-600/20 font-semibold transition-all duration-300"
          >
            <AlertCircle className="w-5 h-5" />
            {t("admissions.wizard.btnQuickAdmit")}
          </button>
          <button
            onClick={() => navigate('/admissions/advanced')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-lg shadow-sky-500/20 transition-all duration-300"
          >
            <Activity className="w-5 h-5" />
            {t("admissions.wizard.btnAdvanced")}
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t("admissions.wizard.stats.wards"), value: wards.length, icon: Activity, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: t("admissions.wizard.stats.patients"), value: patients.length, icon: Users, color: "text-purple-400", bg: "bg-purple-500/10" },
          { label: t("admissions.wizard.stats.doctors"), value: doctors.length, icon: Stethoscope, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: t("admissions.wizard.stats.beds"), 
            value: wards.reduce((sum, ward) => sum + ward.rooms.reduce((rs, r) => rs + r.beds.filter(b => b.status === 'AVAILABLE').length, 0), 0), 
            icon: BedIcon, color: "text-sky-400", bg: "bg-sky-500/10" 
          },
        ].map((stat, i) => (
          <div key={i} className="flex items-center gap-4 bg-slate-900/40 rounded-2xl p-4 border border-slate-700/50 hover:bg-slate-800/50 transition-colors">
            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-100">{stat.value}</div>
              <div className="text-sm font-medium text-slate-400">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Wizard Container */}
      <div className="flex-1 bg-slate-900/60 rounded-3xl border border-slate-700/50 overflow-hidden shadow-xl flex flex-col md:flex-row">
        
        {/* Sidebar Stepper */}
        <div className="w-full md:w-64 bg-slate-900 border-b md:border-b-0 md:border-l border-slate-700/50 p-6">
          <div className="flex md:flex-col gap-4 overflow-x-auto md:overflow-visible pb-4 md:pb-0">
            {[
              { num: 1, title: t("admissions.wizard.steps.patient"), icon: User },
              { num: 2, title: t("admissions.wizard.steps.medical"), icon: Stethoscope },
              { num: 3, title: t("admissions.wizard.steps.bed"), icon: BedIcon },
              { num: 4, title: t("admissions.wizard.steps.additional"), icon: AlertTriangle }
            ].map((s) => {
              const isActive = step === s.num;
              const isCompleted = step > s.num;
              return (
                <div key={s.num} className={`flex items-center gap-3 whitespace-nowrap ${isActive ? 'opacity-100' : 'opacity-50'}`}>
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold transition-all duration-300 ${isActive ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30' : isCompleted ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : s.num}
                  </div>
                  <div>
                    <div className={`text-sm font-bold ${isActive ? 'text-sky-400' : isCompleted ? 'text-emerald-400' : 'text-slate-400'}`}>{s.title}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Area */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto">
          
          {/* STEP 1: PATIENT & BASIC INFO */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div>
                <h3 className="text-xl font-bold mb-1">{t("admissions.wizard.steps.s1")}</h3>
                <p className="text-slate-400 text-sm mb-6">{t("admissions.wizard.steps.s1Desc")}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">{t("admissions.wizard.form.searchPatient")} <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <Search className={`absolute ${isRtl ? 'left-3' : 'right-3'} top-2.5 w-5 h-5 text-slate-500`} />
                    <input
                      type="text"
                      placeholder={t("admissions.wizard.form.searchPlaceholder")}
                      value={patientSearch}
                      onChange={(e) => {
                        setPatientSearch(e.target.value);
                        setFormData(prev => ({...prev, patientId: ""})); // reset selection if searching again
                      }}
                      className={`w-full bg-slate-800 border border-slate-700 rounded-xl ${isRtl ? 'pl-10 pr-4' : 'pr-10 pl-4'} py-2.5 text-slate-100 focus:outline-none focus:border-sky-500 transition-colors`}
                    />
                  </div>
                  {/* Results Dropdown if not selected */}
                  {patientSearch && !formData.patientId && (
                    <div className="mt-2 bg-slate-800 border border-slate-700 rounded-xl max-h-48 overflow-y-auto shadow-xl">
                      {filteredPatients.length === 0 ? (
                        <div className="p-3 text-sm text-slate-400 text-center">{t("admissions.wizard.form.noResults")}</div>
                      ) : (
                        filteredPatients.map(p => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setFormData(prev => ({...prev, patientId: p.id.toString()}));
                              setPatientSearch(p.fullName);
                            }}
                            className="p-3 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0 flex justify-between"
                          >
                            <span className="font-medium text-slate-200">{p.fullName}</span>
                            <span className="text-xs text-sky-400 font-mono bg-sky-400/10 px-2 py-1 rounded">{p.mrn}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {formData.patientId && (
                     <div className="mt-2 inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        {t("admissions.wizard.form.patientSelected")}
                        <button onClick={() => {setFormData(prev=>({...prev, patientId:""})); setPatientSearch("");}} className={`hover:text-emerald-300 ${isRtl ? 'mr-2' : 'ml-2'}`}>
                          <X className="w-4 h-4"/>
                        </button>
                     </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">{t("admissions.wizard.form.admissionType")}</label>
                    <select name="admissionType" value={formData.admissionType} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-sky-500 transition-colors appearance-none">
                      <option value="ELECTIVE">{t("admissions.wizard.form.typeElective")}</option>
                      <option value="EMERGENCY">{t("admissions.wizard.form.typeEmergency")}</option>
                      <option value="TRANSFER">{t("admissions.wizard.form.typeTransfer")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">{t("admissions.wizard.form.priority")}</label>
                    <select name="priority" value={formData.priority} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-sky-500 transition-colors appearance-none">
                      <option value="LOW">{t("admissions.wizard.form.pLow")}</option>
                      <option value="MEDIUM">{t("admissions.wizard.form.pMedium")}</option>
                      <option value="HIGH">{t("admissions.wizard.form.pHigh")}</option>
                      <option value="URGENT">{t("admissions.wizard.form.pUrgent")}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">{t("admissions.wizard.form.reason")}</label>
                    <input type="text" name="admissionReason" value={formData.admissionReason} onChange={handleChange} placeholder={t("admissions.wizard.form.reasonPlaceholder")} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">{t("admissions.wizard.form.diagnosis")}</label>
                    <input type="text" name="primaryDiagnosis" value={formData.primaryDiagnosis} onChange={handleChange} placeholder={t("admissions.wizard.form.diagnosisPlaceholder")} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-sky-500" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: MEDICAL TEAM */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div>
                <h3 className="text-xl font-bold mb-1">{t("admissions.wizard.steps.s2")}</h3>
                <p className="text-slate-400 text-sm mb-6">{t("admissions.wizard.steps.s2Desc")}</p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">{t("admissions.wizard.form.admittingDoctor")} <span className="text-rose-500">*</span></label>
                  <select name="admittingDoctorId" value={formData.admittingDoctorId} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500 appearance-none">
                    <option value="">{t("admissions.wizard.form.selectDoctor")}</option>
                    {doctors.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                  </select>
                </div>
                
                <div className="p-4 bg-sky-900/10 border border-sky-500/20 rounded-xl flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-sky-400 mt-0.5" />
                    <div className="w-full">
                        <h4 className="text-sm font-semibold text-sky-400 mb-1">{t("admissions.wizard.form.primaryPhysician")}</h4>
                        <p className="text-xs text-slate-400 mb-3">{t("admissions.wizard.form.primaryPhysicianDesc")}</p>
                        <select name="primaryPhysicianId" value={formData.primaryPhysicianId} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-slate-100 focus:outline-none focus:border-sky-500 appearance-none">
                          <option value="">{t("admissions.wizard.form.selectDoctor")}</option>
                          {doctors.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                        </select>
                        <button 
                          onClick={() => setFormData(p => ({...p, primaryPhysicianId: p.admittingDoctorId}))}
                          className="mt-2 text-xs text-sky-400 hover:text-sky-300 underline"
                        >
                          {t("admissions.wizard.form.setAsPrimary")}
                        </button>
                    </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: BED SELECTION */}
          {step === 3 && (
            <div className="space-y-6 flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
              <div>
                <h3 className="text-xl font-bold mb-1">{t("admissions.wizard.steps.s3")}</h3>
                <p className="text-slate-400 text-sm mb-4">{t("admissions.wizard.steps.s3Desc")}</p>
              </div>

              {/* Ward Filter */}
              <div className="flex gap-2 overflow-x-auto pb-2 shrink-0">
                {wards.map(ward => (
                  <button
                    key={ward.id}
                    onClick={() => setFormData(prev => ({ ...prev, wardId: ward.id.toString(), bedId: "" }))}
                    className={`px-4 py-2 rounded-xl whitespace-nowrap text-sm font-medium transition-all ${
                      formData.wardId === ward.id.toString() 
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-500/20' 
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {ward.name} {ward.gender && ward.gender !== "Mixed" ? `(${ward.gender === "Men" ? t("beds.genderMen") : ward.gender === "Women" ? t("beds.genderWomen") : ward.gender})` : ''}
                  </button>
                ))}
              </div>

              {/* Bed Map for Selected Ward */}
              <div className="flex-1 bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4 overflow-y-auto">
                {selectedWard ? (
                  <div className="space-y-6">
                    {selectedWard.rooms.map(room => (
                      <div key={room.id}>
                        <h4 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                          {t("admissions.wizard.form.room")} {room.roomNumber}
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                          {room.beds.map(bed => {
                            const isSelected = formData.bedId === bed.id.toString();
                            return (
                              <div
                                key={bed.id}
                                onClick={() => {
                                  if (bed.status === "AVAILABLE") {
                                    setFormData(prev => ({ ...prev, bedId: bed.id.toString() }));
                                    setSelectedBedObj({ ...bed, wardName: selectedWard.name });
                                  }
                                }}
                                className={`relative p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${getBedColor(bed.status)} ${isSelected ? 'border-sky-500 ring-4 ring-sky-500/20 bg-sky-900/40 transform scale-105' : ''}`}
                              >
                                {isSelected && (
                                  <div className={`absolute -top-2 ${isRtl ? '-left-2' : '-right-2'} bg-sky-500 text-white rounded-full p-1`}>
                                    <CheckCircle2 className="w-4 h-4" />
                                  </div>
                                )}
                                <BedIcon className={`w-8 h-8 ${isSelected ? 'text-sky-400' : ''}`} />
                                <div className="text-center">
                                  <div className="font-bold text-lg leading-tight">{bed.bedNumber}</div>
                                  <div className="text-[10px] uppercase font-semibold tracking-wider opacity-70 mt-1">
                                    {bed.status === 'AVAILABLE' ? t("admissions.wizard.form.bedStatus.available") : bed.status === 'OCCUPIED' ? t("admissions.wizard.form.bedStatus.occupied") : t("admissions.wizard.form.bedStatus.unavailable")}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500">
                    <BedIcon className="w-12 h-12 mb-3 opacity-20" />
                    <p>{t("admissions.wizard.form.selectWardToView")}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: ADDITIONAL REQ & REVIEW */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div>
                <h3 className="text-xl font-bold mb-1">{t("admissions.wizard.steps.s4")}</h3>
                <p className="text-slate-400 text-sm mb-6">{t("admissions.wizard.steps.s4Desc")}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Isolation */}
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700/50">
                  <label className="flex items-center gap-3 cursor-pointer mb-4">
                    <input type="checkbox" name="isolationRequired" checked={formData.isolationRequired} onChange={handleChange} className="w-5 h-5 rounded border-slate-600 text-sky-500 focus:ring-sky-500 bg-slate-900" />
                    <span className="font-medium text-slate-200">{t("admissions.wizard.form.isolationRequired")}</span>
                  </label>
                  {formData.isolationRequired && (
                    <select name="isolationType" value={formData.isolationType} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-sky-500">
                      <option value="STANDARD">{t("admissions.wizard.form.isoStandard")}</option>
                      <option value="DROPLET">{t("admissions.wizard.form.isoDroplet")}</option>
                      <option value="AIRBORNE">{t("admissions.wizard.form.isoAirborne")}</option>
                      <option value="CONTACT">{t("admissions.wizard.form.isoContact")}</option>
                    </select>
                  )}
                </div>

                {/* Expected Discharge */}
                <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700/50">
                  <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    {t("admissions.wizard.form.expDischarge")}
                  </label>
                  <input type="date" name="expectedDischargeDate" value={formData.expectedDischargeDate} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:border-sky-500" style={{ colorScheme: 'dark' }} />
                </div>
              </div>

              {/* Emergency Contact (Optional) */}
              <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/50 mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-5 h-5 text-emerald-500" />
                  <h4 className="font-bold text-slate-200">{t("admissions.wizard.form.emergencyContact")}</h4>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  {t("admissions.wizard.form.emergencyContactDesc")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">{t("admissions.wizard.form.ecName")}</label>
                    <input type="text" name="emergencyContactName" value={formData.emergencyContactName} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">{t("admissions.wizard.form.ecRelation")}</label>
                    <input type="text" name="emergencyContactRelation" value={formData.emergencyContactRelation} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">{t("admissions.wizard.form.ecPhone")}</label>
                    <input type="text" name="emergencyContactPhone" value={formData.emergencyContactPhone} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500" />
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-sky-900/10 p-5 rounded-2xl border border-sky-500/20">
                <h4 className="font-bold text-sky-400 mb-4 border-b border-sky-500/20 pb-2">{t("admissions.wizard.form.review")}</h4>
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <div className="text-slate-400">{t("admissions.wizard.form.revPatient")} <span className="text-slate-100 font-medium ml-2">{patientSearch || t("admissions.wizard.form.notSelected")}</span></div>
                  <div className="text-slate-400">{t("admissions.wizard.form.revBed")} <span className="text-slate-100 font-medium ml-2">{selectedBedObj ? `${selectedBedObj.bedNumber} - ${selectedBedObj.wardName}` : t("admissions.wizard.form.notSelected")}</span></div>
                  <div className="text-slate-400">{t("admissions.wizard.form.revType")} <span className="text-slate-100 font-medium ml-2">{formData.admissionType}</span></div>
                  <div className="text-slate-400">{t("admissions.wizard.form.revPriority")} <span className="text-slate-100 font-medium ml-2">{formData.priority}</span></div>
                  <div className="text-slate-400">{t("admissions.wizard.form.revIsolation")} <span className={`${formData.isolationRequired ? 'text-rose-400 font-bold' : 'text-slate-100'} ml-2`}>{formData.isolationRequired ? `${t("admissions.wizard.form.yes")} (${formData.isolationType})` : t("admissions.wizard.form.no")}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="mt-auto pt-6 border-t border-slate-700/50 flex justify-between items-center">
            <button
              onClick={prevStep}
              disabled={step === 1 || submitting}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-colors ${step === 1 ? 'opacity-0 cursor-default' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'}`}
            >
               {isRtl ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />} 
               {t("admissions.wizard.form.prev")}
            </button>
            
            {step < 4 ? (
              <button
                onClick={nextStep}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-500/20 transition-all"
              >
                {t("admissions.wizard.form.next")} {isRtl ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            ) : (
              <button
                onClick={handleAdmission}
                disabled={submitting}
                className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20 transition-all"
              >
                {submitting ? (
                   <span className="flex items-center gap-2">{t("admissions.wizard.form.processing")} <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div></span>
                ) : (
                   <><CheckCircle2 className="w-5 h-5" /> {t("admissions.wizard.form.confirm")}</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QUICK ADMISSION MODAL */}
      {showQuickModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden" dir={isRtl ? "rtl" : "ltr"}>
            <div className="bg-rose-600/10 border-b border-rose-500/20 p-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-rose-500/20 p-2 rounded-full"><AlertCircle className="w-6 h-6 text-rose-500" /></div>
                <h2 className="text-xl font-bold text-rose-500">{t("admissions.wizard.quickModal.title")}</h2>
              </div>
              <button onClick={() => setShowQuickModal(false)} className="text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{t("admissions.wizard.quickModal.patient")} <span className="text-rose-500">*</span></label>
                <select name="patientId" value={formData.patientId} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500 appearance-none">
                  <option value="">{t("admissions.wizard.form.selectDoctor")}</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.fullName} - {p.mrn}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{t("admissions.wizard.quickModal.doctor")} <span className="text-rose-500">*</span></label>
                <select name="admittingDoctorId" value={formData.admittingDoctorId} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500 appearance-none">
                  <option value="">{t("admissions.wizard.form.selectDoctor")}</option>
                  {doctors.map(d => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{t("admissions.wizard.quickModal.bed")} <span className="text-rose-500">*</span></label>
                <select name="bedId" value={formData.bedId} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500 appearance-none">
                  <option value="">{t("admissions.wizard.form.selectDoctor")}</option>
                  {wards.map(w => 
                    <optgroup key={w.id} label={w.name}>
                      {w.rooms.flatMap(r => r.beds.filter(b => b.status === "AVAILABLE").map(b => (
                        <option key={b.id} value={b.id}>{b.bedNumber} ({r.roomNumber})</option>
                      )))}
                    </optgroup>
                  )}
                </select>
                <p className="text-xs text-slate-500 mt-2">{t("admissions.wizard.quickModal.bedHint")}</p>
              </div>
            </div>

            <div className="p-5 border-t border-slate-700/50 bg-slate-900/50 flex justify-end gap-3">
              <button onClick={() => setShowQuickModal(false)} className="px-5 py-2.5 rounded-xl font-medium text-slate-300 hover:bg-slate-800 transition-colors">{t("admissions.wizard.quickModal.cancel")}</button>
              <button 
                onClick={handleQuickEmergencyAdmission} 
                disabled={submitting || !formData.patientId || !formData.bedId || !formData.admittingDoctorId}
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold shadow-lg shadow-rose-500/20 transition-all flex items-center gap-2"
              >
                {submitting ? t("admissions.wizard.form.processing") : t("admissions.wizard.quickModal.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
