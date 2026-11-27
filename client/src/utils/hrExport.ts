// client/src/utils/hrExport.ts
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  LineRuleType,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type {
  BiometricHoursReportResponse,
  EmployeeListItem,
  StaffCategory,
} from "../services/hr.service";

export const STAFF_CATEGORY_LABELS: Record<StaffCategory, string> = {
  MEDICAL: "كادر طبي",
  NURSING: "تمريض",
  PHARMACY: "صيدلة",
  LABORATORY: "مختبرات",
  RADIOLOGY: "أشعة",
  TECHNICAL: "فني",
  ADMINISTRATIVE: "إداري ومساند",
};

export const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "على رأس العمل",
  PROBATION: "فترة تجربة",
  ON_LEAVE: "إجازة",
  SUSPENDED: "موقوف",
  TERMINATED: "منتهية خدمته",
  RESIGNED: "مستقيل",
};

export function formatMinutesToHoursText(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h} س ${String(m).padStart(2, "0")} د`;
}

export interface ParsedEmployeeImportRow {
  employeeNo?: string;
  altamamEmployeeNo?: string;
  fullName: string;
  departmentName?: string;
  staffCategory?: string;
  jobTitle?: string;
  nationality?: string;
  qualification?: string;
  basicSalary: number;
  phone?: string;
  nationalId?: string;
  gender?: string;
  hireDate?: string;
  dateOfBirth?: string;
}

function readCellText(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val !== null) {
      const text = String(val).trim();
      if (text) return text;
    }
  }
  return "";
}

/**
 * Parses raw SheetJS rows from either standard Saraya Excel templates
 * or real-world Altamam Excel exports into normalized DTO rows.
 */
export function parseEmployeesExcelRows(
  rawRows: Record<string, unknown>[],
  options: { includeAltamam: boolean; altamamMode?: boolean },
): ParsedEmployeeImportRow[] {
  const results: ParsedEmployeeImportRow[] = [];
  for (const row of rawRows) {
    const explicitSarayaNo = readCellText(row, [
      "رقم السرايا",
      "الرقم الوظيفي في السرايا",
      "رقم الموظف في السرايا",
      "sarayaEmployeeNo",
      "employeeNo",
    ]);
    const genericEmpNo = readCellText(row, ["الرقم الوظيفي", "رقم الموظف"]);
    const altamamNo =
      options.includeAltamam || options.altamamMode
        ? readCellText(row, [
            "رقم التمام",
            "رقم الموظف في التمام",
            "رقم منظومة التمام",
            "الرقم الوظيفي في التمام",
            "ر.الوظفي",
            "ر.الوظيفي",
            "altamamEmployeeNo",
          ]) || (!explicitSarayaNo && options.altamamMode ? genericEmpNo : "")
        : "";

    const employeeNo =
      explicitSarayaNo || (!options.altamamMode ? genericEmpNo : "");

    const fullName = readCellText(row, [
      "الاسم الكامل",
      "الاسم الرباعي",
      "اسم الموظف",
      "الاسم",
      "__EMPTY_5",
      "fullName",
    ]);

    if (!fullName) continue;

    const salaryRaw = readCellText(row, [
      "الراتب الأساسي",
      "الراتب",
      "basicSalary",
      "baseSalary",
    ]);
    const parsedSalary = Number(salaryRaw.replace(/[^\d.-]/g, ""));

    results.push({
      employeeNo: employeeNo || undefined,
      altamamEmployeeNo: altamamNo || undefined,
      fullName,
      departmentName:
        readCellText(row, [
          "الإدارة / القسم",
          "القسم",
          "الإدارة",
          "departmentName",
          "department",
        ]) || undefined,
      staffCategory:
        readCellText(row, [
          "تصنيف الكادر",
          "التصنيف",
          "الكادر",
          "staffCategory",
        ]) || "إداري",
      jobTitle:
        readCellText(row, [
          "المسمى الوظيفي",
          "الوظيفة",
          "التخصص",
          "الصفة",
          "jobTitle",
        ]) || undefined,
      nationality:
        readCellText(row, ["الجنسية", "nationality"]) || undefined,
      qualification:
        readCellText(row, ["المؤهل العلمي", "المؤهل", "qualification"]) ||
        undefined,
      basicSalary: Number.isFinite(parsedSalary) && parsedSalary > 0 ? parsedSalary : 0,
      phone: readCellText(row, ["رقم الهاتف", "الهاتف", "phone"]) || undefined,
      nationalId:
        readCellText(row, ["الرقم الوطني", "الهوية", "nationalId"]) || undefined,
      gender: readCellText(row, ["الجنس", "النوع", "gender"]) || undefined,
      hireDate:
        readCellText(row, ["تاريخ التعيين", "تاريخ المباشرة", "hireDate"]) ||
        undefined,
      dateOfBirth:
        readCellText(row, [
          "تاريخ الميلاد",
          "ت.الميلاد",
          "__EMPTY_4",
          "dateOfBirth",
        ]) || undefined,
    });
  }
  return results;
}

export function exportEmployeesToExcel(
  employees: EmployeeListItem[],
  options: { includeAltamam: boolean },
) {
  const rows = employees.map((emp) => {
    const base: Record<string, unknown> = {
      "الرقم الوظيفي": emp.employeeNo,
    };
    if (options.includeAltamam) {
      base["رقم التمام"] = emp.altamamEmployeeNo || "";
    }
    Object.assign(base, {
      "الاسم الكامل": emp.fullName,
      "كود البصمة": emp.biometricId || "",
      "الإدارة / القسم": emp.department?.name || "",
      "الشعبة": emp.section?.name || "",
      "المسمى الوظيفي": emp.jobTitle?.name || "",
      "التصنيف": STAFF_CATEGORY_LABELS[emp.staffCategory] || emp.staffCategory,
      "الحالة": EMPLOYEE_STATUS_LABELS[emp.status] || emp.status,
      "حساب النظام": emp.user ? `@${emp.user.username}` : "بدون حساب",
      "الراتب الأساسي": Number(emp.basicSalary || 0),
      "العملة": emp.currency || "LYD",
      "رقم الهاتف": emp.phone || "",
      "الرقم الوطني": emp.nationalId || "",
      "تاريخ التعيين": emp.hireDate ? emp.hireDate.slice(0, 10) : "",
    });
    return base;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "شؤون الموظفين");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `سجل_الموظفين_السرايا_${stamp}.xlsx`);
}

export function downloadEmployeesImportTemplate(options: {
  includeAltamam: boolean;
  altamamMode?: boolean;
}) {
  const showAltamam = options.includeAltamam || Boolean(options.altamamMode);
  const sampleRow1: Record<string, unknown> = {
    "رقم السرايا": "EMP-1001",
    ...(showAltamam ? { "رقم التمام": "TAM-501" } : {}),
    "الاسم الكامل": "د. طارق محمود عبد السلام المنصوري",
    "الإدارة / القسم": "قسم الجراحة والعمليات",
    "التصنيف": "طبي",
    "المسمى الوظيفي": "استشاري جراحة عامة",
    "الراتب الأساسي": 4500,
    "رقم الهاتف": "0912345678",
    "الرقم الوطني": "119850123456",
    "الجنس": "ذكر",
    "تاريخ التعيين": "2025-01-15",
  };
  const sampleRow2: Record<string, unknown> = {
    "رقم السرايا": "EMP-1002",
    ...(showAltamam ? { "رقم التمام": "TAM-502" } : {}),
    "الاسم الكامل": "سارة عبد الله سالم الورفلي",
    "الإدارة / القسم": "قسم العناية والتمريض",
    "التصنيف": "تمريض",
    "المسمى الوظيفي": "أخصائية تمريض عناية فائقة",
    "الراتب الأساسي": 2800,
    "رقم الهاتف": "0923456789",
    "الرقم الوطني": "219900654321",
    "الجنس": "أنثى",
    "تاريخ التعيين": "2025-02-01",
  };

  const ws = XLSX.utils.json_to_sheet([sampleRow1, sampleRow2]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "نموذج استيراد الموظفين");
  XLSX.writeFile(
    wb,
    showAltamam
      ? "نموذج_استيراد_الموظفين_التمام_السرايا.xlsx"
      : "نموذج_استيراد_الموظفين_السرايا.xlsx",
  );
}

export function exportBiometricHoursToExcel(report: BiometricHoursReportResponse) {
  const summaryRows = report.rows.map((r, idx) => ({
    م: idx + 1,
    "الرقم الوظيفي": r.employeeNo,
    "كود البصمة": r.biometricId,
    "اسم الموظف": r.fullName,
    "الإدارة / القسم": [r.department, r.section].filter(Boolean).join(" / "),
    "التصنيف": STAFF_CATEGORY_LABELS[r.staffCategory] || r.staffCategory,
    "الفترات المكتملة": r.periodCount,
    "بصمات ناقصة للمراجعة": r.issueCount,
    "إجمالي الساعات": r.totalHours,
    "المدة المفصلة": formatMinutesToHoursText(r.totalMinutes),
  }));

  const detailRows = report.rows.flatMap((r) =>
    r.sessions.flatMap((s) => [
      ...s.periods.map((p, idx) => ({
        "الرقم الوظيفي": r.employeeNo,
        "اسم الموظف": r.fullName,
        "تاريخ الوردية": s.workDate,
        "البيان": `فترة ${idx + 1}`,
        "وقت الدخول": new Date(p.startTime).toLocaleString("ar-LY"),
        "وقت الخروج": new Date(p.endTime).toLocaleString("ar-LY"),
        "المدة": formatMinutesToHoursText(p.durationMinutes),
        "الحالة": "محتسبة",
      })),
      ...s.issues.map((issue) => ({
        "الرقم الوظيفي": r.employeeNo,
        "اسم الموظف": r.fullName,
        "تاريخ الوردية": s.workDate,
        "البيان": "تنبيه بصمة",
        "وقت الدخول": new Date(issue.punchedAt).toLocaleString("ar-LY"),
        "وقت الخروج": "—",
        "المدة": "0",
        "الحالة": issue.reason,
      })),
    ]),
  );

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, "ملخص ساعات البصمة");
  if (detailRows.length > 0) {
    const wsDetails = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetails, "تفاصيل الفترات والتنبيهات");
  }
  XLSX.writeFile(
    wb,
    `تقرير_ساعات_البصمة_${report.startDate}_${report.endDate}.xlsx`,
  );
}

// =========================================================================
// RTL Word (.docx) Export for Biometric Hours Report
// =========================================================================

const NAVY = "1B3A5C";
const INK = "1E293B";
const MUTED = "64748B";
const TABLE_WIDTH = 15398;
const FONT = "Cairo";
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const invisibleBorders = {
  top: noBorder,
  bottom: noBorder,
  left: noBorder,
  right: noBorder,
  insideHorizontal: noBorder,
  insideVertical: noBorder,
};

function rtlParagraph(
  text: string,
  options: {
    bold?: boolean;
    color?: string;
    size?: number;
    center?: boolean;
    after?: number;
    before?: number;
    keepNext?: boolean;
  } = {},
) {
  const size = options.size ?? 20;
  return new Paragraph({
    bidirectional: true,
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.START,
    keepNext: options.keepNext,
    spacing: {
      before: options.before ?? 0,
      after: options.after ?? 0,
      line: 260,
      lineRule: LineRuleType.AT_LEAST,
    },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        boldComplexScript: options.bold,
        color: options.color ?? INK,
        size,
        sizeComplexScript: size,
        font: FONT,
        rightToLeft: true,
      }),
    ],
  });
}

function buildDocxTable(
  headers: string[],
  rows: string[][],
  widths: number[],
): Table {
  const allRows = [headers, ...rows];
  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    visuallyRightToLeft: true,
    borders: {
      top: cellBorder,
      bottom: cellBorder,
      left: cellBorder,
      right: cellBorder,
      insideHorizontal: cellBorder,
      insideVertical: cellBorder,
    },
    rows: allRows.map((cells, rowIdx) => {
      const isHeader = rowIdx === 0;
      return new TableRow({
        tableHeader: isHeader,
        cantSplit: true,
        children: cells.map(
          (text, colIdx) =>
            new TableCell({
              width: { size: widths[colIdx], type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              shading: {
                fill: isHeader
                  ? NAVY
                  : rowIdx % 2 === 1
                    ? "FFFFFF"
                    : "F8FAFC",
              },
              margins: { top: 80, bottom: 80, left: 100, right: 100 },
              children: [
                rtlParagraph(text, {
                  bold: isHeader || colIdx === 3 || colIdx === 7,
                  center: isHeader || (colIdx !== 3 && colIdx !== 4),
                  color: isHeader ? "FFFFFF" : colIdx === 7 ? NAVY : INK,
                  size: 18,
                }),
              ],
            }),
        ),
      });
    }),
  });
}

export function buildBiometricHoursWordDocument(
  report: BiometricHoursReportResponse,
  identity: { hospitalName: string; hospitalNameEn?: string },
): Document {
  const headerTable = new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [9300, 6098],
    visuallyRightToLeft: true,
    layout: TableLayoutType.FIXED,
    borders: {
      ...invisibleBorders,
      bottom: { style: BorderStyle.SINGLE, size: 14, color: NAVY },
    },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 9300, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 100, bottom: 160, left: 120, right: 120 },
            children: [
              rtlParagraph(identity.hospitalName || "منظومة السرايا الطبي", {
                bold: true,
                color: NAVY,
                size: 30,
                after: 40,
              }),
              rtlParagraph(identity.hospitalNameEn || "Saraya Medical System", {
                color: MUTED,
                size: 20,
              }),
            ],
          }),
          new TableCell({
            width: { size: 6098, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: "F0F5FF" },
            margins: { top: 100, bottom: 160, left: 120, right: 120 },
            children: [
              rtlParagraph("كشف إجمالي ساعات البصمة الفعلية", {
                bold: true,
                color: NAVY,
                size: 24,
                center: true,
                after: 60,
              }),
              rtlParagraph(`الفترة: ${report.startDate} إلى ${report.endDate}`, {
                size: 18,
                center: true,
                after: 30,
              }),
              rtlParagraph(
                `الموظفون: ${report.summary.employeeCount} | إجمالي الساعات: ${report.summary.totalHours} س | تنبيهات: ${report.summary.issueCount}`,
                { size: 17, color: MUTED, center: true },
              ),
            ],
          }),
        ],
      }),
    ],
  });

  const mainRows = report.rows.map((row, idx) => [
    String(idx + 1),
    row.employeeNo,
    row.biometricId,
    row.fullName,
    [row.department, row.section].filter(Boolean).join(" / "),
    STAFF_CATEGORY_LABELS[row.staffCategory] || row.staffCategory,
    String(row.periodCount),
    formatMinutesToHoursText(row.totalMinutes),
    String(row.issueCount),
    "",
  ]);

  const summaryTable = buildDocxTable(
    [
      "م",
      "الرقم الوظيفي",
      "كود البصمة",
      "اسم الموظف",
      "الإدارة / القسم",
      "التصنيف",
      "الفترات",
      "إجمالي الساعات الفعلية",
      "بصمات ناقصة",
      "التوقيع",
    ],
    mainRows.length
      ? mainRows
      : [["—", "—", "—", "لا توجد بيانات", "—", "—", "0", "0 س 00 د", "0", ""]],
    [450, 1450, 950, 3000, 2900, 1300, 950, 2400, 1050, 948],
  );

  const issueRows = report.rows.flatMap((r) =>
    r.sessions.flatMap((s) =>
      s.issues.map((issue) => [
        r.employeeNo,
        r.fullName,
        s.workDate,
        new Date(issue.punchedAt).toLocaleString("ar-LY"),
        issue.reason,
      ]),
    ),
  );

  const approvalsTable = new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [5132, 5132, 5134],
    visuallyRightToLeft: true,
    layout: TableLayoutType.FIXED,
    borders: invisibleBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          "أعدّه (الموارد البشرية)",
          "راجعه (الشؤون الإدارية)",
          "اعتمده (المدير العام)",
        ].map(
          (title, idx) =>
            new TableCell({
              width: { size: idx === 2 ? 5134 : 5132, type: WidthType.DXA },
              margins: { top: 180, bottom: 60, left: 150, right: 150 },
              children: [
                rtlParagraph(title, {
                  bold: true,
                  color: NAVY,
                  size: 19,
                  center: true,
                  after: 160,
                }),
                rtlParagraph("الاسم: ...................................", {
                  size: 17,
                  center: true,
                  after: 40,
                }),
                rtlParagraph("التوقيع: ................  التاريخ: ........", {
                  size: 16,
                  center: true,
                }),
              ],
            }),
        ),
      }),
    ],
  });

  const children: (Paragraph | Table)[] = [
    headerTable,
    new Paragraph({ spacing: { after: 140 }, children: [] }),
    summaryTable,
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    rtlParagraph(
      `الإجمالي العام للكشف: ${formatMinutesToHoursText(report.summary.totalMinutes)} (${report.summary.totalHours} ساعة) — مهلة منع التكرار: ${report.debounceMinutes} دقائق.`,
      { bold: true, color: NAVY, size: 20, after: 120 },
    ),
  ];

  if (issueRows.length > 0) {
    children.push(
      rtlParagraph("سجل البصمات المستبعدة / الناقصة للمراجعة", {
        bold: true,
        color: "9A3412",
        size: 21,
        before: 100,
        after: 80,
      }),
      buildDocxTable(
        ["الرقم الوظيفي", "الموظف", "تاريخ الوردية", "وقت البصمة", "سبب المراجعة"],
        issueRows,
        [2000, 3800, 2000, 3200, 4398],
      ),
      new Paragraph({ spacing: { after: 120 }, children: [] }),
    );
  }

  children.push(approvalsTable);

  const footer = new Footer({
    children: [
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.CENTER,
        border: { top: cellBorder },
        spacing: { before: 80 },
        children: [
          new TextRun({
            text: `${identity.hospitalName || "منظومة السرايا الطبي"}  |  صفحة `,
            font: FONT,
            size: 15,
            sizeComplexScript: 15,
            color: MUTED,
            rightToLeft: true,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            rightToLeft: false,
            font: FONT,
            size: 15,
            sizeComplexScript: 15,
            color: MUTED,
          }),
        ],
      }),
    ],
  });

  return new Document({
    creator: "SarayaERP",
    title: "كشف ساعات البصمة الفعلية",
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 20, sizeComplexScript: 20, color: INK },
        },
      },
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: {
              width: 11906,
              height: 16838,
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: 700,
              bottom: 700,
              left: 700,
              right: 700,
              header: 220,
              footer: 280,
            },
          },
        },
        headers: {
          first: new Header({ children: [rtlParagraph("", { size: 1 })] }),
          default: new Header({
            children: [
              rtlParagraph(
                `${identity.hospitalName} | تقرير ساعات البصمة | ${report.startDate} - ${report.endDate}`,
                { size: 16, color: NAVY, center: true },
              ),
            ],
          }),
        },
        footers: { default: footer, first: footer },
        children,
      },
    ],
  });
}

export async function exportBiometricHoursToWord(
  report: BiometricHoursReportResponse,
  identity: { hospitalName: string; hospitalNameEn?: string },
) {
  const doc = buildBiometricHoursWordDocument(report, identity);
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `تقرير_ساعات_البصمة_${report.startDate}_${report.endDate}.docx`);
}
