// client/src/components/ui/SarayaPrimitives.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  SarayaFilterSelect,
  SarayaKpiCard,
  SarayaLtrBadge,
} from "./SarayaPrimitives";

describe("SarayaPrimitives", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders LTR badges without flipping leading symbols like @username", () => {
    render(<SarayaLtrBadge>@dr_ahmed</SarayaLtrBadge>);
    const el = screen.getByText("@dr_ahmed");
    expect(el).toHaveAttribute("dir", "ltr");
    expect(el.textContent).toBe("@dr_ahmed");
  });

  it("renders SarayaKpiCard label, value, subtext, and loading state", () => {
    const { rerender } = render(
      <SarayaKpiCard
        label="إجمالي الموظفين"
        value={576}
        subtext="على رأس العمل"
        accent="emerald"
        ltrValue
      />,
    );

    expect(screen.getByText("إجمالي الموظفين")).toBeInTheDocument();
    expect(screen.getByText("576")).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("على رأس العمل")).toBeInTheDocument();

    rerender(
      <SarayaKpiCard label="إجمالي الموظفين" value={576} loading />,
    );
    expect(screen.getByText("...")).toBeInTheDocument();
  });

  it("filters Arabic options, selects an item, and clears selection in SarayaFilterSelect", () => {
    const onChange = vi.fn();
    const options = [
      { value: "1", label: "الإدارة العامة ومكتب المدير" },
      { value: "2", label: "قسم العناية الفائقة" },
      { value: "3", label: "قسم الجراحة والعمليات" },
      { value: "4", label: "قسم المختبرات" },
      { value: "5", label: "قسم الصيدلية" },
      { value: "6", label: "قسم الأشعة" },
    ];

    const { rerender } = render(
      <SarayaFilterSelect
        value=""
        onChange={onChange}
        options={options}
        placeholder="كل الأقسام"
        allLabel="كل الأقسام"
        ariaLabel="تصفية القسم"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "تصفية القسم" }));
    const searchInput = screen.getByPlaceholderText("بحث سريع...");
    fireEvent.change(searchInput, { target: { value: "العناية" } });

    expect(screen.getByText("قسم العناية الفائقة")).toBeInTheDocument();
    expect(screen.queryByText("قسم المختبرات")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("قسم العناية الفائقة"));
    expect(onChange).toHaveBeenCalledWith("2");

    rerender(
      <SarayaFilterSelect
        value="2"
        onChange={onChange}
        options={options}
        placeholder="كل الأقسام"
        allLabel="كل الأقسام"
        ariaLabel="تصفية القسم"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "مسح الاختيار" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
