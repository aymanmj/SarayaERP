import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MainLayout } from "./MainLayout";

const { authState, licenseState, socketState } = vi.hoisted(() => ({
  authState: {
    user: {
      id: 10,
      fullName: "د. هناء سالم",
      roles: ["DOCTOR"],
      permissions: ["obgyn:view", "obgyn:manage", "clinical:encounters:view"],
    },
    logout: vi.fn(),
    accessibleBranches: [],
    currentBranchId: 1,
    switchBranch: vi.fn(),
    isSwitchingBranch: false,
  },
  licenseState: {
    fetchLicenseStatus: vi.fn(),
    isModuleEnabled: (mod: string) => mod.toUpperCase() === "OBGYN",
    details: null,
    licenseState: "active",
    features: ["OBGYN"],
  },
  socketState: {
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock("../stores/authStore", () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));
vi.mock("../stores/licenseStore", () => ({
  useLicenseStore: (selector: (s: typeof licenseState) => unknown) => selector(licenseState),
}));
vi.mock("../stores/socketStore", () => ({
  useSocketStore: () => socketState,
}));
vi.mock("../components/NotificationBell", () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));
vi.mock("../components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
    i18n: { language: "ar" },
  }),
}));

describe("MainLayout OB-GYN navigation and theme switcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows dedicated OB-GYN & Fertility section with all 4 routes for authorized OB-GYN doctors and mounts ThemeSwitcher", () => {
    render(
      <MemoryRouter initialEntries={["/obgyn/anc"]}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/obgyn/anc" element={<div>ANC Workspace</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("theme-switcher-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("menu-section-obgyn")).toBeInTheDocument();

    expect(screen.getByText("متابعة الحمل (ANC)").closest("a")).toHaveAttribute(
      "href",
      "/obgyn/anc",
    );
    expect(screen.getByText("تسجيل ولادة (OB/GYN)").closest("a")).toHaveAttribute(
      "href",
      "/obgyn/deliveries/new",
    );
    expect(screen.getByText("الحقن المجهري (IVF)").closest("a")).toHaveAttribute(
      "href",
      "/obgyn/fertility",
    );
    expect(screen.getByText("أمراض الذكورة والعقم").closest("a")).toHaveAttribute(
      "href",
      "/andrology",
    );

    fireEvent.click(screen.getByTestId("theme-switcher-trigger"));
    expect(screen.getByTestId("theme-option-clinical-emerald")).toBeInTheDocument();
  });
});
