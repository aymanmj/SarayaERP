// Script to add Phase 4 i18n keys for encounters, lab, radiology, pharmacy, and encounter details
const fs = require('fs');
const path = require('path');

const EN_PATH = path.join(__dirname, '..', 'client', 'src', 'locales', 'en.json');
const AR_PATH = path.join(__dirname, '..', 'client', 'src', 'locales', 'ar.json');

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function saveJSON(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8'); }

const en = loadJSON(EN_PATH);
const ar = loadJSON(AR_PATH);

// === COMMON KEYS ===
Object.assign(en.common, {
  refresh: en.common.refresh || "Refresh",
  searchPlaceholder: "Search...",
  previous: "Previous",
  next: "Next",
  saved: "Saved.",
  saveFailed: "Save failed.",
  back: "➜ Back",
  close: "Close",
  note: "Note:",
  selectAll: "Select All",
  deselectAll: "Deselect All",
  gender: { male: "Male", female: "Female" },
  age: { years: "years" },
  currency: { lyd: "LYD" },
  loadingContent: "Loading content..."
});

Object.assign(ar.common, {
  refresh: ar.common.refresh || "تحديث",
  searchPlaceholder: "بحث...",
  previous: "السابق",
  next: "التالي",
  saved: "تم الحفظ.",
  saveFailed: "فشل الحفظ.",
  back: "➜ رجوع",
  close: "إغلاق",
  note: "ملاحظة:",
  selectAll: "تحديد الكل",
  deselectAll: "إلغاء الكل",
  gender: { male: "ذكر", female: "أنثى" },
  age: { years: "سنة" },
  currency: { lyd: "د.ل" },
  loadingContent: "تحميل المحتوى..."
});

// === ENCOUNTERS ===
en.encounters = {
  title: "Medical Records",
  subtitle: "Track visits, emergencies, and active admissions.",
  loadFailed: "Failed to load medical records",
  loading: "Loading records...",
  empty: "No records match the search criteria.",
  unknownPatient: "Unknown patient",
  unassignedDoctor: "Unassigned",
  patientHistoryLabel: "Patient history ID:",
  type: { er: "Emergency", ipd: "Admission", opd: "Outpatient" },
  stats: { active: "Active Cases", er: "In ER", ipd: "Admitted" },
  filters: {
    searchLabel: "Quick Search",
    searchPlaceholder: "Case number, MRN, or patient name...",
    typeLabel: "Case Type",
    all: "All",
    opd: "Outpatient Clinics",
    er: "Emergency",
    ipd: "Admission"
  },
  table: {
    id: "Case #",
    admissionDate: "Admission Date",
    patient: "Patient",
    typeDepartment: "Type / Department",
    doctor: "Doctor",
    status: "Status",
    actions: "Actions"
  },
  status: { open: "Active", closed: "Completed", cancelled: "Cancelled" },
  actions: { openFile: "Open File ➜" },
  pagination: { total: "Total Records:" }
};

ar.encounters = {
  title: "سجل الحالات الطبية",
  subtitle: "متابعة الزيارات، حالات الطوارئ، وعمليات الإيواء النشطة.",
  loadFailed: "فشل تحميل سجل الحالات الطبية",
  loading: "جارِ تحميل السجلات...",
  empty: "لا توجد حالات مسجلة تطابق البحث.",
  unknownPatient: "مريض غير معروف",
  unassignedDoctor: "غير محدد",
  patientHistoryLabel: "عرض تاريخ المريض ID:",
  type: { er: "طوارئ", ipd: "إيواء", opd: "عيادة" },
  stats: { active: "الحالات النشطة", er: "في الطوارئ", ipd: "قيد الإيواء" },
  filters: {
    searchLabel: "بحث سريع",
    searchPlaceholder: "رقم الحالة، MRN، أو اسم المريض...",
    typeLabel: "نوع الحالة",
    all: "الكل",
    opd: "عيادات خارجية",
    er: "طوارئ",
    ipd: "إيواء"
  },
  table: {
    id: "رقم الحالة",
    admissionDate: "تاريخ الدخول",
    patient: "المريض",
    typeDepartment: "النوع / القسم",
    doctor: "الطبيب",
    status: "الحالة",
    actions: "إجراءات"
  },
  status: { open: "نشطة", closed: "مكتملة", cancelled: "ملغاة" },
  actions: { openFile: "فتح الملف ➜" },
  pagination: { total: "إجمالي السجلات:" }
};

// === LAB ===
en.lab = {
  title: "Lab Worklist",
  subtitle: "Enter results and print aggregate reports.",
  loadFailed: "Error loading the worklist.",
  paymentRequired: "⚠️ Cannot enter result before payment.",
  paymentRequiredStart: "⚠️ Payment is required before starting analysis.",
  startSuccess: "✅ Order sent to analyzer (HL7).",
  startFailed: "Failed to start analysis.",
  empty: "No orders found.",
  encounterLabel: "Encounter #",
  orderDate: "Order Date:",
  statusLabel: "Status:",
  prompt: {
    enterResult: "Enter result",
    forPatient: "for patient",
    unit: "Unit of measure (optional):",
    referenceRange: "Reference range (optional):"
  },
  payment: { paid: "Paid", waived: "Waived", unpaid: "Unpaid" },
  status: { completed: "Completed", inProgress: "In Progress...", pending: "Pending" },
  actions: {
    start: "⚡ Start Analysis",
    editResult: "Edit Result",
    enterResult: "Enter Result",
    report: "Aggregate Report"
  }
};

ar.lab = {
  title: "قائمة المعمل",
  subtitle: "إدخال النتائج وطباعة التقارير المجمعة.",
  loadFailed: "حدث خطأ أثناء تحميل القائمة.",
  paymentRequired: "⚠️ لا يمكن إدخال النتيجة قبل سداد الرسوم.",
  paymentRequiredStart: "⚠️ يجب سداد الرسوم قبل بدء التحليل.",
  startSuccess: "✅ تم إرسال الطلب للجهاز (HL7).",
  startFailed: "فشل بدء التحليل.",
  empty: "لا توجد طلبات.",
  encounterLabel: "الحالة #",
  orderDate: "تاريخ الطلب:",
  statusLabel: "الحالة:",
  prompt: {
    enterResult: "إدخال نتيجة",
    forPatient: "للمريض",
    unit: "وحدة القياس (اختياري):",
    referenceRange: "المعدل المرجعي (اختياري):"
  },
  payment: { paid: "تم الدفع", waived: "معفى", unpaid: "غير مدفوع" },
  status: { completed: "مكتمل", inProgress: "جاري التحليل...", pending: "انتظار" },
  actions: {
    start: "⚡ بدء التحليل",
    editResult: "تعديل النتيجة",
    enterResult: "إدخال النتيجة",
    report: "تقرير مجمع"
  }
};

// === RADIOLOGY ===
en.radiology = {
  title: "Radiology Worklist",
  subtitle: "View imaging orders, enter reports, and print results.",
  loadFailed: "Error loading the worklist.",
  startSuccess: "✅ Imaging started and order sent (HL7).",
  startFailed: "Failed to start imaging.",
  reportSaved: "Report saved and order completed.",
  empty: "No orders found.",
  orderDate: "Order Date:",
  statusLabel: "Status:",
  prompt: { enterReport: "Enter radiology report for patient" },
  status: {
    pending: "Pending",
    scheduled: "Scheduled",
    inProgress: "Imaging in Progress...",
    completed: "Completed"
  },
  actions: {
    start: "⚡ Start Exam",
    editReport: "Edit Report",
    enterReport: "Enter Report",
    print: "Print"
  }
};

ar.radiology = {
  title: "قائمة الأشعة (Worklist)",
  subtitle: "عرض طلبات الأشعة، إدخال التقارير، وطباعة النتائج.",
  loadFailed: "حدث خطأ أثناء تحميل القائمة.",
  startSuccess: "✅ تم بدء التصوير وإرسال الطلب (HL7).",
  startFailed: "فشل بدء التصوير.",
  reportSaved: "تم حفظ التقرير وإكمال الطلب.",
  empty: "لا توجد طلبات.",
  orderDate: "تاريخ الطلب:",
  statusLabel: "الحالة:",
  prompt: { enterReport: "أدخل تقرير الأشعة للمريض" },
  status: {
    pending: "قيد الانتظار",
    scheduled: "مجدول",
    inProgress: "جاري التصوير...",
    completed: "مكتمل"
  },
  actions: {
    start: "⚡ بدء الفحص",
    editReport: "تعديل التقرير",
    enterReport: "إدخال التقرير",
    print: "طباعة"
  }
};

// === PHARMACY ===
en.pharmacy = {
  title: "Pharmacy Dispensing",
  subtitle: "Pending prescriptions waiting to be dispensed.",
  loadFailed: "Failed to load the list.",
  operationFailed: "Operation failed.",
  stockLink: "Stock",
  viewAndDispense: "View & Dispense",
  processing: "Processing...",
  confirmDispenseIPD: "Confirm Ward Dispense",
  confirmDispenseAndPay: "Confirm Dispense & Pay",
  emptyState: "No prescriptions waiting.",
  notes: { ipdDispense: "IPD Dispense", posDispense: "POS Dispense" },
  success: {
    ipdDispensed: "Medications dispensed and sent to the ward.",
    dispensePaid: "Dispensed and payment processed successfully."
  },
  table: {
    prescriptionNo: "Rx #",
    patientType: "Patient Type",
    patient: "Patient",
    doctor: "Doctor",
    date: "Date",
    itemCount: "Items",
    actions: "Actions"
  },
  patientType: { inpatient: "Inpatient", outpatient: "Outpatient / ER" },
  modal: {
    dispenseTitle: "Dispense Rx #",
    inpatientBadge: "Inpatient",
    patientLabel: "Patient:",
    prescribedDrug: "Prescribed Drug",
    substitute: "Substitute / Actual Dispensed",
    quantity: "Quantity",
    price: "Price",
    total: "Total",
    sameGenericGroup: "Same generic alternatives",
    stockLabel: "Stock:",
    allDrugsGroup: "All drugs",
    insufficientStock: "⚠️ Insufficient stock",
    totalRequired: "Total Required:",
    paymentMethod: "Payment Method",
    amountReceived: "Amount Received",
    ipdInfoTitle: "ℹ️ This patient is admitted (Inpatient).",
    ipdInfoBody: "Medications will be dispensed and added to the open bill (Charge) without immediate payment."
  },
  payment: { cash: "Cash", card: "Card", insurance: "Insurance" }
};

ar.pharmacy = {
  title: "صرف الوصفات (الصيدلية)",
  subtitle: "قائمة الوصفات المعلقة للصرف.",
  loadFailed: "فشل تحميل القائمة.",
  operationFailed: "فشل العملية.",
  stockLink: "المخزون",
  viewAndDispense: "عرض وصرف",
  processing: "جارِ التنفيذ...",
  confirmDispenseIPD: "تأكيد الصرف للعنبر",
  confirmDispenseAndPay: "تأكيد الصرف والدفع",
  emptyState: "لا توجد وصفات في الانتظار.",
  notes: { ipdDispense: "صرف للعنبر (IPD Dispense)", posDispense: "صرف مباشر (POS)" },
  success: {
    ipdDispensed: "تم صرف الأدوية وإرسالها للعنبر.",
    dispensePaid: "تم الصرف والدفع بنجاح."
  },
  table: {
    prescriptionNo: "رقم الوصفة",
    patientType: "نوع المريض",
    patient: "المريض",
    doctor: "الطبيب",
    date: "التاريخ",
    itemCount: "عدد الأصناف",
    actions: "إجراءات"
  },
  patientType: { inpatient: "إيواء (منوم)", outpatient: "خارجي / طوارئ" },
  modal: {
    dispenseTitle: "صرف الوصفة #",
    inpatientBadge: "مريض إيواء",
    patientLabel: "المريض:",
    prescribedDrug: "الدواء الموصوف",
    substitute: "البديل / المصروف فعلياً",
    quantity: "الكمية",
    price: "السعر",
    total: "الإجمالي",
    sameGenericGroup: "بدائل بنفس الاسم العلمي",
    stockLabel: "رصيد:",
    allDrugsGroup: "كل الأدوية",
    insufficientStock: "⚠️ الرصيد غير كافٍ",
    totalRequired: "الإجمالي المطلوب:",
    paymentMethod: "طريقة الدفع",
    amountReceived: "المبلغ المستلم",
    ipdInfoTitle: "ℹ️ هذا المريض في حالة إيواء (Inpatient).",
    ipdInfoBody: "سيتم صرف الأدوية وإضافتها للفاتورة المفتوحة (Charge) دون دفع فوري."
  },
  payment: { cash: "نقداً", card: "بطاقة", insurance: "تأمين" }
};

// === ENCOUNTER DETAILS ===
en.encounter = {
  tabs: {
    visits: "Diagnosis & Visit",
    allergies: "Allergies & Risks",
    obgyn: "OBGYN",
    andrology: "Andrology",
    labs: "Laboratory",
    radiology: "Radiology",
    prescriptions: "Prescriptions",
    billing: "Billing"
  },
  loading: {
    medicalFile: "Loading medical file...",
    vitals: "Loading vitals panel...",
    diagnosis: "Loading diagnosis panel...",
    allergies: "Loading allergies & risks...",
    obgyn: "Loading OBGYN module...",
    labs: "Loading lab tab...",
    radiology: "Loading radiology tab...",
    prescriptions: "Loading prescriptions tab...",
    billing: "Loading billing tab...",
    quickSummary: "Loading quick summary...",
    quickProtocols: "Loading quick protocols..."
  },
  error: {
    notFound: "File not found.",
    assignFailed: "Assignment failed.",
    saveFailed: "Save failed.",
    dischargeFailed: "Discharge failed",
    admitFailed: "Admission failed",
    aiCodingFailed: "AI clinical note analysis failed",
    applyCodesFailed: "Failed to apply medical codes"
  },
  success: {
    doctorAssigned: "You have been assigned as the attending doctor.",
    noteSaved: "Clinical note saved.",
    discharged: "Patient discharged and file closed.",
    admitted: "Patient admitted successfully and added to active admissions.",
    codesApplied: "✅ Successfully applied"
  },
  warning: {
    writeNotesFirst: "Please write clinical notes first for AI analysis.",
    selectDepartment: "Please select the destination department"
  },
  confirm: { discharge: "Are you sure you want to discharge the patient and close the file?" },
  quickSummary: {
    title: "Quick Summary",
    vitals: "Vital Signs:",
    recorded: "recorded",
    noReadings: "No readings",
    primaryDiagnosis: "Primary Diagnosis:",
    unavailable: "Not available",
    fileStatus: "File Status:"
  },
  status: { open: "🟢 Open", closed: "🔒 Closed", cancelled: "❌ Cancelled" },
  protocols: {
    confirmExecute: "Confirm executing protocol with all its clinical orders for this case?",
    executeSuccess: "Orders approved and sent successfully",
    executeFailed: "Failed to execute protocol",
    confirmEnroll: "Confirm enrolling the patient in this clinical pathway?",
    enrollSuccess: "Patient enrolled and pathway started",
    enrollFailed: "Failed to enroll in pathway",
    orderSetsTitle: "⚡ Order Sets",
    categoryGeneral: "General",
    defaultDescription: "Auto-execute attached orders",
    pathwaysTitle: "🛤️ Clinical Pathways",
    losLabel: "LOS:",
    defaultPathwayDesc: "Day-by-day treatment plan",
    manageProtocols: "Manage Protocols ←",
    managePathways: "Manage Clinical Pathways ←"
  },
  header: {
    mpiBadge: "🌐 MPI",
    medicalRecord: "📋 Medical Record",
    dischargeSummary: "📝 Discharge Summary",
    attendingDoctor: "Attending Doctor",
    assignToMe: "✋ Take Over Case",
    fileClosed: "🔒 File Closed",
    admissionDate: "Admission:",
    chiefComplaint: "Complaint:"
  },
  type: { er: "Emergency", ipd: "Admission", opd: "Outpatient" },
  transfer: {
    pendingTitle: "Transfer request pending (Transfer Pending)",
    statusRequested: "Awaiting receiving department to allocate a bed.",
    statusBedAllocated: "Bed allocated! Please coordinate SBAR Handover before physical transfer.",
    statusHandoverSigned: "Handover completed. Awaiting confirmation of patient arrival.",
    statusDefault: "Request is being processed.",
    statusLabel: "Status:"
  },
  decision: {
    title: "⚖️ Medical Decision",
    subtitle: "Based on assessment, please make the appropriate decision:",
    discharge: "🏠 Discharge",
    admission: "🛏️ Admission",
    delivery: "👶 Delivery Registration"
  },
  transferOrders: {
    title: "🔄 Transfer Orders",
    pending: "⏳ Transfer request pending",
    cannotRequest: "Cannot request a new transfer at this time",
    requestTransfer: "🚑 Request Transfer (Ward/Unit)"
  },
  admission: { erReason: "Admission from Emergency Department" },
  obgyn: {
    anc: "🤰 Antenatal Care (ANC)",
    ivf: "🧬 Fertility (IVF)",
    newDelivery: "👶 Register New Delivery"
  },
  andrology: {
    title: "🧬 Andrology & Infertility File",
    description: "Access andrology clinic file, semen analysis, and shared fertility records.",
    semenAnalysis: "🔬 Semen Analysis",
    sharedIvf: "💑 Shared Fertility File (IVF)"
  },
  admitModal: {
    title: "Admission Decision",
    departmentLabel: "To which department?",
    selectDepartment: "-- Select Department --",
    wardLabel: "Ward (optional)",
    selectWard: "-- Select Ward --",
    bedsAvailable: "beds available)",
    bedLabel: "Bed",
    noBedsAvailable: "⚠️ No beds available in this ward.",
    selectBed: "-- Select Bed --",
    roomBedOption: "Room {{roomNumber}} — Bed {{bedNumber}}",
    bedOptionalNote: "* Bed selection is optional. You can assign a bed later from the admissions page.",
    confirm: "Confirm Admission"
  },
  ai: {
    modalTitle: "AI Assistant — Medical Code Analysis & Approval",
    analyzing: "AI is analyzing notes and extracting codes...",
    evaluationTypes: "ICD-10 + CPT + E&M Evaluation",
    reasoningTitle: "🧠 AI Reasoning Analysis",
    suggestedDiagnoses: "Suggested ICD-10 Diagnoses",
    confidence: "% confidence",
    typePrimary: "Primary",
    typeSecondary: "Secondary",
    suggestedProcedures: "Suggested CPT Procedures",
    noCodesFound: "AI did not identify any precise medical codes from the written notes.",
    instructionNote: "Select appropriate codes and click 'Apply' to auto-save them to diagnosis and billing. Codes not linked to system services will show as alerts.",
    loadError: "Error loading suggestions.",
    selectedCodes: "code(s) selected",
    applying: "Applying...",
    applySelected: "✅ Apply Selected",
    diagnosisCount: "diagnosis",
    procedureCount: "procedure"
  }
};

ar.encounter = {
  tabs: {
    visits: "التشخيص والزيارة",
    allergies: "الحساسية والمخاطر",
    obgyn: "النساء والولادة",
    andrology: "أمراض الذكورة",
    labs: "المختبر",
    radiology: "الأشعة",
    prescriptions: "الأدوية",
    billing: "الفوترة"
  },
  loading: {
    medicalFile: "جارِ تحميل الملف الطبي...",
    vitals: "تحميل لوحة العلامات الحيوية...",
    diagnosis: "تحميل لوحة التشخيص...",
    allergies: "تحميل لوحة الحساسية والمخاطر...",
    obgyn: "تحميل ملف النساء والولادة...",
    labs: "تحميل تبويب المختبر...",
    radiology: "تحميل تبويب الأشعة...",
    prescriptions: "تحميل تبويب الأدوية...",
    billing: "تحميل تبويب الفوترة...",
    quickSummary: "تحميل الملخص السريع...",
    quickProtocols: "تحميل البروتوكولات السريعة..."
  },
  error: {
    notFound: "الملف غير موجود.",
    assignFailed: "فشل التعيين.",
    saveFailed: "فشل الحفظ.",
    dischargeFailed: "فشل تسجيل الخروج",
    admitFailed: "فشل الإيواء",
    aiCodingFailed: "فشل تحليل الملاحظة السريرية بواسطة الذكاء الاصطناعي",
    applyCodesFailed: "فشل اعتماد الأكواد الطبية"
  },
  success: {
    doctorAssigned: "تم تعيينك طبيباً للحالة.",
    noteSaved: "تم حفظ الملاحظة السريرية.",
    discharged: "تم تسجيل خروج المريض وإغلاق الملف.",
    admitted: "تم تحويل المريض للإيواء بنجاح وأُضيف لجدول التنويم النشط.",
    codesApplied: "✅ تم اعتماد"
  },
  warning: {
    writeNotesFirst: "يرجى كتابة ملاحظات سريرية أولاً ليتم تحليلها.",
    selectDepartment: "يرجى اختيار القسم المحول إليه"
  },
  confirm: { discharge: "هل أنت متأكد من قرار خروج المريض (Discharge) وإغلاق الملف؟" },
  quickSummary: {
    title: "ملخص سريع",
    vitals: "العلامات الحيوية:",
    recorded: "مسجلة",
    noReadings: "لا توجد قراءات",
    primaryDiagnosis: "التشخيص المبدئي:",
    unavailable: "غير متوفر",
    fileStatus: "حالة الملف:"
  },
  status: { open: "🟢 مفتوح", closed: "🔒 مغلق", cancelled: "❌ ملغي" },
  protocols: {
    confirmExecute: "تأكيد تنفيذ بروتوكول بجميع طلباته السريرية لهذه الحالة؟",
    executeSuccess: "تم الاعتماد وإرسال الطلبات بنجاح",
    executeFailed: "تعذر تنفيذ البروتوكول",
    confirmEnroll: "تأكيد إدراج الحالة في المسار العلاجي؟",
    enrollSuccess: "تم إدراج المريض وبدء المسار العلاجي",
    enrollFailed: "تعذر الإدراج في المسار",
    orderSetsTitle: "⚡ أوامر المجموعات (Order Sets)",
    categoryGeneral: "عام",
    defaultDescription: "تنفيذ الإجراءات المرفقة تلقائياً",
    pathwaysTitle: "🛤️ مسارات العلاج (Pathways)",
    losLabel: "LOS:",
    defaultPathwayDesc: "خطة علاجية مقسمة على الأيام",
    manageProtocols: "إدارة محتوى البروتوكولات ←",
    managePathways: "إدارة المسارات السريرية ←"
  },
  header: {
    mpiBadge: "🌐 MPI",
    medicalRecord: "📋 السجل الطبي",
    dischargeSummary: "📝 ملخص الخروج (Discharge Summary)",
    attendingDoctor: "الطبيب المعالج",
    assignToMe: "✋ تولي الحالة",
    fileClosed: "🔒 ملف مغلق",
    admissionDate: "دخول:",
    chiefComplaint: "الشكوى:"
  },
  type: { er: "طوارئ", ipd: "دخول / إيواء", opd: "عيادة" },
  transfer: {
    pendingTitle: "يوجد طلب نقل قيد المعالجة (Transfer Pending)",
    statusRequested: "بانتظار طبيب/تمريض القسم المستقبل لتخصيص سرير للمريض.",
    statusBedAllocated: "تم تخصيص السرير بنجاح! يرجى التواصل مع فريق التمريض لتسليم الحالة (SBAR Handover) قبل نقل المريض فعلياً.",
    statusHandoverSigned: "تم تسليم الحالة. بانتظار تأكيد وصول المريض للقسم المستقبل.",
    statusDefault: "الطلب قيد المعالجة.",
    statusLabel: "الحالة:"
  },
  decision: {
    title: "⚖️ القرار الطبي",
    subtitle: "بناءً على التقييم، يرجى اتخاذ القرار المناسب للحالة:",
    discharge: "🏠 خروج (Discharge)",
    admission: "🛏️ دخول (Admission)",
    delivery: "👶 تسجيل ولادة (Delivery)"
  },
  transferOrders: {
    title: "🔄 أوامر النقل",
    pending: "⏳ طلب النقل قيد الانتظار",
    cannotRequest: "لا يمكنك طلب نقل جديد حالياً",
    requestTransfer: "🚑 طلب نقل (عناية/قسم)"
  },
  admission: { erReason: "دخول من قسم الطوارئ" },
  obgyn: {
    anc: "🤰 متابعة الحمل (ANC)",
    ivf: "🧬 الحقن المجهري (IVF)",
    newDelivery: "👶 تسجيل ولادة جديدة"
  },
  andrology: {
    title: "🧬 ملف أمراض الذكورة والعقم",
    description: "يمكنك من هنا الوصول لملف المريض في عيادة أمراض الذكورة وتحاليل السائل المنوي وملفات العقم المشتركة.",
    semenAnalysis: "🔬 تحليل السائل المنوي",
    sharedIvf: "💑 ملف العقم المشترك (IVF)"
  },
  admitModal: {
    title: "قرار إيواء المريض",
    departmentLabel: "إلى أي قسم؟",
    selectDepartment: "-- اختر القسم --",
    wardLabel: "العنبر (اختياري)",
    selectWard: "-- اختر العنبر --",
    bedsAvailable: "سرير متاح)",
    bedLabel: "السرير",
    noBedsAvailable: "⚠️ لا توجد أسرّة متاحة في هذا العنبر.",
    selectBed: "-- اختر السرير --",
    roomBedOption: "غرفة {{roomNumber}} — سرير {{bedNumber}}",
    bedOptionalNote: "* اختيار السرير اختياري. يمكن تعيين السرير لاحقاً من صفحة حالات الإيواء.",
    confirm: "تأكيد الدخول"
  },
  ai: {
    modalTitle: "المساعد الذكي — تحليل واعتماد الأكواد الطبية",
    analyzing: "يقوم الذكاء الاصطناعي بتحليل الملاحظات واستخراج الأكواد...",
    evaluationTypes: "ICD-10 + CPT + E&M Evaluation",
    reasoningTitle: "🧠 التحليل المنطقي للذكاء الاصطناعي (Reasoning)",
    suggestedDiagnoses: "تشخيصات ICD-10 المقترحة",
    confidence: "% ثقة",
    typePrimary: "رئيسي (Primary)",
    typeSecondary: "ثانوي (Secondary)",
    suggestedProcedures: "إجراءات CPT المقترحة",
    noCodesFound: "لم يتعرف الذكاء الاصطناعي على أية أكواد طبية دقيقة من الملاحظات المكتوبة.",
    instructionNote: "اختر الأكواد المناسبة واضغط \"اعتماد\" لحفظها تلقائياً في التشخيص والفوترة. الأكواد غير المرتبطة بخدمات في النظام ستظهر كتنبيهات.",
    loadError: "حدث خطأ أثناء تحميل الاقتراحات.",
    selectedCodes: "كود مُختار",
    applying: "جاري الاعتماد...",
    applySelected: "✅ اعتماد المختار",
    diagnosisCount: "تشخيص",
    procedureCount: "إجراء"
  }
};

// Save both files
saveJSON(EN_PATH, en);
saveJSON(AR_PATH, ar);

console.log('✅ Phase 4 locale keys added successfully!');
console.log(`EN keys: encounters, lab, radiology, pharmacy, encounter + common updates`);
console.log(`AR keys: encounters, lab, radiology, pharmacy, encounter + common updates`);
