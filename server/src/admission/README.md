# Admission Module - نظام الإيواء المتقدم

## نظرة عامة

نظام الإيواء المتقدم في Saraya ERP هو نظام شامل لإدارة دخول المرضى وتخصيص الأسرة وتخطيط التسريح في المستشفيات. تم تصميم النظام وفقاً لأعلى المعايير العالمية في إدارة المستشفيات.

## الميزات الرئيسية

### 🏥 إدارة الإيواء
- **إنشاء إيواء شامل**: معلومات المريض، الفريق الطبي، التأمين، التشخيص
- **التحقق من الصلاحيات**: التحقق المزدوج للمرضى والأسرة النشطة
- **إدارة الطوارئ**: دعم كامل للحالات الطارئة والإيواء السريع
- **تتبع إعادة الإيواء**: كشف وتتبع المرضى الذين يعاد إدخالهم خلال 30 يوم

### 🛏️ إدارة الأسرة
- **تخصيص الأسرة**: نظام متقدم لتخصيص الأسرة المتاحة
- **نقل المرضى**: نقل المرضى بين الأسرة والعنابر
- **حالة الأسرة**: تتبع حالة الأسرة (متاح، مشغول، تنظيف، صيانة)
- **تقارير الإشغال**: تقارير مفصلة عن إشغال الأسرة

### 📋 تخطيط التسريح
- **تخطيط متقدم**: تخطيط شامل لعملية التسريح
- **التحقق من المعايير**: التحقق من استقرار الحالة قبل التسريح
- **تنسيق الرعاية**: تنسيق مع مديري الحالات والخدمات الاجتماعية
- **متابعة ما بعد التسريح**: تخطيط للمتابعة والرعاية المنزلية

### 📊 التقارير والإحصائيات
- **إحصائيات الإيواء**: إحصائيات مفصلة عن الإيواءات
- **تقارير الأداء**: مؤشرات الأداء الرئيسية (KPIs)
- **تحليل الإشغال**: تحليل مفصل لإشغال الأسرة
- **تقارير الجودة**: تقارير جودة الرعاية ومعدلات إعادة الإيواء

## نقاط النهاية (API Endpoints)

### إدارة الإيواء

#### إنشاء إيواء جديد
```http
POST /admissions
Content-Type: application/json
Authorization: Bearer <token>

{
  "patientId": 123,
  "admissionType": "ELECTIVE",
  "priority": "MEDIUM",
  "admittingDoctorId": 456,
  "primaryPhysicianId": 456,
  "bedId": 789,
  "admissionReason": "جراحة اختيارية",
  "primaryDiagnosis": "التهاب الزائدة الدودية"
}
```

#### قائمة الإيواءات
```http
GET /admissions?page=1&limit=20&status=ADMITTED&wardId=123
Authorization: Bearer <token>
```

#### تفاصيل الإيواء
```http
GET /admissions/:id
Authorization: Bearer <token>
```

#### تحديث الإيواء
```http
PUT /admissions/:id
Content-Type: application/json
Authorization: Bearer <token>
```

#### تسريح المريض
```http
POST /admissions/:id/discharge
Content-Type: application/json
Authorization: Bearer <token>

{
  "dischargeDisposition": "HOME",
  "dischargeInstructions": {...},
  "followUpRequired": true,
  "actualCost": 5000.00
}
```

### تخطيط التسريح

#### إنشاء تخطيط التسريح
```http
POST /admissions/:id/discharge-planning
Content-Type: application/json
Authorization: Bearer <token>

{
  "plannedDischargeDate": "2024-01-15",
  "dischargeDisposition": "HOME",
  "medicalStability": true,
  "medicationsReady": true,
  "educationCompleted": false
}
```

### نقل الأسرة

#### طلب نقل السرير
```http
POST /admissions/:id/bed-transfer/request
Content-Type: application/json
Authorization: Bearer <token>

{
  "toBedId": 456,
  "transferReason": "تحسين الرعاية",
  "transferType": "ROUTINE",
  "priority": "MEDIUM"
}
```

#### إتمام نقل السرير
```http
POST /admissions/bed-transfer/:transferId/complete
Authorization: Bearer <token>
```

### الإحصائيات والتقارير

#### إحصائيات الإيواء
```http
GET /admissions/statistics/overview?period=week
Authorization: Bearer <token>
```

#### تقرير إشغال الأسرة
```http
GET /admissions/reports/bed-occupancy
Authorization: Bearer <token>
```

### الإيواء السريع

#### إيواء طارئ
```http
POST /admissions/quick-admission
Content-Type: application/json
Authorization: Bearer <token>

{
  "patientId": 123,
  "bedId": 456,
  "admittingDoctorId": 789,
  "admissionReason": "حالة طارئة",
  "primaryDiagnosis": "نوبة قلبية"
}
```

## نماذج البيانات

### Admission
```typescript
interface Admission {
  id: number;
  hospitalId: number;
  patientId: number;
  encounterId: number;
  admissionType: AdmissionType;
  admissionStatus: AdmissionStatus;
  priority: AdmissionPriority;
  scheduledAdmissionDate?: Date;
  actualAdmissionDate: Date;
  dischargeDate?: Date;
  expectedDischargeDate?: Date;
  bedId?: number;
  roomId?: number;
  wardId?: number;
  departmentId?: number;
  admittingDoctorId: number;
  primaryPhysicianId: number;
  referringDoctorId?: number;
  attendingNurseId?: number;
  insuranceProviderId?: string;
  insurancePolicyId?: string;
  preAuthNumber?: string;
  admissionReason: string;
  primaryDiagnosis?: string;
  secondaryDiagnoses?: any[];
  procedures?: any[];
  medications?: any[];
  allergies?: any[];
  specialInstructions?: string;
  fallRisk?: string;
  pressureUlcerRisk?: string;
  nutritionRisk?: string;
  infectionRisk?: string;
  isolationRequired: boolean;
  isolationType: IsolationType;
  isolationStartDate?: Date;
  isolationEndDate?: Date;
  isEmergency: boolean;
  emergencyContact?: any;
  emergencyNotes?: string;
  isReadmission: boolean;
  previousAdmissionId?: number;
  readmissionReason?: string;
  readmissionWithin30Days: boolean;
  dischargeDisposition?: DischargeDisposition;
  dischargeInstructions?: any;
  followUpRequired: boolean;
  followUpInstructions?: any;
  estimatedCost?: number;
  actualCost?: number;
  paymentStatus?: string;
  billingStatus?: string;
  lengthOfStay?: number;
  complicationFlag: boolean;
  complicationDetails?: any;
  createdBy: number;
  updatedBy?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### DischargePlanning
```typescript
interface DischargePlanning {
  id: number;
  admissionId: number;
  hospitalId: number;
  plannedDischargeDate: Date;
  dischargePlanningDate: Date;
  medicalStability: boolean;
  vitalsStable: boolean;
  painControlled: boolean;
  medicationsReady: boolean;
  educationCompleted: boolean;
  dischargeDisposition: DischargeDisposition;
  destinationFacility?: string;
  homeHealthRequired: boolean;
  equipmentNeeded?: any[];
  homeModifications?: any[];
  followUpAppointment?: Date;
  followUpDoctorId?: number;
  followUpInstructions?: string;
  caseManagerId?: number;
  socialWorkerId?: number;
  familyNotified: boolean;
  familyInstructions?: any[];
  insuranceApproval: boolean;
  estimatedCost?: number;
  paymentArrangements?: any[];
  status: string;
  completedDate?: Date;
  barriers?: any[];
  notes?: string;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### BedTransfer
```typescript
interface BedTransfer {
  id: number;
  admissionId: number;
  hospitalId: number;
  fromBedId: number;
  fromRoomId: number;
  fromWardId: number;
  toBedId: number;
  toRoomId: number;
  toWardId: number;
  transferReason: string;
  transferType: string;
  priority: string;
  requestedAt: Date;
  scheduledAt?: Date;
  completedAt?: Date;
  requestedBy: number;
  approvedBy?: number;
  completedBy?: number;
  status: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

## الصلاحيات

### الأدوار المسموح بها
- **ADMIN**: صلاحيات كاملة على جميع العمليات
- **NURSE**: إدارة الإيواء، تخصيص الأسرة، تخطيط التسريح
- **DOCTOR**: إنشاء الإيواء، تحديث المعلومات الطبية
- **CASE_MANAGER**: تخطيط التسريح
- **SOCIAL_WORKER**: تخطيط التسريح

### عمليات التدقيق
جميع العمليات الحساسة مسجلة في نظام التدقيق:
- `CREATE_ADMISSION`
- `UPDATE_ADMISSION`
- `DISCHARGE_PATIENT`
- `CREATE_DISCHARGE_PLANNING`
- `REQUEST_BED_TRANSFER`
- `COMPLETE_BED_TRANSFER`
- `QUICK_ADMISSION`

## قواعد العمل

### التحقق من الإيواء المكرر
- لا يمكن إدخال مريض لديه إيواء نشط
- التحقق التلقائي من الإيواءات خلال 30 يوم
- تحديد الإيواءات المكررة وتتبع الأسباب

### تخصيص الأسرة
- لا يمكن تخصيص سرير غير متاح
- التحقق من توافق السرير مع نوع المريض
- تحديث تلقائي لحالة السرير

### نقل المرضى
- لا يمكن نقل المريض إلى سرير غير متاح
- الحاجة إلى موافقة قبل النقل
- تتبع كامل لعمليات النقل

### تسريح المرضى
- التحقق من استيفاء معايير التسريح
- تحديث تلقائي لحالة السرير
- إغلاق تلقائي للحالة الطبية

## معالجة الأخطاء

### الأخطاء الشائعة
- `Patient already has an active admission`
- `Selected bed is not available`
- `Admission not found`
- `Patient is already discharged`

### رموز الحالة
- `200`: نجاح
- `201`: تم الإنشاء بنجاح
- `400`: خطأ في الطلب
- `401`: غير مصرح
- `403`: ممنوع
- `404`: غير موجود
- `500`: خطأ في الخادم

## الأداء

### التحسينات
- فهارس محسّنة لقاعدة البيانات
- التخزين المؤقت للإحصائيات الشائعة
- تحميل البيانات بشكل تدريجي
- ضغط الاستجابات

### المراقبة
- مراقبة أداء الـ API
- تسجيل العمليات البطيئة
- تنبيهات الأخطاء
- مقاييس الاستخدام

## التكامل

### الأنظمة المتكاملة
- **نظام المرضى**: معلومات المرضى والتاريخ الطبي
- **نظام الأسرة**: إدارة الأسرة والغرف والعنابر
- **نظام الفواتير**: تكاليف الإقامة والفواتير
- **نظام التأمين**: التحقق من التغطية التأمينية
- **نظام المختبر**: نتائج المختبرات
- **نظام الأشعة**: نتائج الأشعة

### واجهات برمجة التطبيقات
- RESTful API
- WebSocket للتحديثات الفورية
- Webhooks للإشعارات
- Export/Import للبيانات

## الأمان

### حماية البيانات
- تشفير البيانات الحساسة
- التحكم في الوصول المستند إلى الدور
- التدقيق الكامل للعمليات
- النسخ الاحتياطي المنتظم

### الامتثال
- HIPAA
- معايير حماية البيانات الصحية
- لوائح الخصوصية
- معايير الجودة

## الدعم والصيانة

### التوثيق
- API Documentation
- User Guides
- Technical Documentation
- Best Practices

### الدعم الفني
- 24/7 Technical Support
- Bug Reporting
- Feature Requests
- Training Materials

---

**ملاحظة**: هذا النظام مصمم وفقاً لأعلى معايير جودة الرعاية الصحية ومتطلبات الامتثال التنظيمي.
