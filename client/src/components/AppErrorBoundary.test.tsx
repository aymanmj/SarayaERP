import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function ExplodingChild(): never {
  throw new Error("Synthetic render crash");
}

describe("AppErrorBoundary", () => {
  it("renders fallback UI when a child throws during render", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <AppErrorBoundary>
          <ExplodingChild />
        </AppErrorBoundary>,
      );
      expect(screen.getByText(/حدث خطأ غير متوقع في الواجهة|Something went wrong/)).toBeTruthy();
      expect(screen.getByText("Synthetic render crash")).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
