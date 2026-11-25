import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StaffCredentialsModal } from "./StaffCredentialsModal";
import { apiClient } from "../../api/apiClient";
import { useAuthStore } from "../../stores/authStore";

vi.mock("../../api/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("StaffCredentialsModal (CAP12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 30,
        fullName: "Medical Director",
        username: "med-dir",
        hospitalId: 1,
        roles: ["ADMIN"],
        permissions: [
          "hr:credentials:view",
          "hr:credentials:manage",
          "hr:credentials:verify",
        ],
      },
      isAuthenticated: true,
    });
  });

  it("displays practice license & disease-free health certificate alerts and lets independent verifier approve pending credential", async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === "/hr/credentials/alerts") {
        return {
          data: {
            summary: {
              expiredCount: 1,
              expiringSoonCount: 2,
              suspendedOrRevokedCount: 0,
              pendingVerificationCount: 1,
              practiceLicenseAlerts: 1,
              healthCertificateAlerts: 2,
            },
          },
        };
      }
      return {
        data: [
          {
            id: 51,
            userId: 12,
            createdById: 10,
            staffCategory: "ALLIED_HEALTH",
            credentialType: "HEALTH_CERTIFICATE",
            title: "الشهادة الصحية (الخلو من الأمراض)",
            licenseNumber: "HC-2026-777",
            issuingAuthority: "المركز الوطني لمكافحة الأمراض",
            issueDate: "2026-06-01T00:00:00.000Z",
            expiryDate: "2026-12-15T00:00:00.000Z",
            status: "PENDING_VERIFICATION",
            complianceStatus: "PENDING_VERIFICATION",
            daysUntilExpiry: 21,
            documentRef: "enc-v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef:1/credentials/51/doc.pdf",
            user: { id: 12, fullName: "Nurse Sara" },
          },
        ],
      };
    });
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 51, status: "ACTIVE" } });

    render(
      <StaffCredentialsModal
        staffOptions={[{ id: 12, fullName: "Nurse Sara" }]}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText(/HC-2026-777/)).toBeInTheDocument();
    const verifyBtn = screen.getByRole("button", { name: /اعتماد/ });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/hr/credentials/51/verify",
        {},
      );
    });

    expect(
      screen.getByRole("button", { name: /تنزيل الوثيقة/ }),
    ).toBeInTheDocument();

    const fileInput = screen.getByLabelText("إرفاق وثيقة HC-2026-777");
    const pdfFile = new File(["%PDF-1.4 sample"], "health-cert.pdf", {
      type: "application/pdf",
    });
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 51 } });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/hr/credentials/51/document",
        expect.any(FormData),
        expect.objectContaining({
          headers: { "Content-Type": "multipart/form-data" },
        }),
      );
    });
  });
});
