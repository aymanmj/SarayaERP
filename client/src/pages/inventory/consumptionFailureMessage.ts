const messages: Record<string, { ar: string; en: string }> = {
  SOURCE_NOT_CONFIGURED: {
    ar: "لم يُعد مصدر مخزن الاستهلاك للمنشأة",
    en: "Consumption source warehouse is not configured",
  },
  WAREHOUSE_UNAVAILABLE: {
    ar: "المخزن المثبت غير نشط أو غير متاح للمنشأة",
    en: "The frozen warehouse is inactive or unavailable",
  },
  STOCK_INSUFFICIENT: {
    ar: "رصيد التشغيلات الصالحة في المصدر غير كافٍ",
    en: "Insufficient eligible batch stock in the source warehouse",
  },
  SUMMARY_INSUFFICIENT: {
    ar: "الرصيد الإجمالي غير كافٍ؛تلزم مطابقة المخزون",
    en: "Insufficient product summary stock; reconcile inventory",
  },
  ACCOUNT_MAPPING_INVALID: {
    ar: "حسابات فئة المخزون غير صالحة أو خارج المنشأة",
    en: "Inventory category accounts are invalid or outside this hospital",
  },
  ACCOUNTING_POSTING_FAILED: {
    ar: "تعذر ترحيل القيد؛راجع الفترة المالية وإعداد الحسابات",
    en: "Journal posting failed; review the financial period and account configuration",
  },
  COST_INVALID: { ar: "تكلفة الصنف غير صالحة", en: "Invalid product cost" },
};
export function consumptionFailureMessage(code: string, ar: boolean) {
  if (Object.prototype.hasOwnProperty.call(messages, code))
    return ar ? messages[code].ar : messages[code].en;
  return ar
    ? "تعذر استهلاك المواد؛تلزم المراجعة"
    : "Material consumption failed; review required";
}
