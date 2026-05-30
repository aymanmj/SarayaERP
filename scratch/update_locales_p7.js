const fs = require('fs');
const path = require('path');

const arPath = path.join(__dirname, '../client/src/locales/ar.json');
const enPath = path.join(__dirname, '../client/src/locales/en.json');

const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// Define the keys to inject
const arInject = {
  "obgyn": {
    "delivery": {
      "toast": {
        "loadEncounterError": "فشل تحميل بيانات الزيارة",
        "encounterIdMissing": "رقم الزيارة مفقود",
        "success": "تم تسجيل الولادة بنجاح",
        "error": "فشل تسجيل الولادة"
      },
      "encounterIdRequired": "يجب تحديد رقم الزيارة (Encounter ID) للبدء.",
      "title": "تسجيل ولادة جديدة via Saraya",
      "btn": {
        "back": "رجوع",
        "cancel": "إلغاء",
        "saving": "جاري الحفظ...",
        "save": "حفظ وتسجيل الولادة"
      },
      "patientInfo": "بيانات المريضة",
      "mrn": "MRN: ",
      "details": "تفاصيل الولادة",
      "method": "طريقة الولادة",
      "methods": {
        "nvd": "ولادة طبيعية (NVD)",
        "assistedNvd": "ولادة مساعدة (Assisted)",
        "csElective": "قيصرية اختيارية",
        "csEmergency": "قيصرية طارئة",
        "vbac": "ولادة طبيعية بعد قيصرية (VBAC)"
      },
      "placentaDelivery": "توصيل المشيمة",
      "placenta": {
        "spontaneous": "تلقائي",
        "manual": "يدوي"
      },
      "episiotomy": "شق العجان (Episiotomy)",
      "no": "لا",
      "yes": "نعم",
      "perinealTear": "تمزق العجان (Perineal Tear)",
      "tears": {
        "none": "لا يوجد",
        "degree1": "درجة 1",
        "degree2": "درجة 2",
        "degree3": "درجة 3",
        "degree4": "درجة 4"
      },
      "bloodLoss": "فقدان الدم (مل)",
      "bloodLossPlaceholder": "مثلاً 500",
      "newbornsData": "بيانات المواليد",
      "babyCount": "عدد المواليد: ",
      "babyNumber": "مولود #",
      "gender": "الجنس",
      "genderMale": "ذكر",
      "genderFemale": "أنثى",
      "weight": "الوزن (كجم)",
      "length": "الطول (سم)",
      "headCircumference": "محيط الرأس (سم)",
      "birthTime": "وقت الولادة",
      "apgarScore1": "Apgar 1m",
      "apgarScore5": "Apgar 5m",
      "apgarScore10": "Apgar 10m",
      "babyStatus": "حالة المولود",
      "status": {
        "alive": "حي",
        "stillborn": "ميت",
        "nicu": "عناية مركزة (NICU)"
      },
      "vitaminK": "فيتامين K",
      "bcgVaccine": "تطعيم BCG",
      "notes": "ملاحظات إضافية",
      "notesPlaceholder": "أي مضاعفات أو ملاحظات أخرى..."
    },
    "anc": {
      "toast": {
        "loadCareError": "فشل تحميل سجل الحمل",
        "loadCaresError": "فشل تحميل سجلات الحمل",
        "lmpDateRequired": "يرجى تحديد تاريخ آخر دورة",
        "createCareSuccess": "تم تسجيل الحمل بنجاح",
        "createCareError": "فشل تسجيل الحمل",
        "addVisitSuccess": "تم إضافة زيارة المتابعة",
        "addVisitError": "فشل إضافة الزيارة",
        "updatePartnerRhSuccess": "تم تحديث Rh الزوج",
        "updatePartnerRhError": "فشل تحديث Rh الزوج",
        "recordAntiDSuccess": "تم تسجيل حقنة Anti-D",
        "recordAntiDError": "فشل تسجيل الحقنة"
      },
      "status": {
        "active": "حمل نشط",
        "delivered": "تمت الولادة",
        "miscarriage": "إجهاض",
        "ectopic": "حمل خارج الرحم",
        "cancelled": "ملغي"
      },
      "loading": "جاري التحميل...",
      "title": "متابعة الحمل",
      "mrn": " — MRN: ",
      "btn": {
        "back": "رجوع",
        "recordInjection": "تسجيل الحقنة",
        "record": "تسجيل",
        "cancel": "إلغاء",
        "newVisit": "+ زيارة جديدة",
        "saveVisit": "حفظ الزيارة",
        "newCare": "+ تسجيل حمل جديد",
        "submitCare": "تسجيل الحمل"
      },
      "rh": {
        "incompatibleTitle": "عدم توافق Rh مؤكد — بروتوكول Anti-D مفعّل",
        "negativeWarningTitle": "تنبيه: الأم Rh سالب (-)",
        "incompatibleDesc": "الزوج Rh موجب أو غير معروف. يجب إعطاء حقنة Anti-D في الأسبوع 28 وبعد الولادة مباشرة.",
        "negativeWarningDesc": "يرجى فحص فصيلة دم الزوج لتحديد ما إذا كان هناك خطر عدم توافق Rh.",
        "partnerRh": "Rh الزوج:",
        "notSpecified": "غير محدد",
        "positive": "موجب (+)",
        "negative": "سالب (-)",
        "unknown": "غير معروف",
        "noRisk": "✅ الخطر قد زال — الجنين سيكون Rh سالب",
        "antiDWeek28": "Anti-D الأسبوع 28",
        "antiDPostpartum": "Anti-D بعد الولادة",
        "positiveText": "إيجابي (+)",
        "negativeText": "سلبي (-)"
      },
      "summary": {
        "gestationalWeek": "أسبوع الحمل",
        "daysToEdd": "يوم للولادة",
        "eddDate": "تاريخ الولادة المتوقع",
        "obstetricHistory": "التاريخ الولادي",
        "riskLevel": "مستوى الخطورة"
      },
      "risk": {
        "low": "منخفض",
        "medium": "متوسط",
        "high": "عالي"
      },
      "visits": {
        "title": "زيارات المتابعة",
        "visitData": "بيانات الزيارة",
        "maternalWeight": "وزن الأم (كجم)",
        "systolicBp": "الضغط الانقباضي",
        "diastolicBp": "الضغط الانبساطي",
        "fundalHeight": "ارتفاع الرحم (سم)",
        "fetalHeartRate": "نبض الجنين",
        "fetalMovement": "حركة الجنين",
        "fetalPresentation": "وضع الجنين",
        "presentations": {
          "cephalic": "رأسي (Cephalic)",
          "breech": "مقعدي (Breech)",
          "transverse": "عرضي (Transverse)"
        },
        "hemoglobin": "هيموجلوبين (g/dL)",
        "urineProtein": "بروتين البول",
        "urineGlucose": "نسبة السكر بالبول",
        "edema": "وذمة (Edema)",
        "nextVisit": "الزيارة القادمة",
        "complaints": "شكاوى المريضة",
        "complaintsPlaceholder": "أي شكاوى...",
        "doctorNotes": "ملاحظات الطبيب",
        "notesPlaceholder": "ملاحظات...",
        "emptyState": "لا توجد زيارات متابعة مسجلة بعد."
      },
      "yes": "نعم",
      "no": "لا",
      "lab": {
        "value": {
          "nil": "Nil",
          "trace": "Trace",
          "plus": "+",
          "doublePlus": "++",
          "triplePlus": "+++"
        }
      },
      "table": {
        "week": "الأسبوع",
        "date": "التاريخ",
        "weight": "الوزن",
        "bp": "الضغط",
        "fundalHeight": "ارتفاع الرحم",
        "fhr": "نبض الجنين",
        "movement": "الحركة",
        "hb": "Hb",
        "notes": "ملاحظات"
      },
      "weekAbbreviation": "الأسبوع",
      "unit": {
        "kg": " كجم",
        "cm": " سم",
        "bpm": " bpm"
      },
      "list": {
        "title": "سجلات الحمل",
        "rhNegativeLabel": "🔴 Rh-",
        "visitsCount": " زيارات",
        "emptyState": "لا توجد سجلات حمل لهذه المريضة."
      },
      "create": {
        "title": "تسجيل حمل جديد",
        "lmpDate": "تاريخ آخر دورة (LMP) *",
        "gravida": "عدد مرات الحمل (Gravida)",
        "para": "الولادات السابقة (Para)",
        "bloodGroup": "فصيلة الدم",
        "rhFactor": "عامل Rh (الأم)",
        "partnerRh": "عامل Rh (الزوج)",
        "riskLevel": "مستوى الخطورة",
        "riskFactors": "عوامل الخطورة",
        "riskFactorsPlaceholder": "سكري حمل، ضغط مرتفع...",
        "rhWarning": "⚠️ الأم Rh سالب — سيتم رفع مستوى الخطورة تلقائياً وإرسال تنبيهات سريرية للطبيب."
      }
    },
    "fertility": {
      "infertilityLabels": {
        "maleFactor": "عامل ذكوري",
        "femaleFactor": "عامل أنثوي",
        "combined": "عامل مشترك",
        "unexplained": "غير مفسر"
      },
      "cycleTypeLabels": {
        "ivf": "أطفال أنابيب (IVF)",
        "icsi": "حقن مجهري (ICSI)",
        "iui": "تلقيح صناعي (IUI)",
        "fet": "نقل أجنة مجمدة (FET)",
        "eggFreezing": "تجميد بويضات",
        "natural": "طبيعي"
      },
      "resultLabels": {
        "pending": "في الانتظار",
        "positive": "إيجابي (حمل) 🎉",
        "negative": "سلبي",
        "biochemical": "حمل كيميائي",
        "ectopic": "حمل خارج الرحم",
        "miscarriage": "إجهاض"
      },
      "embryoStatusLabels": {
        "developing": "قيد التطور",
        "transferred": "تم الترجيع",
        "frozen": "مجمد ❄️",
        "thawed": "مذاب",
        "discarded": "تم التخلص",
        "donated": "تبرع"
      },
      "statusLabels": {
        "active": "نشط",
        "successful": "ناجح 🎉",
        "discontinued": "متوقف",
        "referred": "محول"
      },
      "toast": {
        "loadCaseError": "فشل تحميل ملف العقم",
        "loadPatientCasesError": "فشل تحميل سجلات العقم",
        "loadActiveCasesError": "فشل تحميل الحالات",
        "patientRequired": "يرجى تحديد المريضة",
        "createCaseSuccess": "تم فتح ملف العقم بنجاح",
        "createCaseError": "فشل إنشاء الملف",
        "startDateRequired": "يرجى تحديد تاريخ البدء",
        "createCycleSuccess": "تم بدء دورة علاجية جديدة",
        "createCycleError": "فشل إنشاء الدورة"
      },
      "loading": "جاري التحميل...",
      "title": "🧬 ملف العقم والحقن المجهري",
      "femaleIcon": "👩 ",
      "mrn": " (MRN: ",
      "maleIcon": " — 👨 ",
      "btn": {
        "back": "رجوع",
        "newCycle": "+ دورة جديدة",
        "startCycle": "بدء الدورة",
        "openNewCase": "+ فتح ملف جديد",
        "remove": "✕ إزالة",
        "submitCase": "فتح الملف"
      },
      "summary": {
        "infertilityType": "نوع العقم",
        "duration": "مدة عدم الإنجاب",
        "cycles": "الدورات العلاجية",
        "status": "الحالة"
      },
      "unit": {
        "years": " سنة",
        "ngml": " ng/mL",
        "miuml": " mIU/mL",
        "mm": " مم"
      },
      "diagnosticData": "البيانات التشخيصية",
      "wife": "الزوجة:",
      "husband": "الزوج:",
      "notLinked": "غير مربوط",
      "diagnosisLabel": "التشخيص:",
      "semenAnalyses": "تحاليل سائل منوي:",
      "andrologyVisits": "زيارات ذكورة:",
      "cycles": "الدورات العلاجية",
      "cycle": {
        "type": "نوع الدورة",
        "protocol": "البروتوكول",
        "startDate": "تاريخ البدء",
        "started": "بدأت: ",
        "eggs": "بويضات: ",
        "fertilized": "مخصبة: ",
        "transferred": "مرجعة: ",
        "frozen": "مجمدة: ",
        "stimulationDays": "أيام التحفيز",
        "matureEggs": "بويضات ناضجة",
        "embryosDay3": "أجنة يوم 3",
        "embryosDay5": "أجنة يوم 5",
        "endometrialThickness": "سماكة البطانة",
        "betaHcg": "Beta HCG",
        "embryos": "الأجنة:",
        "medications": "الأدوية:",
        "emptyState": "لا توجد دورات علاجية مسجلة بعد."
      },
      "protocols": {
        "long": "Long Protocol",
        "short": "Short Protocol",
        "antagonist": "Antagonist",
        "natural": "Natural",
        "ministim": "Mini-stim"
      },
      "create": {
        "title": "فتح ملف عقم جديد",
        "husbandSearchLabel": "ملف الزوج (اختياري) — ابحث بالاسم أو رقم الملف",
        "husbandSearchPlaceholder": "ابحث عن الزوج بالاسم أو رقم الملف أو الهاتف...",
        "infertilityType": "نوع العقم",
        "duration": "مدة عدم الإنجاب (سنوات)",
        "amh": "AMH (ng/mL)",
        "fsh": "FSH (mIU/mL)",
        "diagnosis": "التشخيص",
        "diagnosisPlaceholder": "التشخيص التفصيلي..."
      },
      "list": {
        "title": "🧬 الحقن المجهري وعلاج العقم",
        "caseNumber": "ملف #",
        "cyclesCount": " دورات",
        "emptyPatient": "لا توجد ملفات عقم لهذه المريضة.",
        "emptyActive": "لا توجد حالات نشطة."
      }
    }
  },
  "andrology": {
    "loading": {
      "section": "جارِ تحميل القسم...",
      "cryo": "جارِ تحميل بنك التجميد...",
      "semenForm": "جارِ تحميل نموذج السائل المنوي...",
      "visitForm": "جارِ تحميل نموذج الزيارة...",
      "hormoneForm": "جارِ تحميل نموذج الهرمونات...",
      "surgeryForm": "جارِ تحميل نموذج الجراحة...",
      "medicationForm": "جارِ تحميل نموذج الدواء...",
      "investigationForm": "جارِ تحميل نموذج الفحوصات...",
      "reportPrint": "جارِ تحميل التقرير الطبي..."
    },
    "search": {
      "patientNotFound": "لم يتم العثور على أي مريض.",
      "searchError": "خطأ في البحث.",
      "title": "البحث عن المريض",
      "placeholder": "ابحث بواسطة الاسم، رقم الملف (MRN)، أو رقم الهاتف...",
      "searching": "جاري البحث...",
      "button": "بحث الآن",
      "resultsFound": "تم العثور على {count} نتيجة — الرجاء الاختيار:"
    },
    "semen": {
      "saveSuccess": "تم حفظ تحليل السائل المنوي بنجاح.",
      "recordTitle": "📋 سجل السائل المنوي (WHO 6th Ed)",
      "addNew": "➕ إضافة تحليل جديد",
      "noRecords": "لا توجد تحاليل سائل منوي مسجلة.",
      "testDate": "تاريخ الفحص: ",
      "abstinencePeriod": "فترة امتناع: ",
      "days": " أيام",
      "collectionMethod": "طريقة الجمع: ",
      "fields": {
        "volume": "الحجم",
        "volumeUnit": "ml",
        "concentration": "التركيز",
        "concentrationUnit": "M/ml",
        "totalMotility": "الحركة الكلية PR+NP",
        "percent": "%",
        "progressivePR": "التقدمية PR",
        "normalForms": "شكل طبيعي (Kruger)"
      }
    },
    "common": {
      "saveFailed": "فشل الحفظ.",
      "loading": "جارِ التحميل...",
      "cancel": "إلغاء",
      "yes": "نعم",
      "no": "لا"
    },
    "visit": {
      "saveSuccess": "تم حفظ زيارة أمراض الذكورة."
    },
    "hormone": {
      "saveSuccess": "تم حفظ البروفايل الهرموني بنجاح."
    },
    "surgery": {
      "saveSuccess": "تم حفظ العملية الجراحية بنجاح."
    },
    "medication": {
      "saveSuccess": "تم حفظ الدواء بنجاح."
    },
    "investigation": {
      "saveSuccess": "تم حفظ الفحص الطبي بنجاح."
    },
    "title": "عيادة أمراض الذكورة والعقم",
    "subtitle": "وحدة المتابعة المتقدمة: تحليل وتشخيص، بروفايل هرموني، وجراحات دقيقة",
    "patient": {
      "mrn": "MRN: ",
      "medicalReport": "🖨️ التقرير الطبي",
      "anotherPatient": "🔄 مريض آخر"
    },
    "tabs": {
      "overview": "📊 لوحة التحكم",
      "semen": "🔬 السائل المنوي",
      "hormones": "🩸 الهرمونات",
      "visits": "🩺 الزيارات",
      "surgeries": "🔪 الجراحات",
      "medications": "💊 الأدوية",
      "investigations": "🔬 الفحوصات (Investigations)",
      "cryo": "❄️ بنك التجميد"
    },
    "overview": {
      "summaryTitle": "الملخص السريري 💡",
      "lastSemenStatus": "حالة السائل المنوي (آخر تحليل)",
      "notClassified": "لم يُصنف بعد",
      "noAnalysis": "لا يوجد تحليل",
      "lastHormonalStatus": "الوضع الهرموني (آخر فحص)",
      "noHormoneProfile": "لا يوجد بروفايل",
      "lastClinicalDiagnosis": "آخر تشخيص سريري",
      "notDetermined": "لم يحدد بعد",
      "surgicalProcedures": "الإجراءات الجراحية",
      "surgeriesCount": " عملية (آخرها: ",
      "noSurgeries": "لا يوجد تدخلات جراحية",
      "semenTrend": "📈 مسار السائل المنوي عبر الزمن",
      "concentrationVsMotility": "Concentration vs Motility",
      "chart": {
        "concentration": "Concentration (M/ml)",
        "motility": "Motility (%)",
        "requiresTwoSemen": "يتطلب التخطيط البياني تحليلين أو أكثر",
        "testosterone": "Testosterone (ng/dL)",
        "fsh": "FSH (mIU/mL)",
        "requiresTwoHormone": "يتطلب التخطيط البياني فحصين أو أكثر"
      },
      "hormoneTrend": "📉 التغير الهرموني الكلي",
      "fshVsTestosterone": "FSH vs Testosterone",
      "timelineTitle": "⏱️ التسلسل الزمني السريع للمريض (Timeline)",
      "timeline": {
        "startMedication": "بدء علاج",
        "surgery": "عملية جراحية",
        "semenAnalysis": "سائل منوي",
        "investigation": "فحص وتصوير"
      }
    },
    "hormones": {
      "title": "🩸 التتبع الهرموني (Hormonal Profile)",
      "addNew": "➕ إضافة فحص هرموني",
      "noRecords": "لا توجد فحوصات هرمونية مسجلة.",
      "table": {
        "date": "التاريخ",
        "fsh": "FSH",
        "lh": "LH",
        "totalT": "Total T",
        "e2": "E2",
        "prl": "PRL",
        "notes": "ملاحظات"
      }
    },
    "visits": {
      "title": "🩺 زيارات أمراض الذكورة",
      "addNew": "➕ زيارة جديدة",
      "noRecords": "لا توجد زيارات مسجلة.",
      "visitOn": "📅 زيارة بتاريخ ",
      "fields": {
        "chiefComplaint": "الشكوى الرئيسية",
        "varicoceleGrade": "الدوالي العامة",
        "varicoceleSides": "الدوالي (يمين / يسار)",
        "treatmentPlan": "خطة العلاج"
      }
    },
    "surgeries": {
      "title": "🔪 التدخلات الجراحية والميكروسكوبية",
      "addNew": "➕ توثيق جراحة",
      "noRecords": "لم يتم إجراء عمليات جراحية للمريض.",
      "spermRetrievedSuccess": "✅ نجاح الاستخراج",
      "fields": {
        "date": "تاريخ العملية: ",
        "surgeon": "الجراح: ",
        "technique": "التقنية الجراحية:",
        "findings": "نتائج العملية (Findings):",
        "outcome": "النتيجة (Outcome):"
      }
    },
    "medications": {
      "title": "💊 الخطة العلاجية الدوائية",
      "addNew": "➕ إضافة دواء",
      "noRecords": "لم يتم وصف أدوية للمريض.",
      "fields": {
        "defaultCategory": "دواء عام",
        "start": "البدء: ",
        "end": "الانتهاء: ",
        "dose": "جرعة: ",
        "frequency": "تكرار: ",
        "response": "✅ استجابة: "
      }
    },
    "investigations": {
      "title": "🔬 الفحوصات الطبية المتقدمة",
      "addNew": "➕ إرفاق فحص جديد",
      "noRecords": "لا توجد فحوصات أو صور أشعة مسجلة.",
      "fields": {
        "date": "تاريخ الفحص: ",
        "facility": "المختبر: ",
        "findings": "النتائج الفنية (Findings):",
        "interpretation": "التفسير والخلاصة (Interpretation):",
        "normalRange": "Normal Range:"
      }
    },
    "forms": {
      "investigation": {
        "title": "🔬 إضافة فحص طبي أو شعاعي",
        "fields": {
          "type": "نوع الفحص ",
          "date": "تاريخ الفحص",
          "facilityName": "اسم المركز / المختبر (Facility Name)",
          "findings": "النتائج (Findings) ",
          "interpretation": "الاستنتاج أو التفسير (Interpretation)",
          "notes": "ملاحظات الطبيب"
        },
        "placeholders": {
          "selectType": "— اختر نوع الفحص —",
          "facilityName": "مثال: مختبر البرج، مستشفى السرايا...",
          "findings": "اكتب نتائج الفحص التفصيلية هنا..."
        },
        "groups": {
          "imaging": "تصوير وشعاعيات",
          "genetic": "فحوصات وراثية وجينية",
          "biopsies": "خزعات وعيًنات",
          "other": "أخرى"
        },
        "options": {
          "scrotalUs": "أشعة تلفزيونية للخصية (Scrotal US)",
          "scrotalDoppler": "أشعة دوبلر (Scrotal Doppler)",
          "trus": "أشعة عبر المستقيم (TRUS)",
          "karyotype": "تحليل الكروموسومات (Karyotype)",
          "yMicrodeletion": "حذف طفرات الكروموسوم (Y-Microdeletion)",
          "cftr": "طفرات التليف الكيسي (CFTR)",
          "testicularBiopsy": "خزعة خصية تشخيصية",
          "other": "فحص آخر..."
        },
        "buttons": {
          "save": "💾 حفظ الفحص"
        }
      },
      "medication": {
        "title": "💊 إضافة علاج طبي",
        "fields": {
          "medication": "اسم الدواء / المادة الفعالة ",
          "category": "الفئة الدوائية (Category)",
          "dose": "الجرعة (Dose)",
          "frequency": "التكرار (Frequency)",
          "startDate": "تاريخ البدء",
          "endDate": "تاريخ الانتهاء المتوقع",
          "response": "الاستجابة (Clinical Response)",
          "sideEffects": "الآثار الجانبية (Side Effects)"
        },
        "placeholders": {
          "medication": "مثال: ClomiPhene Citrate 50mg",
          "selectCategory": "— اختر —",
          "dose": "مثال: حبة واحدة",
          "frequency": "مثال: مرتين يومياً",
          "response": "التأثير الواضح بعد فترة من العلاج",
          "sideEffects": "أي آثار جانبية تم ملاحظتها"
        },
        "options": {
          "antiEstrogen": "مضادات الاستروجين (Anti-estrogen)",
          "gonadotropins": "هرمونات الجونادوتروبين (Gonadotropins)",
          "antioxidants": "مضادات الأكسدة ومكملات (Antioxidants)",
          "antibiotics": "مضادات حيوية (Antibiotics)",
          "pde5Inhibitors": "منشطات جنسية (PDE5 Inhibitors)",
          "other": "غير ذلك"
        },
        "buttons": {
          "save": "💾 حفظ العلاج"
        }
      },
      "surgery": {
        "title": "🔪 إجراء جراحي جديد",
        "fields": {
          "procedure": "الإجراء الجراحي",
          "date": "تاريخ العملية",
          "technique": "التقنية الجراحية (Technique)",
          "surgeonName": "اسم الجراح",
          "spermRetrieved": "هل تم استخراج حيوانات منوية ناجحة؟ (Sperm Retrieved)",
          "findings": "النتائج / Findings",
          "complications": "المضاعفات / Complications",
          "outcome": "النتيجة النهائية / Outcome"
        },
        "placeholders": {
          "selectProcedure": "— اختر —",
          "technique": "مثال: Microsurgical Subinguinal"
        },
        "options": {
          "varicocelectomy": "دوالي الخصية (Varicocelectomy)",
          "vasectomyReversal": "عكس الربط",
          "other": "أخرى"
        },
        "buttons": {
          "save": "💾 حفظ العملية"
        }
      },
      "visit": {
        "title": "🩺 زيارة أمراض الذكورة (التاريخ الطبي المتقدم)",
        "sections": {
          "complaintAndInfertility": "1. الشكوى الرئيسية وتاريخ العقم",
          "sexualFunction": "2. الوظيفة الجنسية",
          "medicalLifestyleHistory": "3. التاريخ المرضي والجراحي وأسلوب حياة المريض",
          "physicalExam": "4. الفحص السريري"
        },
        "fields": {
          "chiefComplaint": "الشكوى الرئيسية",
          "infertilityMonths": "مدة العقم (أشهر)",
          "previousPregnancies": "عدد مرات الحمل السابق",
          "coitalFrequency": "معدل الجماع الأسبوعي",
          "erectileDisfunc": "ضعف الانتصاب",
          "ejaculatoryDisfunc": "اضطراب القذف",
          "prematureEjac": "سرعة القذف",
          "retrogradeEjac": "قذف ارتجاعي",
          "libidoLevel": "الرغبة الجنسية",
          "cryptorchidismHistory": " خصية معلقة (سابقاً)",
          "orchitisHistory": " التهاب خصية",
          "inguinalSurgery": " جراحة إربية",
          "chemotherapy": " علاج كيميائي",
          "radiationExposure": " تعرض إشعاعي",
          "smokingHabit": "التدخين",
          "alcoholUse": "الكحول",
          "occupationalExposure": "التعرف المهني (حرارة/مواد)",
          "medicalConditions": "الأمراض المزمنة",
          "surgicalHistory": "عمليات جراحية أخرى",
          "currentMedications": "الأدوية الحالية",
          "bmi": "مؤشر كتلة الجسم BMI",
          "varicoceleGrade": "الدوالي (الدرجة العامة)",
          "testicularVolR": "حجم الخصية اليمنى (ml)",
          "testicularVolL": "حجم الخصية اليسرى (ml)",
          "testisConsistency": "قوام الخصية",
          "vasPresence": "الأسهر (Vas Deferens)",
          "epididymalFindings": "فحص البربخ",
          "gynecomastia": " تثدي (Gynecomastia)",
          "diagnosis": "التشخيص النهائي",
          "treatmentPlan": "خطة العلاج المتفق عليها"
        },
        "placeholders": {
          "coitalFrequency": "مثال: 2-3 مرات"
        },
        "options": {
          "libidoNormal": "طبيعية",
          "libidoLow": "منخفضة",
          "libidoAbsent": "معدومة",
          "smokingNon": "غير مدخن",
          "smokingSmoker": "مدخن",
          "smokingEx": "مدخن سابق",
          "alcoholOccasional": "أحياناً",
          "alcoholRegular": "بانتظام",
          "varicoceleNone": "لا يوجد",
          "varicoceleGrade1": "درجة 1",
          "varicoceleGrade2": "درجة 2",
          "varicoceleGrade3": "درجة 3",
          "varicoceleBilateral": "جهتين",
          "consistencyNormal": "طبيعي",
          "consistencySoft": "رخو",
          "consistencyAtrophic": "ضامر",
          "vasPresent": "موجود",
          "vasAbsent": "غير موجود (CBAVD)",
          "vasPartial": "جزئي"
        },
        "buttons": {
          "save": "💾 حفظ الزيارة السريرية"
        }
      }
    },
    "print": {
      "previewTitle": "📄 معاينة التقرير الطبي",
      "printButton": "🖨️ طباعة التقرير",
      "reportTitle": "التقرير الطبي",
      "department": "قسم أمراض الذكورة والطب الإنجابي",
      "tel": "الهاتف: ",
      "dateLabel": "التاريخ: ",
      "logoAlt": "الشعار",
      "patientName": "اسم المريض:",
      "mrn": "رقم الملف (MRN):",
      "phone": "الهاتف:",
      "reportDate": "تاريخ التقرير:",
      "sections": {
        "clinicalOverview": "1. الملخص السريري",
        "semenHistory": "2. سجل تحاليل السائل المنوي",
        "hormonalProfile": "3. التتبع الهرموني",
        "surgicalHistory": "4. السجل الجراحي",
        "pharmacologicalTherapy": "5. الخطة العلاجية الدوائية"
      },
      "fields": {
        "primaryDiagnosis": "التشخيص الرئيسي: ",
        "underEvaluation": "قيد التقييم",
        "chiefComplaint": "الشكوى الرئيسية: ",
        "proposedPlan": "الخطة المقترحة: ",
        "technique": "التقنية المستخدمة: ",
        "outcome": "النتيجة: ",
        "successfulRetrieval": "تم استخراج حيوانات منوية بنجاح ✓",
        "noSpermRetrieved": "لم يتم استخراج حيوانات منوية",
        "started": "البدء: "
      },
      "table": {
        "date": "التاريخ",
        "volume": "الحجم (مل)",
        "concentration": "التركيز (مليون/مل)",
        "motility": "الحركة PR+NP (%)",
        "normalForms": "شكل طبيعي (%)",
        "classification": "التصنيف",
        "fsh": "FSH (mIU/mL)",
        "lh": "LH (mIU/mL)",
        "testosterone": "Testosterone (ng/dL)",
        "prolactin": "Prolactin (ng/mL)"
      },
      "consultantSignature": "توقيع الاستشاري",
      "deptSignature": "أمراض الذكورة والطب الإنجابي",
      "footer": "تم إنشاء هذا التقرير إلكترونياً بواسطة نظام السرايا الطبي ERP • "
    }
  }
};

const enInject = {
  "obgyn": {
    "delivery": {
      "toast": {
        "loadEncounterError": "Failed to load encounter data",
        "encounterIdMissing": "Encounter ID is missing",
        "success": "Delivery registered successfully",
        "error": "Failed to register delivery"
      },
      "encounterIdRequired": "Encounter ID must be specified to start.",
      "title": "Register new delivery via Saraya",
      "btn": {
        "back": "Back",
        "cancel": "Cancel",
        "saving": "Saving...",
        "save": "Save and register delivery"
      },
      "patientInfo": "Patient Details",
      "mrn": "MRN: ",
      "details": "Delivery Details",
      "method": "Delivery Method",
      "methods": {
        "nvd": "Normal Vaginal Delivery (NVD)",
        "assistedNvd": "Assisted Vaginal Delivery (Assisted)",
        "csElective": "Elective C-Section",
        "csEmergency": "Emergency C-Section",
        "vbac": "Vaginal Birth After Cesarean (VBAC)"
      },
      "placentaDelivery": "Placenta Delivery",
      "placenta": {
        "spontaneous": "Spontaneous",
        "manual": "Manual"
      },
      "episiotomy": "Episiotomy",
      "no": "No",
      "yes": "Yes",
      "perinealTear": "Perineal Tear",
      "tears": {
        "none": "None",
        "degree1": "1st Degree",
        "degree2": "2nd Degree",
        "degree3": "3rd Degree",
        "degree4": "4th Degree"
      },
      "bloodLoss": "Blood Loss (ml)",
      "bloodLossPlaceholder": "e.g. 500",
      "newbornsData": "Newborns Data",
      "babyCount": "Number of newborns: ",
      "babyNumber": "Newborn #",
      "gender": "Gender",
      "genderMale": "Male",
      "genderFemale": "Female",
      "weight": "Weight (kg)",
      "length": "Length (cm)",
      "headCircumference": "Head Circumference (cm)",
      "birthTime": "Birth Time",
      "apgarScore1": "Apgar 1m",
      "apgarScore5": "Apgar 5m",
      "apgarScore10": "Apgar 10m",
      "babyStatus": "Newborn Status",
      "status": {
        "alive": "Alive",
        "stillborn": "Stillborn",
        "nicu": "NICU"
      },
      "vitaminK": "Vitamin K",
      "bcgVaccine": "BCG Vaccine",
      "notes": "Additional Notes",
      "notesPlaceholder": "Any complications or other notes..."
    },
    "anc": {
      "toast": {
        "loadCareError": "Failed to load pregnancy record",
        "loadCaresError": "Failed to load pregnancy records",
        "lmpDateRequired": "Please specify last menstrual period date",
        "createCareSuccess": "Pregnancy registered successfully",
        "createCareError": "Failed to register pregnancy",
        "addVisitSuccess": "Follow-up visit added successfully",
        "addVisitError": "Failed to add visit",
        "updatePartnerRhSuccess": "Partner Rh updated",
        "updatePartnerRhError": "Failed to update partner Rh",
        "recordAntiDSuccess": "Anti-D injection recorded",
        "recordAntiDError": "Failed to record injection"
      },
      "status": {
        "active": "Active Pregnancy",
        "delivered": "Delivered",
        "miscarriage": "Miscarriage",
        "ectopic": "Ectopic Pregnancy",
        "cancelled": "Cancelled"
      },
      "loading": "Loading...",
      "title": "Antenatal Care Monitoring",
      "mrn": " — MRN: ",
      "btn": {
        "back": "Back",
        "recordInjection": "Record Injection",
        "record": "Record",
        "cancel": "Cancel",
        "newVisit": "+ New Visit",
        "saveVisit": "Save Visit",
        "newCare": "+ Register New Pregnancy",
        "submitCare": "Register Pregnancy"
      },
      "rh": {
        "incompatibleTitle": "Rh Incompatibility Confirmed — Anti-D Protocol Active",
        "negativeWarningTitle": "Warning: Mother is Rh negative (-)",
        "incompatibleDesc": "Husband is Rh positive or unknown. Anti-D must be given at week 28 and immediately postpartum.",
        "negativeWarningDesc": "Please check the partner's blood group to determine Rh incompatibility risk.",
        "partnerRh": "Partner's Rh:",
        "notSpecified": "Not specified",
        "positive": "Positive (+)",
        "negative": "Negative (-)",
        "unknown": "Unknown",
        "noRisk": "✅ Risk eliminated — fetus will be Rh negative",
        "antiDWeek28": "Anti-D Week 28",
        "antiDPostpartum": "Anti-D Postpartum",
        "positiveText": "Positive (+)",
        "negativeText": "Negative (-)"
      },
      "summary": {
        "gestationalWeek": "Gestational Week",
        "daysToEdd": "Days to Delivery",
        "eddDate": "Estimated Date of Delivery",
        "obstetricHistory": "Obstetric History",
        "riskLevel": "Risk Level"
      },
      "risk": {
        "low": "Low",
        "medium": "Medium",
        "high": "High"
      },
      "visits": {
        "title": "Follow-up Visits",
        "visitData": "Visit Data",
        "maternalWeight": "Maternal Weight (kg)",
        "systolicBp": "Systolic BP",
        "diastolicBp": "Diastolic BP",
        "fundalHeight": "Fundal Height (cm)",
        "fetalHeartRate": "Fetal Heart Rate",
        "fetalMovement": "Fetal Movement",
        "fetalPresentation": "Fetal Presentation",
        "presentations": {
          "cephalic": "Cephalic",
          "breech": "Breech",
          "transverse": "Transverse"
        },
        "hemoglobin": "Hemoglobin (g/dL)",
        "urineProtein": "Urine Protein",
        "urineGlucose": "Urine Glucose",
        "edema": "Edema",
        "nextVisit": "Next Visit",
        "complaints": "Patient Complaints",
        "complaintsPlaceholder": "Any complaints...",
        "doctorNotes": "Doctor Notes",
        "notesPlaceholder": "Notes...",
        "emptyState": "No follow-up visits recorded yet."
      },
      "yes": "Yes",
      "no": "No",
      "lab": {
        "value": {
          "nil": "Nil",
          "trace": "Trace",
          "plus": "+",
          "doublePlus": "++",
          "triplePlus": "+++"
        }
      },
      "table": {
        "week": "Week",
        "date": "Date",
        "weight": "Weight",
        "bp": "BP",
        "fundalHeight": "Fundal Height",
        "fhr": "FHR",
        "movement": "Movement",
        "hb": "Hb",
        "notes": "Notes"
      },
      "weekAbbreviation": "W",
      "unit": {
        "kg": " kg",
        "cm": " cm",
        "bpm": " bpm"
      },
      "list": {
        "title": "Pregnancy Records",
        "rhNegativeLabel": "🔴 Rh-",
        "visitsCount": " visits",
        "emptyState": "No pregnancy records exist for this patient."
      },
      "create": {
        "title": "Register New Pregnancy",
        "lmpDate": "Last Menstrual Period (LMP) *",
        "gravida": "Gravida count",
        "para": "Para count",
        "bloodGroup": "Blood group",
        "rhFactor": "Rh Factor (Mother)",
        "partnerRh": "Rh Factor (Partner)",
        "riskLevel": "Risk level",
        "riskFactors": "Risk factors",
        "riskFactorsPlaceholder": "Gestational diabetes, high BP...",
        "rhWarning": "⚠️ Mother is Rh negative — risk level will be auto-escalated and clinical alerts sent."
      }
    },
    "fertility": {
      "infertilityLabels": {
        "maleFactor": "Male Factor",
        "femaleFactor": "Female Factor",
        "combined": "Combined Factor",
        "unexplained": "Unexplained"
      },
      "cycleTypeLabels": {
        "ivf": "In Vitro Fertilization (IVF)",
        "icsi": "Intracytoplasmic Sperm Injection (ICSI)",
        "iui": "Intrauterine Insemination (IUI)",
        "fet": "Frozen Embryo Transfer (FET)",
        "eggFreezing": "Egg Freezing",
        "natural": "Natural Cycle"
      },
      "resultLabels": {
        "pending": "Pending",
        "positive": "Positive (Pregnancy) 🎉",
        "negative": "Negative",
        "biochemical": "Biochemical Pregnancy",
        "ectopic": "Ectopic Pregnancy",
        "miscarriage": "Miscarriage"
      },
      "embryoStatusLabels": {
        "developing": "Developing",
        "transferred": "Transferred",
        "frozen": "Frozen ❄️",
        "thawed": "Thawed",
        "discarded": "Discarded",
        "donated": "Donated"
      },
      "statusLabels": {
        "active": "Active",
        "successful": "Successful 🎉",
        "discontinued": "Discontinued",
        "referred": "Referred"
      },
      "toast": {
        "loadCaseError": "Failed to load infertility file",
        "loadPatientCasesError": "Failed to load patient infertility records",
        "loadActiveCasesError": "Failed to load active cases",
        "patientRequired": "Please select a patient",
        "createCaseSuccess": "Infertility file opened successfully",
        "createCaseError": "Failed to create infertility file",
        "startDateRequired": "Please specify start date",
        "createCycleSuccess": "New treatment cycle started",
        "createCycleError": "Failed to start cycle"
      },
      "loading": "Loading...",
      "title": "🧬 Infertility and ICSI File",
      "femaleIcon": "👩 ",
      "mrn": " (MRN: ",
      "maleIcon": " — 👨 ",
      "btn": {
        "back": "Back",
        "newCycle": "+ New Cycle",
        "startCycle": "Start Cycle",
        "openNewCase": "+ Open New File",
        "remove": "✕ Remove",
        "submitCase": "Open File"
      },
      "summary": {
        "infertilityType": "Infertility Type",
        "duration": "Duration of Childlessness",
        "cycles": "Treatment Cycles",
        "status": "Status"
      },
      "unit": {
        "years": " years",
        "ngml": " ng/mL",
        "miuml": " mIU/mL",
        "mm": " mm"
      },
      "diagnosticData": "Diagnostic Data",
      "wife": "Wife:",
      "husband": "Husband:",
      "notLinked": "Not Linked",
      "diagnosisLabel": "Diagnosis:",
      "semenAnalyses": "Semen Analyses:",
      "andrologyVisits": "Andrology Visits:",
      "cycles": "Treatment Cycles",
      "cycle": {
        "type": "Cycle Type",
        "protocol": "Protocol",
        "startDate": "Start Date",
        "started": "Started: ",
        "eggs": "Eggs: ",
        "fertilized": "Fertilized: ",
        "transferred": "Transferred: ",
        "frozen": "Frozen: ",
        "stimulationDays": "Stimulation Days",
        "matureEggs": "Mature Eggs",
        "embryosDay3": "Day 3 Embryos",
        "embryosDay5": "Day 5 Embryos",
        "endometrialThickness": "Endometrial Thickness",
        "betaHcg": "Beta HCG",
        "embryos": "Embryos:",
        "medications": "Medications:",
        "emptyState": "No treatment cycles recorded yet."
      },
      "protocols": {
        "long": "Long Protocol",
        "short": "Short Protocol",
        "antagonist": "Antagonist",
        "natural": "Natural",
        "ministim": "Mini-stim"
      },
      "create": {
        "title": "Open New Infertility File",
        "husbandSearchLabel": "Husband File (Optional) — Search by name or MRN",
        "husbandSearchPlaceholder": "Search for partner by name, MRN, or phone...",
        "infertilityType": "Infertility Type",
        "duration": "Duration of Childlessness (years)",
        "amh": "AMH (ng/mL)",
        "fsh": "FSH (mIU/mL)",
        "diagnosis": "Diagnosis",
        "diagnosisPlaceholder": "Detailed diagnosis..."
      },
      "list": {
        "title": "🧬 Infertility Treatment & ICSI",
        "caseNumber": "File #",
        "cyclesCount": " cycles",
        "emptyPatient": "No infertility files exist for this patient.",
        "emptyActive": "No active cases."
      }
    }
  },
  "andrology": {
    "loading": {
      "section": "Loading section...",
      "cryo": "Loading cryo bank...",
      "semenForm": "Loading semen form...",
      "visitForm": "Loading visit form...",
      "hormoneForm": "Loading hormone form...",
      "surgeryForm": "Loading surgery form...",
      "medicationForm": "Loading medication form...",
      "investigationForm": "Loading investigation form...",
      "reportPrint": "Loading medical report..."
    },
    "search": {
      "patientNotFound": "No patient found.",
      "searchError": "Search error.",
      "title": "Patient Search",
      "placeholder": "Search by name, MRN, or phone...",
      "searching": "Searching...",
      "button": "Search Now",
      "resultsFound": "Found {count} results — Please select:"
    },
    "semen": {
      "saveSuccess": "Semen analysis saved successfully.",
      "recordTitle": "📋 Semen Analysis History (WHO 6th Ed)",
      "addNew": "➕ Add New Analysis",
      "noRecords": "No semen analysis records found.",
      "testDate": "Analysis Date: ",
      "abstinencePeriod": "Abstinence: ",
      "days": " days",
      "collectionMethod": "Collection: ",
      "fields": {
        "volume": "Volume",
        "volumeUnit": "ml",
        "concentration": "Concentration",
        "concentrationUnit": "M/ml",
        "totalMotility": "Total Motility PR+NP",
        "percent": "%",
        "progressivePR": "Progressive Motility PR",
        "normalForms": "Normal Morphology (Kruger)"
      }
    },
    "common": {
      "saveFailed": "Save failed.",
      "loading": "Loading...",
      "cancel": "Cancel",
      "yes": "Yes",
      "no": "No"
    },
    "visit": {
      "saveSuccess": "Andrology visit saved successfully."
    },
    "hormone": {
      "saveSuccess": "Hormone profile saved successfully."
    },
    "surgery": {
      "saveSuccess": "Surgical procedure saved successfully."
    },
    "medication": {
      "saveSuccess": "Medication saved successfully."
    },
    "investigation": {
      "saveSuccess": "Investigation saved successfully."
    },
    "title": "Andrology & Infertility Clinic",
    "subtitle": "Advanced Follow-up Unit: Analysis & Diagnosis, Hormone Profile, Micro-Surgeries",
    "patient": {
      "mrn": "MRN: ",
      "medicalReport": "🖨️ Medical Report",
      "anotherPatient": "🔄 Switch Patient"
    },
    "tabs": {
      "overview": "📊 Dashboard",
      "semen": "🔬 Semen Analysis",
      "hormones": "🩸 Hormones",
      "visits": "🩺 Visits",
      "surgeries": "🔪 Surgeries",
      "medications": "💊 Medications",
      "investigations": "🔬 Investigations",
      "cryo": "❄️ Cryo Bank"
    },
    "overview": {
      "summaryTitle": "Clinical Summary 💡",
      "lastSemenStatus": "Semen Status (Last Analysis)",
      "notClassified": "Not Classified",
      "noAnalysis": "No Analysis Record",
      "lastHormonalStatus": "Hormonal Status (Last Exam)",
      "noHormoneProfile": "No Hormone Profile",
      "lastClinicalDiagnosis": "Last Clinical Diagnosis",
      "notDetermined": "Not Determined",
      "surgicalProcedures": "Surgical Procedures",
      "surgeriesCount": " procedure(s) (latest: ",
      "noSurgeries": "No surgical interventions",
      "semenTrend": "📈 Semen Analysis Trend Over Time",
      "concentrationVsMotility": "Concentration vs Motility",
      "chart": {
        "concentration": "Concentration (M/ml)",
        "motility": "Motility (%)",
        "requiresTwoSemen": "Chart requires two or more analyses",
        "testosterone": "Testosterone (ng/dL)",
        "fsh": "FSH (mIU/mL)",
        "requiresTwoHormone": "Chart requires two or more exams"
      },
      "hormoneTrend": "📉 Overall Hormonal Trend",
      "fshVsTestosterone": "FSH vs Testosterone",
      "timelineTitle": "⏱️ Patient Timeline",
      "timeline": {
        "startMedication": "Started treatment",
        "surgery": "Surgical procedure",
        "semenAnalysis": "Semen analysis",
        "investigation": "Investigation / Scan"
      }
    },
    "hormones": {
      "title": "🩸 Hormonal Profile Tracking",
      "addNew": "➕ Add Hormone Profile",
      "noRecords": "No hormone profile records found.",
      "table": {
        "date": "Date",
        "fsh": "FSH",
        "lh": "LH",
        "totalT": "Total T",
        "e2": "E2",
        "prl": "PRL",
        "notes": "Notes"
      }
    },
    "visits": {
      "title": "🩺 Andrology Visits",
      "addNew": "➕ New Visit",
      "noRecords": "No visits recorded.",
      "visitOn": "📅 Visit on ",
      "fields": {
        "chiefComplaint": "Chief Complaint",
        "varicoceleGrade": "Varicocele Grade",
        "varicoceleSides": "Sides (Right/Left)",
        "treatmentPlan": "Treatment Plan"
      }
    },
    "surgeries": {
      "title": "🔪 Surgical & Micro-procedures",
      "addNew": "➕ Record Surgery",
      "noRecords": "No surgical procedures recorded for this patient.",
      "spermRetrievedSuccess": "✅ Sperm Retrieved",
      "fields": {
        "date": "Date of Surgery: ",
        "surgeon": "Surgeon: ",
        "technique": "Technique:",
        "findings": "Findings:",
        "outcome": "Outcome:"
      }
    },
    "medications": {
      "title": "💊 Pharmacological Treatment Plan",
      "addNew": "➕ Add Medication",
      "noRecords": "No medications prescribed for this patient.",
      "fields": {
        "defaultCategory": "General Medication",
        "start": "Start: ",
        "end": "End: ",
        "dose": "Dose: ",
        "frequency": "Frequency: ",
        "response": "✅ Response: "
      }
    },
    "investigations": {
      "title": "🔬 Advanced Investigations & Scans",
      "addNew": "➕ Attach Investigation",
      "noRecords": "No investigations or scans recorded.",
      "fields": {
        "date": "Exam Date: ",
        "facility": "Facility: ",
        "findings": "Findings:",
        "interpretation": "Interpretation:",
        "normalRange": "Normal Range:"
      }
    },
    "forms": {
      "investigation": {
        "title": "🔬 Add Investigation or Scan",
        "fields": {
          "type": "Investigation Type ",
          "date": "Exam Date",
          "facilityName": "Facility Name",
          "findings": "Findings ",
          "interpretation": "Interpretation",
          "notes": "Doctor Notes"
        },
        "placeholders": {
          "selectType": "— Select Type —",
          "facilityName": "e.g. Al-Borg Lab, Saraya Hospital...",
          "findings": "Write detailed findings here..."
        },
        "groups": {
          "imaging": "Imaging & Radiology",
          "genetic": "Genetic & Hereditary Tests",
          "biopsies": "Biopsies & Samples",
          "other": "Other"
        },
        "options": {
          "scrotalUs": "Scrotal Ultrasound (Scrotal US)",
          "scrotalDoppler": "Scrotal Doppler",
          "trus": "Transrectal Ultrasound (TRUS)",
          "karyotype": "Karyotyping (Karyotype)",
          "yMicrodeletion": "Y-Chromosome Microdeletion",
          "cftr": "CFTR Mutations",
          "testicularBiopsy": "Diagnostic Testicular Biopsy",
          "other": "Other Investigation..."
        },
        "buttons": {
          "save": "💾 Save Investigation"
        }
      },
      "medication": {
        "title": "💊 Add Medical Treatment",
        "fields": {
          "medication": "Medication / Active Substance ",
          "category": "Medication Category",
          "dose": "Dose",
          "frequency": "Frequency",
          "startDate": "Start Date",
          "endDate": "Expected End Date",
          "response": "Clinical Response",
          "sideEffects": "Side Effects"
        },
        "placeholders": {
          "medication": "e.g. Clomiphene Citrate 50mg",
          "selectCategory": "— Select —",
          "dose": "e.g. 1 Tablet",
          "frequency": "e.g. Twice Daily",
          "response": "Expected outcome / clinical effect",
          "sideEffects": "Any side effects noticed"
        },
        "options": {
          "antiEstrogen": "Anti-estrogens",
          "gonadotropins": "Gonadotropins",
          "antioxidants": "Antioxidants & Supplements",
          "antibiotics": "Antibiotics",
          "pde5Inhibitors": "PDE5 Inhibitors",
          "other": "Other"
        },
        "buttons": {
          "save": "💾 Save Treatment"
        }
      },
      "surgery": {
        "title": "🔪 New Surgical Procedure",
        "fields": {
          "procedure": "Surgical Procedure",
          "date": "Surgery Date",
          "technique": "Technique",
          "surgeonName": "Surgeon Name",
          "spermRetrieved": "Was sperm retrieval successful?",
          "findings": "Findings",
          "complications": "Complications",
          "outcome": "Outcome"
        },
        "placeholders": {
          "selectProcedure": "— Select —",
          "technique": "e.g. Microsurgical Subinguinal"
        },
        "options": {
          "varicocelectomy": "Varicocelectomy",
          "vasectomyReversal": "Vasectomy Reversal",
          "other": "Other"
        },
        "buttons": {
          "save": "💾 Save Surgery"
        }
      },
      "visit": {
        "title": "🩺 Andrology Visit (Advanced Medical History)",
        "sections": {
          "complaintAndInfertility": "1. Chief Complaint & Infertility History",
          "sexualFunction": "2. Sexual Function",
          "medicalLifestyleHistory": "3. Medical, Surgical & Lifestyle History",
          "physicalExam": "4. Physical Examination"
        },
        "fields": {
          "chiefComplaint": "Chief Complaint",
          "infertilityMonths": "Infertility Duration (Months)",
          "previousPregnancies": "Previous Pregnancies",
          "coitalFrequency": "Coital Frequency (Weekly)",
          "erectileDisfunc": "Erectile Dysfunction",
          "ejaculatoryDisfunc": "Ejaculatory Disorder",
          "prematureEjac": "Premature Ejaculation",
          "retrogradeEjac": "Retrograde Ejaculation",
          "libidoLevel": "Libido Level",
          "cryptorchidismHistory": " Cryptorchidism (History)",
          "orchitisHistory": " Orchitis",
          "inguinalSurgery": " Inguinal Surgery",
          "chemotherapy": " Chemotherapy",
          "radiationExposure": " Radiation Exposure",
          "smokingHabit": "Smoking",
          "alcoholUse": "Alcohol Use",
          "occupationalExposure": "Occupational Exposure (Heat/Chemicals)",
          "medicalConditions": "Chronic Diseases",
          "surgicalHistory": "Other Surgeries",
          "currentMedications": "Current Medications",
          "bmi": "Body Mass Index (BMI)",
          "varicoceleGrade": "Varicocele (Grade)",
          "testicularVolR": "Right Testicular Volume (ml)",
          "testicularVolL": "Left Testicular Volume (ml)",
          "testisConsistency": "Testicular Consistency",
          "vasPresence": "Vas Deferens",
          "epididymalFindings": "Epididymal Exam",
          "gynecomastia": " Gynecomastia",
          "diagnosis": "Final Diagnosis",
          "treatmentPlan": "Agreed Treatment Plan"
        },
        "placeholders": {
          "coitalFrequency": "e.g. 2-3 times"
        },
        "options": {
          "libidoNormal": "Normal",
          "libidoLow": "Low",
          "libidoAbsent": "Absent",
          "smokingNon": "Non-smoker",
          "smokingSmoker": "Smoker",
          "smokingEx": "Ex-smoker",
          "alcoholOccasional": "Occasional",
          "alcoholRegular": "Regular",
          "varicoceleNone": "None",
          "varicoceleGrade1": "Grade 1",
          "varicoceleGrade2": "Grade 2",
          "varicoceleGrade3": "Grade 3",
          "varicoceleBilateral": "Bilateral",
          "consistencyNormal": "Normal",
          "consistencySoft": "Soft",
          "consistencyAtrophic": "Atrophic",
          "vasPresent": "Present",
          "vasAbsent": "Absent (CBAVD)",
          "vasPartial": "Partial"
        },
        "buttons": {
          "save": "💾 Save Clinical Visit"
        }
      }
    },
    "print": {
      "previewTitle": "📄 Medical Report Preview",
      "printButton": "🖨️ Print Report",
      "reportTitle": "Medical Report",
      "department": "DEPARTMENT OF ANDROLOGY & REPRODUCTIVE MEDICINE",
      "tel": "Tel: ",
      "dateLabel": "Date: ",
      "logoAlt": "Logo",
      "patientName": "Patient Name:",
      "mrn": "MRN:",
      "phone": "Phone:",
      "reportDate": "Report Date:",
      "sections": {
        "clinicalOverview": "1. Clinical Overview",
        "semenHistory": "2. Semen Analysis History",
        "hormonalProfile": "3. Hormonal Profile",
        "surgicalHistory": "4. Surgical History",
        "pharmacologicalTherapy": "5. Pharmacological Therapy"
      },
      "fields": {
        "primaryDiagnosis": "Primary Diagnosis: ",
        "underEvaluation": "Under Evaluation",
        "chiefComplaint": "Chief Complaint: ",
        "proposedPlan": "Proposed Plan: ",
        "technique": "Technique: ",
        "outcome": "Outcome: ",
        "successfulRetrieval": "Successful Sperm Retrieval ✓",
        "noSpermRetrieved": "No Sperm Retrieved",
        "started": "Started: "
      },
      "table": {
        "date": "Date",
        "volume": "Vol (ml)",
        "concentration": "Conc. (M/ml)",
        "motility": "PR+NP (%)",
        "normalForms": "Normal (%)",
        "classification": "Classification",
        "fsh": "FSH (mIU/mL)",
        "lh": "LH (mIU/mL)",
        "testosterone": "Testosterone (ng/dL)",
        "prolactin": "Prolactin (ng/mL)"
      },
      "consultantSignature": "Consultant Signature",
      "deptSignature": "Andrology & Reproductive Medicine",
      "footer": "Generated electronically by Saraya Medical ERP • "
    }
  }
};

// Merge them
Object.assign(arData, arInject);
Object.assign(enData, enInject);

fs.writeFileSync(arPath, JSON.stringify(arData, null, 2), 'utf8');
fs.writeFileSync(enPath, JSON.stringify(enData, null, 2), 'utf8');

console.log("Successfully updated locale files for Phase 7!");
