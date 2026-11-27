// client/src/pages/hr/EmployeeFormPage.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Save,
  User,
  GraduationCap,
  Award,
  FileLock2,
  Banknote,
  Sparkles,
  Plus,
  Trash2,
  Download,
} from "lucide-react";
import {
  hrService,
  type ContractType,
  type EmployeeStatus,
  type StaffCategory,
} from "../../services/hr.service";
import { STAFF_CATEGORY_LABELS } from "../../utils/hrExport";

type TabId = "basic" | "qualifications" | "courses" | "documents" | "financial";

interface PendingQual {
  degree: string;
  major: string;
  institution: string;
  graduationYear: string;
  grade: string;
}

interface PendingCourse {
  courseName: string;
  provider: string;
  completionDate: string;
  hoursCount: string;
  certificateNo: string;
}

const CURRENCIES = ["LYD", "USD", "EUR", "SAR", "EGP", "AED", "TND", "GBP"];

export default function EmployeeFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const employeeId = id ? Number(id) : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>("basic");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    employeeNo: "",
    altamamEmployeeNo: "",
    biometricId: "",
    firstNameAr: "",
    secondNameAr: "",
    thirdNameAr: "",
    lastNameAr: "",
    firstNameEn: "",
    secondNameEn: "",
    thirdNameEn: "",
    lastNameEn: "",
    gender: "MALE" as "MALE" | "FEMALE",
    dateOfBirth: "",
    nationality: "ليبي",
    maritalStatus: "SINGLE",
    dependentsCount: "0",
    nationalId: "",
    nationalIdExpiry: "",
    passportNo: "",
    passportExpiry: "",
    residenceNo: "",
    residenceExpiry: "",
    phone: "",
    phone2: "",
    email: "",
    address: "",
    city: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyRelation: "",
    departmentId: "",
    sectionId: "",
    jobTitleId: "",
    specialtyId: "",
    staffCategory: "ADMINISTRATIVE" as StaffCategory,
    medicalRank: "",
    hireDate: new Date().toISOString().slice(0, 10),
    contractType: "PERMANENT" as ContractType,
    contractStartDate: "",
    contractEndDate: "",
    status: "ACTIVE" as EmployeeStatus,
    payBasis: "MONTHLY",
    basicSalary: "0",
    housingAllowance: "0",
    transportAllowance: "0",
    otherAllowance: "0",
    hourlyRate: "0",
    fixedShift6hRate: "0",
    fixedShift12hRate: "0",
    fixedShift24hRate: "0",
    onCallDailyRate: "0",
    standardMonthlyHours: "160",
    currency: "LYD",
    bankName: "",
    bankAccountNo: "",
    iban: "",
    socialInsuranceNo: "",
    medicalInsuranceNo: "",
    medicalInsuranceClass: "",
    isTaxExempt: false,
    isSocialInsuranceExempt: false,
    payrollExemptionReason: "",
    annualLeaveBalance: "21",
  });

  // Buffered qualifications & courses in create mode
  const [pendingQuals, setPendingQuals] = useState<PendingQual[]>([]);
  const [newQual, setNewQual] = useState<PendingQual>({
    degree: "",
    major: "",
    institution: "",
    graduationYear: "",
    grade: "",
  });

  const [pendingCourses, setPendingCourses] = useState<PendingCourse[]>([]);
  const [newCourse, setNewCourse] = useState<PendingCourse>({
    courseName: "",
    provider: "",
    completionDate: "",
    hoursCount: "",
    certificateNo: "",
  });

  // Encrypted document upload (edit mode)
  const [docForm, setDocForm] = useState({
    title: "",
    category: "LICENSE",
    expiryDate: "",
    notes: "",
  });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const { data: config } = useQuery({
    queryKey: ["hr-config"],
    queryFn: hrService.getConfig,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: hrService.listDepartments,
  });
  const { data: specialties = [] } = useQuery({
    queryKey: ["specialties"],
    queryFn: hrService.listSpecialties,
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["hr-sections", form.departmentId],
    queryFn: () =>
      hrService.listSections(
        form.departmentId ? Number(form.departmentId) : undefined,
      ),
  });
  const { data: jobTitles = [] } = useQuery({
    queryKey: ["hr-job-titles"],
    queryFn: hrService.listJobTitles,
  });

  const {
    data: existingEmployee,
    refetch: refetchEmployee,
  } = useQuery({
    queryKey: ["hr-employee", employeeId],
    queryFn: () => hrService.getEmployee(employeeId!),
    enabled: isEdit && Boolean(employeeId),
  });

  useEffect(() => {
    if (!isEdit && config?.defaultCurrency) {
      setForm((prev) => ({
        ...prev,
        currency: prev.currency || config.defaultCurrency || "LYD",
      }));
    }
  }, [isEdit, config]);

  useEffect(() => {
    if (!existingEmployee) return;
    setForm({
      employeeNo: existingEmployee.employeeNo || "",
      altamamEmployeeNo: existingEmployee.altamamEmployeeNo || "",
      biometricId: existingEmployee.biometricId || "",
      firstNameAr: existingEmployee.firstNameAr || "",
      secondNameAr: existingEmployee.secondNameAr || "",
      thirdNameAr: existingEmployee.thirdNameAr || "",
      lastNameAr: existingEmployee.lastNameAr || "",
      firstNameEn: existingEmployee.firstNameEn || "",
      secondNameEn: existingEmployee.secondNameEn || "",
      thirdNameEn: existingEmployee.thirdNameEn || "",
      lastNameEn: existingEmployee.lastNameEn || "",
      gender: existingEmployee.gender || "MALE",
      dateOfBirth: existingEmployee.dateOfBirth?.slice(0, 10) || "",
      nationality: existingEmployee.nationality || "ليبي",
      maritalStatus: existingEmployee.maritalStatus || "SINGLE",
      dependentsCount: String(existingEmployee.dependentsCount ?? 0),
      nationalId: existingEmployee.nationalId || "",
      nationalIdExpiry: existingEmployee.nationalIdExpiry?.slice(0, 10) || "",
      passportNo: existingEmployee.passportNo || "",
      passportExpiry: existingEmployee.passportExpiry?.slice(0, 10) || "",
      residenceNo: existingEmployee.residenceNo || "",
      residenceExpiry: existingEmployee.residenceExpiry?.slice(0, 10) || "",
      phone: existingEmployee.phone || "",
      phone2: existingEmployee.phone2 || "",
      email: existingEmployee.email || "",
      address: existingEmployee.address || "",
      city: existingEmployee.city || "",
      emergencyContactName: existingEmployee.emergencyContactName || "",
      emergencyContactPhone: existingEmployee.emergencyContactPhone || "",
      emergencyRelation: existingEmployee.emergencyRelation || "",
      departmentId: existingEmployee.departmentId
        ? String(existingEmployee.departmentId)
        : "",
      sectionId: existingEmployee.sectionId
        ? String(existingEmployee.sectionId)
        : "",
      jobTitleId: existingEmployee.jobTitleId
        ? String(existingEmployee.jobTitleId)
        : "",
      specialtyId: existingEmployee.specialtyId
        ? String(existingEmployee.specialtyId)
        : "",
      staffCategory: existingEmployee.staffCategory || "ADMINISTRATIVE",
      medicalRank: existingEmployee.medicalRank || "",
      hireDate: existingEmployee.hireDate?.slice(0, 10) || "",
      contractType: existingEmployee.contractType || "PERMANENT",
      contractStartDate:
        existingEmployee.contractStartDate?.slice(0, 10) || "",
      contractEndDate: existingEmployee.contractEndDate?.slice(0, 10) || "",
      status: existingEmployee.status || "ACTIVE",
      payBasis: existingEmployee.payBasis || "MONTHLY",
      basicSalary: String(existingEmployee.basicSalary ?? "0"),
      housingAllowance: String(existingEmployee.housingAllowance ?? "0"),
      transportAllowance: String(existingEmployee.transportAllowance ?? "0"),
      otherAllowance: String(existingEmployee.otherAllowance ?? "0"),
      hourlyRate: String(existingEmployee.hourlyRate ?? "0"),
      fixedShift6hRate: String(existingEmployee.fixedShift6hRate ?? "0"),
      fixedShift12hRate: String(existingEmployee.fixedShift12hRate ?? "0"),
      fixedShift24hRate: String(existingEmployee.fixedShift24hRate ?? "0"),
      onCallDailyRate: String(existingEmployee.onCallDailyRate ?? "0"),
      standardMonthlyHours: String(
        existingEmployee.standardMonthlyHours ?? 160,
      ),
      currency: existingEmployee.currency || "LYD",
      bankName: existingEmployee.bankName || "",
      bankAccountNo: existingEmployee.bankAccountNo || "",
      iban: existingEmployee.iban || "",
      socialInsuranceNo: existingEmployee.socialInsuranceNo || "",
      medicalInsuranceNo: existingEmployee.medicalInsuranceNo || "",
      medicalInsuranceClass: existingEmployee.medicalInsuranceClass || "",
      isTaxExempt: Boolean(existingEmployee.isTaxExempt),
      isSocialInsuranceExempt: Boolean(
        existingEmployee.isSocialInsuranceExempt,
      ),
      payrollExemptionReason: existingEmployee.payrollExemptionReason || "",
      annualLeaveBalance: String(existingEmployee.annualLeaveBalance ?? 21),
    });
  }, [existingEmployee]);

  const altamamEnabled = Boolean(config?.altamamIntegrationEnabled);

  const handleGenerateEmployeeNo = async () => {
    try {
      const res = await hrService.getNextEmployeeNo();
      setForm((prev) => ({ ...prev, employeeNo: res.nextEmployeeNo }));
    } catch {
      toast.error("تعذر توليد الرقم الوظيفي التلقائي.");
    }
  };

  const handleAddQual = async () => {
    if (!newQual.degree.trim() || !newQual.institution.trim()) {
      toast.warning("أدخل الدرجة العلمية والجهة المانحة.");
      return;
    }
    if (isEdit && employeeId) {
      try {
        await hrService.addQualification(employeeId, {
          degree: newQual.degree.trim(),
          major: newQual.major.trim() || undefined,
          institution: newQual.institution.trim(),
          graduationYear: newQual.graduationYear
            ? Number(newQual.graduationYear)
            : undefined,
          grade: newQual.grade.trim() || undefined,
        });
        toast.success("تمت إضافة المؤهل العلمي.");
        setNewQual({
          degree: "",
          major: "",
          institution: "",
          graduationYear: "",
          grade: "",
        });
        refetchEmployee();
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "تعذر إضافة المؤهل.");
      }
    } else {
      setPendingQuals((prev) => [...prev, newQual]);
      setNewQual({
        degree: "",
        major: "",
        institution: "",
        graduationYear: "",
        grade: "",
      });
    }
  };

  const handleAddCourse = async () => {
    if (!newCourse.courseName.trim() || !newCourse.provider.trim()) {
      toast.warning("أدخل اسم الدورة والجهة المنفذة.");
      return;
    }
    if (isEdit && employeeId) {
      try {
        await hrService.addTrainingCourse(employeeId, {
          courseName: newCourse.courseName.trim(),
          provider: newCourse.provider.trim(),
          completionDate: newCourse.completionDate || undefined,
          hoursCount: newCourse.hoursCount
            ? Number(newCourse.hoursCount)
            : undefined,
          certificateNo: newCourse.certificateNo.trim() || undefined,
        });
        toast.success("تمت إضافة الدورة التدريبية.");
        setNewCourse({
          courseName: "",
          provider: "",
          completionDate: "",
          hoursCount: "",
          certificateNo: "",
        });
        refetchEmployee();
      } catch (err: any) {
        toast.error(err?.response?.data?.message || "تعذر إضافة الدورة.");
      }
    } else {
      setPendingCourses((prev) => [...prev, newCourse]);
      setNewCourse({
        courseName: "",
        provider: "",
        completionDate: "",
        hoursCount: "",
        certificateNo: "",
      });
    }
  };

  const handleUploadDocument = async () => {
    if (!employeeId || !docFile || !docForm.title.trim()) {
      toast.warning("اختر الملف وأدخل عنوان الوثيقة.");
      return;
    }
    setUploadingDoc(true);
    try {
      const fd = new FormData();
      fd.append("file", docFile);
      fd.append("title", docForm.title.trim());
      if (docForm.category) fd.append("category", docForm.category);
      if (docForm.expiryDate) fd.append("expiryDate", docForm.expiryDate);
      if (docForm.notes) fd.append("notes", docForm.notes);
      await hrService.uploadDocument(employeeId, fd);
      toast.success("تم فحص وتشفير ورفع الوثيقة بنجاح.");
      setDocFile(null);
      setDocForm({ title: "", category: "LICENSE", expiryDate: "", notes: "" });
      refetchEmployee();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر رفع الوثيقة.");
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDownloadDoc = async (docId: number, originalName: string) => {
    if (!employeeId) return;
    try {
      const blob = await hrService.downloadDocumentBlob(employeeId, docId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = originalName || `document-${docId}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("فشل تحميل وفك تشفير الوثيقة.");
    }
  };

  const handleSubmit = async () => {
    if (!form.firstNameAr.trim()) {
      toast.warning("الاسم الأول بالعربية مطلوب.");
      setActiveTab("basic");
      return;
    }
    if (
      (form.isTaxExempt || form.isSocialInsuranceExempt) &&
      !form.payrollExemptionReason.trim()
    ) {
      toast.warning("يجب إدخال سبب الإعفاء من الضريبة أو الضمان.");
      setActiveTab("financial");
      return;
    }

    const payload: Record<string, unknown> = {
      ...(form.employeeNo.trim() ? { employeeNo: form.employeeNo.trim() } : {}),
      ...(altamamEnabled && form.altamamEmployeeNo.trim()
        ? { altamamEmployeeNo: form.altamamEmployeeNo.trim() }
        : isEdit && altamamEnabled
          ? { altamamEmployeeNo: form.altamamEmployeeNo.trim() || null }
          : {}),
      biometricId: form.biometricId.trim() || undefined,
      firstNameAr: form.firstNameAr.trim(),
      secondNameAr: form.secondNameAr.trim() || undefined,
      thirdNameAr: form.thirdNameAr.trim() || undefined,
      lastNameAr: form.lastNameAr.trim() || undefined,
      firstNameEn: form.firstNameEn.trim() || undefined,
      secondNameEn: form.secondNameEn.trim() || undefined,
      thirdNameEn: form.thirdNameEn.trim() || undefined,
      lastNameEn: form.lastNameEn.trim() || undefined,
      gender: form.gender,
      dateOfBirth: form.dateOfBirth || undefined,
      nationality: form.nationality.trim() || undefined,
      maritalStatus: form.maritalStatus || undefined,
      dependentsCount: Number(form.dependentsCount) || 0,
      nationalId: form.nationalId.trim() || undefined,
      nationalIdExpiry: form.nationalIdExpiry || undefined,
      passportNo: form.passportNo.trim() || undefined,
      passportExpiry: form.passportExpiry || undefined,
      residenceNo: form.residenceNo.trim() || undefined,
      residenceExpiry: form.residenceExpiry || undefined,
      phone: form.phone.trim() || undefined,
      phone2: form.phone2.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      emergencyContactName: form.emergencyContactName.trim() || undefined,
      emergencyContactPhone: form.emergencyContactPhone.trim() || undefined,
      emergencyRelation: form.emergencyRelation.trim() || undefined,
      departmentId: form.departmentId ? Number(form.departmentId) : undefined,
      sectionId: form.sectionId ? Number(form.sectionId) : undefined,
      jobTitleId: form.jobTitleId ? Number(form.jobTitleId) : undefined,
      specialtyId: form.specialtyId ? Number(form.specialtyId) : undefined,
      staffCategory: form.staffCategory,
      medicalRank: form.medicalRank || undefined,
      hireDate: form.hireDate || undefined,
      contractType: form.contractType,
      contractStartDate: form.contractStartDate || undefined,
      contractEndDate: form.contractEndDate || undefined,
      status: form.status,
      payBasis: form.payBasis,
      basicSalary: Number(form.basicSalary) || 0,
      housingAllowance: Number(form.housingAllowance) || 0,
      transportAllowance: Number(form.transportAllowance) || 0,
      otherAllowance: Number(form.otherAllowance) || 0,
      hourlyRate: Number(form.hourlyRate) || 0,
      fixedShift6hRate: Number(form.fixedShift6hRate) || 0,
      fixedShift12hRate: Number(form.fixedShift12hRate) || 0,
      fixedShift24hRate: Number(form.fixedShift24hRate) || 0,
      onCallDailyRate: Number(form.onCallDailyRate) || 0,
      standardMonthlyHours: Number(form.standardMonthlyHours) || 160,
      currency: form.currency || "LYD",
      bankName: form.bankName.trim() || undefined,
      bankAccountNo: form.bankAccountNo.trim() || undefined,
      iban: form.iban.trim() || undefined,
      socialInsuranceNo: form.socialInsuranceNo.trim() || undefined,
      medicalInsuranceNo: form.medicalInsuranceNo.trim() || undefined,
      medicalInsuranceClass: form.medicalInsuranceClass.trim() || undefined,
      isTaxExempt: form.isTaxExempt,
      isSocialInsuranceExempt: form.isSocialInsuranceExempt,
      payrollExemptionReason: form.payrollExemptionReason.trim() || undefined,
      annualLeaveBalance: Number(form.annualLeaveBalance) || 21,
    };

    if (!isEdit) {
      if (pendingQuals.length > 0) {
        payload.qualifications = pendingQuals.map((q) => ({
          degree: q.degree,
          major: q.major || undefined,
          institution: q.institution,
          graduationYear: q.graduationYear ? Number(q.graduationYear) : undefined,
          grade: q.grade || undefined,
        }));
      }
      if (pendingCourses.length > 0) {
        payload.trainingCourses = pendingCourses.map((c) => ({
          courseName: c.courseName,
          provider: c.provider,
          completionDate: c.completionDate || undefined,
          hoursCount: c.hoursCount ? Number(c.hoursCount) : undefined,
          certificateNo: c.certificateNo || undefined,
        }));
      }
    }

    setSaving(true);
    try {
      const saved =
        isEdit && employeeId
          ? await hrService.updateEmployee(employeeId, payload)
          : await hrService.createEmployee(payload);
      toast.success(isEdit ? "تم تحديث ملف الموظف بنجاح." : "تم إنشاء ملف الموظف بنجاح.");
      queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
      queryClient.invalidateQueries({ queryKey: ["hr-employees-stats"] });
      navigate(`/hr/employees/${saved.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر حفظ بيانات الموظف.");
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "basic", label: "البيانات الأساسية والاسم الرباعي", icon: <User className="w-4 h-4" /> },
    { id: "qualifications", label: "المؤهلات العلمية", icon: <GraduationCap className="w-4 h-4" /> },
    { id: "courses", label: "الدورات والشهادات المهنية", icon: <Award className="w-4 h-4" /> },
    { id: "documents", label: "الوثائق المشفرة والمزاولة", icon: <FileLock2 className="w-4 h-4" /> },
    { id: "financial", label: "البدلات والبيانات البنكية", icon: <Banknote className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 text-slate-100 max-w-6xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/hr/employees")}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-black">
              {isEdit
                ? `تعديل ملف الموظف: ${existingEmployee?.fullName || ""}`
                : "إضافة موظف / كادر جديد"}
            </h1>
            <p className="text-xs text-slate-400">
              ملف وظيفي متكامل (لا يتطلب إنشاء حساب دخول للنظام)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-black shadow-lg flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "جارِ الحفظ..." : isEdit ? "حفظ التعديلات" : "حفظ الموظف"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-slate-900/40 p-2 rounded-2xl border border-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === tab.id
                ? "bg-sky-600 text-white shadow-md"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-2xl">
        {activeTab === "basic" && (
          <>
            {/* Quadruple Arabic Name */}
            <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-black text-sky-400">
                الاسم الرباعي بالعربية (وفق الهوية الرسمية)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    الاسم الأول *
                  </label>
                  <input
                    value={form.firstNameAr}
                    onChange={(e) =>
                      setForm({ ...form, firstNameAr: e.target.value })
                    }
                    placeholder="طارق"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    اسم الأب
                  </label>
                  <input
                    value={form.secondNameAr}
                    onChange={(e) =>
                      setForm({ ...form, secondNameAr: e.target.value })
                    }
                    placeholder="محمد"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    اسم الجد
                  </label>
                  <input
                    value={form.thirdNameAr}
                    onChange={(e) =>
                      setForm({ ...form, thirdNameAr: e.target.value })
                    }
                    placeholder="علي"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    اللقب / اسم العائلة
                  </label>
                  <input
                    value={form.lastNameAr}
                    onChange={(e) =>
                      setForm({ ...form, lastNameAr: e.target.value })
                    }
                    placeholder="المجذوب"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Quadruple English Name */}
            <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-black text-slate-300">
                الاسم باللغة الإنجليزية (اختياري — للجواز والشهادات)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3" dir="ltr">
                <input
                  value={form.firstNameEn}
                  onChange={(e) =>
                    setForm({ ...form, firstNameEn: e.target.value })
                  }
                  placeholder="First Name"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
                <input
                  value={form.secondNameEn}
                  onChange={(e) =>
                    setForm({ ...form, secondNameEn: e.target.value })
                  }
                  placeholder="Father Name"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
                <input
                  value={form.thirdNameEn}
                  onChange={(e) =>
                    setForm({ ...form, thirdNameEn: e.target.value })
                  }
                  placeholder="Grandfather Name"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
                <input
                  value={form.lastNameEn}
                  onChange={(e) =>
                    setForm({ ...form, lastNameEn: e.target.value })
                  }
                  placeholder="Surname"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
            </div>

            {/* Identifiers */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الرقم الوظيفي (يُولد تلقائياً إذا تُرك فارغاً)
                </label>
                <div className="flex gap-1.5">
                  <input
                    value={form.employeeNo}
                    onChange={(e) =>
                      setForm({ ...form, employeeNo: e.target.value })
                    }
                    placeholder="EMP-0001"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateEmployeeNo}
                    title="توليد تلقائي"
                    className="px-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-sky-400 border border-slate-700"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  كود البصمة (ZKTeco)
                </label>
                <input
                  value={form.biometricId}
                  onChange={(e) =>
                    setForm({ ...form, biometricId: e.target.value })
                  }
                  placeholder="مثال: 101"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
              {altamamEnabled && (
                <div>
                  <label className="text-xs text-purple-300 font-bold block mb-1">
                    رقم منظومة التمام
                  </label>
                  <input
                    value={form.altamamEmployeeNo}
                    onChange={(e) =>
                      setForm({ ...form, altamamEmployeeNo: e.target.value })
                    }
                    data-testid="input-altamam-no"
                    placeholder="TAM-501"
                    className="w-full bg-slate-950 border border-purple-500/40 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الرقم الوطني / الهوية
                </label>
                <input
                  value={form.nationalId}
                  onChange={(e) =>
                    setForm({ ...form, nationalId: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>

            {/* Organization & Category */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الإدارة / القسم
                </label>
                <select
                  value={form.departmentId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      departmentId: e.target.value,
                      sectionId: "",
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                >
                  <option value="">اختر القسم...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الشعبة / القسم الفرعي
                </label>
                <select
                  value={form.sectionId}
                  onChange={(e) =>
                    setForm({ ...form, sectionId: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                >
                  <option value="">بدون شعبة</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  المسمى الوظيفي
                </label>
                <select
                  value={form.jobTitleId}
                  onChange={(e) =>
                    setForm({ ...form, jobTitleId: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                >
                  <option value="">اختر المسمى...</option>
                  {jobTitles.map((jt) => (
                    <option key={jt.id} value={jt.id}>
                      {jt.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  تصنيف الكادر
                </label>
                <select
                  value={form.staffCategory}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      staffCategory: e.target.value as StaffCategory,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                >
                  {(
                    Object.keys(STAFF_CATEGORY_LABELS) as StaffCategory[]
                  ).map((cat) => (
                    <option key={cat} value={cat}>
                      {STAFF_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Medical Rank & Dates & Status */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  التخصص الطبي
                </label>
                <select
                  value={form.specialtyId}
                  onChange={(e) =>
                    setForm({ ...form, specialtyId: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                >
                  <option value="">بدون تخصص طبي</option>
                  {specialties.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.nameAr || sp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  تاريخ التعيين
                </label>
                <input
                  type="date"
                  value={form.hireDate}
                  onChange={(e) =>
                    setForm({ ...form, hireDate: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  نوع العقد
                </label>
                <select
                  value={form.contractType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contractType: e.target.value as ContractType,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                >
                  <option value="PERMANENT">تعيين دائم</option>
                  <option value="TEMPORARY">عقد مؤقت</option>
                  <option value="PART_TIME">دوام جزئي</option>
                  <option value="LOCUM">طبيب زائر / مناوب (Locum)</option>
                  <option value="CONTRACTOR">متعاقد خارجي</option>
                  <option value="INTERN">تحت التدريب / امتياز</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الحالة الوظيفية
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as EmployeeStatus,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                >
                  <option value="ACTIVE">على رأس العمل</option>
                  <option value="PROBATION">فترة تجربة</option>
                  <option value="ON_LEAVE">إجازة</option>
                  <option value="SUSPENDED">موقوف</option>
                  <option value="RESIGNED">مستقيل</option>
                  <option value="TERMINATED">منتهية خدمته</option>
                </select>
              </div>
            </div>

            {/* Personal, Passport, Contact */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الجنس
                </label>
                <select
                  value={form.gender}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      gender: e.target.value as "MALE" | "FEMALE",
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                >
                  <option value="MALE">ذكر</option>
                  <option value="FEMALE">أنثى</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  تاريخ الميلاد
                </label>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) =>
                    setForm({ ...form, dateOfBirth: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الجنسية
                </label>
                <input
                  value={form.nationality}
                  onChange={(e) =>
                    setForm({ ...form, nationality: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  رقم الهاتف الأساسي
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="091xxxxxxx"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  رقم جواز السفر
                </label>
                <input
                  value={form.passportNo}
                  onChange={(e) =>
                    setForm({ ...form, passportNo: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  جهة الطوارئ (الاسم)
                </label>
                <input
                  value={form.emergencyContactName}
                  onChange={(e) =>
                    setForm({ ...form, emergencyContactName: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  هاتف الطوارئ
                </label>
                <input
                  value={form.emergencyContactPhone}
                  onChange={(e) =>
                    setForm({ ...form, emergencyContactPhone: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
            </div>
          </>
        )}

        {activeTab === "qualifications" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 items-end">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الدرجة العلمية *
                </label>
                <input
                  value={newQual.degree}
                  onChange={(e) =>
                    setNewQual({ ...newQual, degree: e.target.value })
                  }
                  placeholder="بكالوريوس / ماجستير / بورد"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  التخصص
                </label>
                <input
                  value={newQual.major}
                  onChange={(e) =>
                    setNewQual({ ...newQual, major: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">
                  الجامعة / المؤسسة *
                </label>
                <input
                  value={newQual.institution}
                  onChange={(e) =>
                    setNewQual({ ...newQual, institution: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  سنة التخرج
                </label>
                <input
                  type="number"
                  value={newQual.graduationYear}
                  onChange={(e) =>
                    setNewQual({ ...newQual, graduationYear: e.target.value })
                  }
                  placeholder="2020"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={handleAddQual}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> إضافة مؤهل
              </button>
            </div>

            <div className="space-y-2">
              {(isEdit
                ? existingEmployee?.qualifications || []
                : pendingQuals
              ).map((q: any, idx: number) => (
                <div
                  key={q.id ?? idx}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-100">{q.degree}</span>
                    {q.major && (
                      <span className="text-sky-400 mx-2">— {q.major}</span>
                    )}
                    <span className="text-slate-400">({q.institution})</span>
                    {q.graduationYear && (
                      <span className="text-slate-500 mx-2">
                        • {q.graduationYear}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (isEdit && employeeId && q.id) {
                        await hrService.removeQualification(employeeId, q.id);
                        refetchEmployee();
                      } else {
                        setPendingQuals((prev) =>
                          prev.filter((_, i) => i !== idx),
                        );
                      }
                    }}
                    className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "courses" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 items-end">
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">
                  اسم الدورة / الشهادة *
                </label>
                <input
                  value={newCourse.courseName}
                  onChange={(e) =>
                    setNewCourse({ ...newCourse, courseName: e.target.value })
                  }
                  placeholder="BLS / ACLS / إدارة الجودة"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الجهة التدريبية *
                </label>
                <input
                  value={newCourse.provider}
                  onChange={(e) =>
                    setNewCourse({ ...newCourse, provider: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  تاريخ الإتمام
                </label>
                <input
                  type="date"
                  value={newCourse.completionDate}
                  onChange={(e) =>
                    setNewCourse({
                      ...newCourse,
                      completionDate: e.target.value,
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الساعات
                </label>
                <input
                  type="number"
                  value={newCourse.hoursCount}
                  onChange={(e) =>
                    setNewCourse({ ...newCourse, hoursCount: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={handleAddCourse}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> إضافة دورة
              </button>
            </div>

            <div className="space-y-2">
              {(isEdit
                ? existingEmployee?.trainingCourses || []
                : pendingCourses
              ).map((c: any, idx: number) => (
                <div
                  key={c.id ?? idx}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-100">
                      {c.courseName}
                    </span>
                    <span className="text-slate-400 mx-2">— {c.provider}</span>
                    {c.hoursCount && (
                      <span className="text-sky-400">({c.hoursCount} ساعة)</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (isEdit && employeeId && c.id) {
                        await hrService.removeTrainingCourse(employeeId, c.id);
                        refetchEmployee();
                      } else {
                        setPendingCourses((prev) =>
                          prev.filter((_, i) => i !== idx),
                        );
                      }
                    }}
                    className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "documents" && (
          <div className="space-y-4">
            {!isEdit ? (
              <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                يرجى حفظ ملف الموظف أولاً ليتم فتح رفع الوثائق المشفرة (AES-256-GCM + فحص ClamAV).
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 items-end">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      عنوان الوثيقة *
                    </label>
                    <input
                      value={docForm.title}
                      onChange={(e) =>
                        setDocForm({ ...docForm, title: e.target.value })
                      }
                      placeholder="إذن مزاولة / صورة الجواز"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      التصنيف
                    </label>
                    <select
                      value={docForm.category}
                      onChange={(e) =>
                        setDocForm({ ...docForm, category: e.target.value })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                    >
                      <option value="LICENSE">إذن مزاولة</option>
                      <option value="HEALTH_CERT">شهادة صحية</option>
                      <option value="CONTRACT">عقد عمل</option>
                      <option value="ID_DOC">وثيقة هوية / جواز</option>
                      <option value="OTHER">أخرى</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      تاريخ الانتهاء
                    </label>
                    <input
                      type="date"
                      value={docForm.expiryDate}
                      onChange={(e) =>
                        setDocForm({ ...docForm, expiryDate: e.target.value })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      الملف *
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                      onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                      className="w-full text-xs text-slate-300"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={uploadingDoc}
                    onClick={handleUploadDocument}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-bold"
                  >
                    {uploadingDoc ? "جارِ التشفير..." : "رفع وتشفير"}
                  </button>
                </div>

                <div className="space-y-2">
                  {(existingEmployee?.documents || []).map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800 text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-100">
                          {doc.title}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                          {doc.originalName} • AES-256-GCM
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadDoc(doc.id, doc.originalName)
                          }
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" /> تنزيل
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!employeeId) return;
                            await hrService.removeDocument(employeeId, doc.id);
                            refetchEmployee();
                          }}
                          className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "financial" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  أساس الاحتساب
                </label>
                <select
                  value={form.payBasis}
                  onChange={(e) =>
                    setForm({ ...form, payBasis: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                >
                  <option value="MONTHLY">راتب شهري ثابت</option>
                  <option value="HOURLY">بالساعة الفعلية (البصمة)</option>
                  <option value="FIXED_SHIFT">مقطوعية حسب المناوبة (6/12/24)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  العملة (الافتراضي LYD)
                </label>
                <select
                  value={form.currency}
                  onChange={(e) =>
                    setForm({ ...form, currency: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  الراتب الأساسي
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={form.basicSalary}
                  onChange={(e) =>
                    setForm({ ...form, basicSalary: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  رصيد الإجازة السنوية (أيام)
                </label>
                <input
                  type="number"
                  value={form.annualLeaveBalance}
                  onChange={(e) =>
                    setForm({ ...form, annualLeaveBalance: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  بدل سكن
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={form.housingAllowance}
                  onChange={(e) =>
                    setForm({ ...form, housingAllowance: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  بدل مواصلات
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={form.transportAllowance}
                  onChange={(e) =>
                    setForm({ ...form, transportAllowance: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  بدلات وعلاوات أخرى
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={form.otherAllowance}
                  onChange={(e) =>
                    setForm({ ...form, otherAllowance: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  أجر الساعة الفعلية
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={form.hourlyRate}
                  onChange={(e) =>
                    setForm({ ...form, hourlyRate: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  قيمة مناوبة 6 ساعات
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={form.fixedShift6hRate}
                  onChange={(e) =>
                    setForm({ ...form, fixedShift6hRate: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  قيمة مناوبة 12 ساعة
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={form.fixedShift12hRate}
                  onChange={(e) =>
                    setForm({ ...form, fixedShift12hRate: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  قيمة مناوبة 24 ساعة
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={form.fixedShift24hRate}
                  onChange={(e) =>
                    setForm({ ...form, fixedShift24hRate: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  ساعات العمل الشهرية المعيارية
                </label>
                <input
                  type="number"
                  value={form.standardMonthlyHours}
                  onChange={(e) =>
                    setForm({ ...form, standardMonthlyHours: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-800">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  اسم المصرف
                </label>
                <input
                  value={form.bankName}
                  onChange={(e) =>
                    setForm({ ...form, bankName: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  رقم الحساب المصرفي
                </label>
                <input
                  value={form.bankAccountNo}
                  onChange={(e) =>
                    setForm({ ...form, bankAccountNo: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  IBAN
                </label>
                <input
                  value={form.iban}
                  onChange={(e) => setForm({ ...form, iban: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isTaxExempt}
                    onChange={(e) =>
                      setForm({ ...form, isTaxExempt: e.target.checked })
                    }
                    className="rounded border-slate-600"
                  />
                  إعفاء من ضريبة الدخل
                </label>
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isSocialInsuranceExempt}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        isSocialInsuranceExempt: e.target.checked,
                      })
                    }
                    className="rounded border-slate-600"
                  />
                  إعفاء من الضمان الاجتماعي
                </label>
              </div>
              {(form.isTaxExempt || form.isSocialInsuranceExempt) && (
                <div>
                  <label className="text-xs text-amber-300 block mb-1">
                    سبب الإعفاء الضريبي / الضمان *
                  </label>
                  <input
                    value={form.payrollExemptionReason}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        payrollExemptionReason: e.target.value,
                      })
                    }
                    placeholder="مثال: متعاقد بعقد خاص / قرار رقم ..."
                    className="w-full bg-slate-900 border border-amber-500/40 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
