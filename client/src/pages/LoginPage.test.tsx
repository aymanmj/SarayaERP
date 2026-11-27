import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

const loginMock = vi.fn();

vi.mock("../stores/authStore", () => ({
  useAuthStore: (
    selector: (state: {
      login: typeof loginMock;
      isAuthenticated: boolean;
    }) => unknown,
  ) =>
    selector({
      login: loginMock,
      isAuthenticated: false,
    }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: "ar" },
  }),
}));

describe("LoginPage (TOTP 2FA Challenge)", () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("prompts for 6-digit TOTP code on MFA_REQUIRED and resubmits with mfaCode", async () => {
    loginMock
      .mockRejectedValueOnce({
        response: { status: 401, data: { message: "MFA_REQUIRED" } },
      })
      .mockResolvedValueOnce(undefined);

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText("اسم المستخدم"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    const mfaInput = await screen.findByLabelText("رمز التحقق الثنائي (2FA)");
    fireEvent.change(mfaInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenNthCalledWith(1, "admin", "secret123", undefined);
      expect(loginMock).toHaveBeenNthCalledWith(2, "admin", "secret123", "123456");
    });
  });
});
