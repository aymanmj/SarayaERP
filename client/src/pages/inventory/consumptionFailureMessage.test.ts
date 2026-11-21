import { describe, it, expect } from "vitest";
import { consumptionFailureMessage } from "./consumptionFailureMessage";
describe("Safe consumption failure messages", () => {
  it("renders stage-specific financial guidance in both languages", () => {
    expect(
      consumptionFailureMessage("ACCOUNTING_POSTING_FAILED", false),
    ).toContain("financial period");
    expect(
      consumptionFailureMessage("ACCOUNTING_POSTING_FAILED", true),
    ).toContain("الفترة المالية");
  });
  it("never displays arbitrary server exceptions or inherited property names", () => {
    for (const code of [
      "synthetic private exception text",
      "__proto__",
      "constructor",
    ])
      expect(consumptionFailureMessage(code, false)).toBe(
        "Material consumption failed; review required",
      );
  });
});
