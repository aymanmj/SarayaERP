// client/src/utils/hrExport.test.ts
import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import {
  buildBiometricHoursWordDocument,
  formatMinutesToHoursText,
  parseEmployeesExcelRows,
} from "./hrExport";
import type { BiometricHoursReportResponse } from "../services/hr.service";

describe("hrExport helpers", () => {
  it("formats minutes to Arabic hours text cleanly", () => {
    expect(formatMinutesToHoursText(0)).toBe("0 س 00 د");
    expect(formatMinutesToHoursText(485)).toBe("8 س 05 د");
  });

  it("parses both Saraya standard and Altamam Excel column headers", () => {
    const raw = [
      {
        "رقم السرايا": "EMP-1001",
        "رقم التمام": "TAM-901",
        "الاسم الكامل": "د. طارق المنصوري",
        "الإدارة / القسم": "الجراحة",
        "التصنيف": "طبي",
        "المسمى الوظيفي": "استشاري جراحة",
        "الراتب الأساسي": "4,500",
        "رقم الهاتف": "0912345678",
        "الرقم الوطني": "119850123456",
      },
      {
        "ر.الوظيفي": "452",
        "__EMPTY_5": "سارة عبد الله الورفلي",
        "القسم": "التمريض",
        "التصنيف": "تمريض",
        "الوظيفة": "ممرضة",
        "الراتب": 2800,
      },
    ];

    const withAltamam = parseEmployeesExcelRows(raw, {
      includeAltamam: true,
      altamamMode: true,
    });
    expect(withAltamam).toHaveLength(2);
    expect(withAltamam[0].employeeNo).toBe("EMP-1001");
    expect(withAltamam[0].altamamEmployeeNo).toBe("TAM-901");
    expect(withAltamam[0].basicSalary).toBe(4500);
    expect(withAltamam[1].altamamEmployeeNo).toBe("452");
    expect(withAltamam[1].fullName).toBe("سارة عبد الله الورفلي");

    const withoutAltamam = parseEmployeesExcelRows(raw, {
      includeAltamam: false,
      altamamMode: false,
    });
    expect(withoutAltamam[0].altamamEmployeeNo).toBeUndefined();
    expect(withoutAltamam[1].altamamEmployeeNo).toBeUndefined();
  });

  it("generates a valid Word (.docx) document blob/buffer for biometric hours", async () => {
    const report: BiometricHoursReportResponse = {
      startDate: "2026-11-01",
      endDate: "2026-11-07",
      debounceMinutes: 3,
      generatedAt: "2026-11-07T10:00:00.000Z",
      summary: {
        employeeCount: 1,
        totalMinutes: 720,
        totalHours: 12,
        issueCount: 1,
      },
      rows: [
        {
          employeeId: 10,
          employeeNo: "EMP-0001",
          biometricId: "101",
          fullName: "علي سالم محمد",
          department: "العناية الفائقة",
          section: "العناية الليلية",
          staffCategory: "NURSING",
          totalMinutes: 720,
          totalHours: 12,
          periodCount: 1,
          issueCount: 1,
          sessions: [
            {
              workDate: "2026-11-01",
              periods: [
                {
                  startTime: "2026-11-01T20:00:00.000Z",
                  endTime: "2026-11-02T08:00:00.000Z",
                  durationMinutes: 720,
                },
              ],
              issues: [
                {
                  punchId: 99,
                  punchedAt: "2026-11-03T08:00:00.000Z",
                  reason: "بصمة غير مكتملة دون بصمة مقابلة",
                },
              ],
              duplicateCount: 0,
              totalMinutes: 720,
            },
          ],
        },
      ],
    };

    const doc = buildBiometricHoursWordDocument(report, {
      hospitalName: "مستشفى السرايا الدولي",
      hospitalNameEn: "Saraya International Hospital",
    });
    const buffer = await Packer.toBuffer(doc);
    expect(buffer.byteLength).toBeGreaterThan(1000);
    // DOCX is a ZIP archive starting with PK\x03\x04
    expect(buffer.subarray(0, 2).toString("utf8")).toBe("PK");
  });
});
