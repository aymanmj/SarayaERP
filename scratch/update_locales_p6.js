const fs = require('fs');
const path = require('path');

const EN_PATH = path.join(__dirname, '..', 'client', 'src', 'locales', 'en.json');
const AR_PATH = path.join(__dirname, '..', 'client', 'src', 'locales', 'ar.json');

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function saveJSON(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8'); }

const en = loadJSON(EN_PATH);
const ar = loadJSON(AR_PATH);

// Beds translations
en.beds = {
  dashboardTitle: "Bed Management Dashboard",
  dashboardSubtitle: "Real-time monitoring of hospital beds",
  setupTitle: "Inpatient Setup & Settings",
  setupSubtitle: "Manage wards, rooms, beds, and admission pricing.",
  addWardBtn: "+ Add New Ward",
  addRoomBtn: "+ Add Room",
  addBedBtn: "+ Bed",
  roomPh: "Room number/name",
  bedPh: "Bed Number",
  saveBtn: "Save",
  createBtn: "Create",
  emptyLabel: "Empty",
  typeLabel: "Type:",
  rateLabel: "Nightly Rate:",
  unpriced: "Unpriced!",
  deptLabel: "Department:",
  saveChanges: "Save Changes",
  editWard: "Edit Ward",
  addWard: "Add New Ward",
  wardName: "Ward Name",
  wardType: "Type",
  wardTypeGeneral: "General",
  wardTypeIcu: "Intensive Care (ICU)",
  wardTypePrivate: "Private",
  wardDept: "Department (optional)",
  selectWardDept: "-- Department (optional) --",
  pricingService: "Pricing Service (Service Item)",
  selectPricingService: "-- Choose Daily Rate Service --",
  pricingNote: "BED type services must be defined in services master to appear here.",
  cancel: "Cancel",
  loadFailed: "Failed to load data",
  updateSuccess: "Updated successfully",
  wardCreated: "Ward created successfully",
  opFailed: "Operation failed",
  confirmDeleteWard: "Are you sure you want to delete this ward? (It must not contain rooms)",
  deleteSuccess: "Deleted successfully",
  deleteFailed: "Deletion failed",
  roomAdded: "Room added successfully",
  roomAddFailed: "Failed to add room",
  updateFailed: "Failed to update",
  confirmDeleteRoom: "Are you sure you want to delete this room? (It must not contain beds)",
  bedAdded: "Bed added successfully",
  bedAddFailed: "Failed to add bed",
  confirmDeleteBed: "Are you sure you want to delete this bed? (Cannot delete if occupied by a patient)",
  stats: {
    total: "Total Beds",
    available: "Available",
    occupied: "Occupied",
    occupancyRate: "Occupancy Rate",
    cleaning: "Cleaning",
    maintenance: "Maintenance",
    blocked: "Blocked",
    turnoverRate: "Turnover Rate"
  },
  tabs: {
    overview: "Overview",
    wards: "Wards",
    activities: "Activities"
  },
  filters: {
    search: "Search ward or room...",
    allStatuses: "All Statuses"
  },
  card: {
    total: "Total:",
    occupied: "Occupied:",
    available: "Available:",
    cleaning: "Cleaning:",
    viewDetails: "View Details"
  },
  statuses: {
    AVAILABLE: "Available",
    OCCUPIED: "Occupied",
    CLEANING: "Cleaning",
    MAINTENANCE: "Maintenance",
    BLOCKED: "Blocked"
  },
  confirmClean: "Do you want to mark bed {{bedNumber}} as clean?",
  notesPrompt: "Enter notes for bed {{bedNumber}}:",
  activity: {
    title: "Recent Activities",
    empty: "No recent activities",
    assigned: "Bed assigned",
    released: "Bed released",
    cleaning: "Cleaning started",
    maintenance: "Maintenance started",
    patient: "Patient:",
    notes: "Notes:"
  }
};

ar.beds = {
  dashboardTitle: "لوحة تحكم الأسرة",
  dashboardSubtitle: "مراقبة حالة الأسرة في المستشفى بشكل مباشر",
  setupTitle: "إعدادات الأقسام الداخلية (Inpatient Setup)",
  setupSubtitle: "إدارة العنابر، الغرف، الأسرة، وتسعير الإقامة.",
  addWardBtn: "+ إضافة عنبر جديد",
  addRoomBtn: "+ إضافة غرفة",
  addBedBtn: "+ سرير",
  roomPh: "رقم/اسم الغرفة",
  bedPh: "رقم السرير",
  saveBtn: "حفظ",
  createBtn: "إنشاء",
  emptyLabel: "فارغة",
  typeLabel: "النوع:",
  rateLabel: "سعر الليلة:",
  unpriced: "غير مسعر!",
  deptLabel: "القسم:",
  saveChanges: "حفظ التغييرات",
  editWard: "تعديل عنبر",
  addWard: "إضافة عنبر جديد",
  wardName: "اسم العنبر",
  wardType: "النوع",
  wardTypeGeneral: "عام (General)",
  wardTypeIcu: "عناية مركزة (ICU)",
  wardTypePrivate: "خاص (Private)",
  wardDept: "القسم التابع له (اخياري)",
  selectWardDept: "-- القسم (اختياري) --",
  pricingService: "خدمة التسعير (Service Item)",
  selectPricingService: "-- اختر خدمة السعر اليومي --",
  pricingNote: "يجب تعريف خدمات \"إقامة\" (Type: BED) في دليل الخدمات لتظهر هنا.",
  cancel: "إلغاء",
  loadFailed: "فشل تحميل البيانات",
  updateSuccess: "تم التعديل بنجاح",
  wardCreated: "تم إنشاء العنبر",
  opFailed: "فشلت العملية",
  confirmDeleteWard: "هل أنت متأكد من حذف هذا العنبر؟ (يجب ألا يحتوي على غرف)",
  deleteSuccess: "تم الحذف بنجاح",
  deleteFailed: "فشل الحذف",
  roomAdded: "تمت إضافة الغرفة",
  roomAddFailed: "فشل إضافة الغرفة",
  updateFailed: "فشل التعديل",
  confirmDeleteRoom: "هل أنت متأكد من حذف هذه الغرفة؟ (يجب ألا تحتوي على أسِرة)",
  bedAdded: "تمت إضافة السرير",
  bedAddFailed: "فشل إضافة السرير",
  confirmDeleteBed: "هل أنت متأكد من حذف هذا السرير؟ (لا يمكن الحذف إذا كان مريض منوماً فيه)",
  stats: {
    total: "إجمالي الأسرة",
    available: "متاحة",
    occupied: "مشغولة",
    occupancyRate: "نسبة الإشغال",
    cleaning: "قيد التنظيف",
    maintenance: "الصيانة",
    blocked: "محجوزة",
    turnoverRate: "معدل الدوران"
  },
  tabs: {
    overview: "نظرة عامة",
    wards: "العنابر",
    activities: "النشاطات"
  },
  filters: {
    search: "البحث عن عنبر أو غرفة...",
    allStatuses: "جميع الحالات"
  },
  card: {
    total: "الإجمالي:",
    occupied: "مشغول:",
    available: "متاح:",
    cleaning: "تنظيف:",
    viewDetails: "عرض التفاصيل"
  },
  statuses: {
    AVAILABLE: "متاح",
    OCCUPIED: "مشغول",
    CLEANING: "تنظيف",
    MAINTENANCE: "صيانة",
    BLOCKED: "محجوز"
  },
  confirmClean: "هل تريد وضع علامة \"نظيف\" على السرير {{bedNumber}}؟",
  notesPrompt: "أدخل ملاحظات للسرير {{bedNumber}}:",
  activity: {
    title: "النشاطات الأخيرة",
    empty: "لا توجد نشاطات حديثة",
    assigned: "تم حجز السرير",
    released: "تم تحرير السرير",
    cleaning: "تم بدء التنظيف",
    maintenance: "تم بدء الصيانة",
    patient: "المريض:",
    notes: "ملاحظات:"
  }
};

// Housekeeping translations
en.housekeeping = {
  title: "Housekeeping Management",
  subtitle: "List of beds requiring cleaning and preparation.",
  refresh: "Refresh",
  loadSuccess: "Bed cleaned and is now available.",
  loadError: "Failed to update.",
  markClean: "Mark Clean ✅",
  emptyState: "✨ All beds are clean and ready.",
  loading: "Searching for beds...",
  roomLabel: "Room"
};

ar.housekeeping = {
  title: "إدارة النظافة (Housekeeping)",
  subtitle: "قائمة الأسرة التي تحتاج إلى تنظيف وتجهيز.",
  refresh: "تحديث",
  loadSuccess: "تم تنظيف السرير وأصبح متاحاً.",
  loadError: "فشل التحديث.",
  markClean: "تم التنظيف ✅",
  emptyState: "✨ جميع الأسرة نظيفة وجاهزة.",
  loading: "جارِ البحث عن أسرة...",
  roomLabel: "غرفة"
};

// Referrals translations
en.referrals = {
  title: "Referral System",
  subtitle: "Refer patients between doctors and track status",
  newReferral: "+ New Referral",
  sendReferral: "Send Referral",
  cancel: "Cancel",
  accept: "Accept",
  reject: "Reject",
  complete: "Complete",
  confirmComplete: "Confirm Completion",
  confirmReject: "Confirm Rejection",
  tabReceived: "Received Referrals",
  tabSent: "Sent Referrals",
  loading: "Loading...",
  empty: "No referrals",
  table: {
    no: "#",
    patient: "Patient",
    fromDoctor: "From Doctor",
    toDoctor: "To Doctor",
    reason: "Reason",
    priority: "Priority",
    status: "Status",
    date: "Date",
    actions: "Actions"
  },
  status: {
    PENDING: "Pending",
    ACCEPTED: "Accepted",
    COMPLETED: "Completed",
    REJECTED: "Rejected",
    CANCELLED: "Cancelled"
  },
  priority: {
    URGENT: "Urgent",
    ROUTINE: "Routine"
  },
  form: {
    patient: "Patient *",
    patientSearchPlaceholder: "Search by name or MRN...",
    receivingDoctor: "Receiving Doctor *",
    selectDoctor: "Select Doctor...",
    reason: "Reason for Referral *",
    reasonPlaceholder: "Reason...",
    clinicalSummary: "Clinical Summary",
    clinicalSummaryPlaceholder: "Clinical summary of the case...",
    priority: "Priority"
  },
  actionModal: {
    completeTitle: "Complete Referral",
    rejectTitle: "Reject Referral",
    notes: "Notes",
    completePlaceholder: "Consultation result or notes...",
    rejectPlaceholder: "Reason for rejection..."
  },
  alerts: {
    loadFailed: "Failed to load referrals",
    requiredFields: "Please fill in all required fields",
    createSuccess: "Referral created successfully",
    createFailed: "Failed to create referral",
    acceptSuccess: "Referral accepted",
    completeSuccess: "Referral completed",
    rejectSuccess: "Referral rejected",
    cancelSuccess: "Referral cancelled",
    opFailed: "Failed to execute action"
  }
};

ar.referrals = {
  title: "نظام الإحالات",
  subtitle: "إحالة المرضى بين الأطباء مع تتبع الحالة",
  newReferral: "+ إحالة جديدة",
  sendReferral: "إرسال الإحالة",
  cancel: "إلغاء",
  accept: "قبول",
  reject: "رفض",
  complete: "إكمال",
  confirmComplete: "تأكيد الإكمال",
  confirmReject: "تأكيد الرفض",
  tabReceived: "إحالات واردة",
  tabSent: "إحالات صادرة",
  loading: "جاري التحميل...",
  empty: "لا توجد إحالات",
  table: {
    no: "#",
    patient: "المريض",
    fromDoctor: "من الطبيب",
    toDoctor: "إلى الطبيب",
    reason: "السبب",
    priority: "الأولوية",
    status: "الحالة",
    date: "التاريخ",
    actions: "إجراءات"
  },
  status: {
    PENDING: "في الانتظار",
    ACCEPTED: "مقبولة",
    COMPLETED: "مكتملة",
    REJECTED: "مرفوضة",
    CANCELLED: "ملغاة"
  },
  priority: {
    URGENT: "عاجلة",
    ROUTINE: "عادية"
  },
  form: {
    patient: "المريض *",
    patientSearchPlaceholder: "ابحث بالاسم أو رقم الملف...",
    receivingDoctor: "الطبيب المُحال إليه *",
    selectDoctor: "اختر الطبيب...",
    reason: "سبب الإحالة *",
    reasonPlaceholder: "سبب الإحالة...",
    clinicalSummary: "الملخص السريري",
    clinicalSummaryPlaceholder: "ملخص الحالة السريرية...",
    priority: "الأولوية"
  },
  actionModal: {
    completeTitle: "إكمال الإحالة",
    rejectTitle: "رفض الإحالة",
    notes: "ملاحظات",
    completePlaceholder: "نتيجة الكشف أو الملاحظات...",
    rejectPlaceholder: "سبب الرفض..."
  },
  alerts: {
    loadFailed: "فشل تحميل الإحالات",
    requiredFields: "يرجى ملء جميع الحقول المطلوبة",
    createSuccess: "تم إنشاء الإحالة بنجاح",
    createFailed: "فشل إنشاء الإحالة",
    acceptSuccess: "تم قبول الإحالة",
    completeSuccess: "تم إكمال الإحالة",
    rejectSuccess: "تم رفض الإحالة",
    cancelSuccess: "تم إلغاء الإحالة",
    opFailed: "فشل تنفيذ الإجراء"
  }
};

saveJSON(EN_PATH, en);
saveJSON(AR_PATH, ar);

console.log('✅ Phase 6 translations added successfully!');
