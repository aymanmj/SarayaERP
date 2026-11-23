import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PatientGovernanceDialog } from "./PatientGovernanceDialog";
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

describe("PatientGovernanceDialog (CAP06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 20,
        fullName: "Dr. Reviewer",
        username: "dr-rev",
        hospitalId: 1,
        roles: ["DOCTOR"],
        permissions: [
          "patients:view",
          "patients:merge:request",
          "patients:merge:approve",
          "patients:death:record",
          "patients:death:reverse",
        ],
      },
      isAuthenticated: true,
    });
  });

  it("enforces 4-eyes visibility on pending merge approval and allows independent reviewer to approve", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        patient: {
          id: 5,
          mrn: "MRN-005",
          fullName: "Duplicate Patient",
          isActive: true,
          isDeceased: false,
          mergedIntoPatientId: null,
        },
        mergeHistory: [
          {
            id: 77,
            status: "PENDING",
            reason: "Verified duplicate MRN",
            sourcePatientId: 5,
            targetPatientId: 6,
            requestedBy: { id: 10, fullName: "Clerk One" },
            createdAt: "2026-11-24T00:00:00.000Z",
          },
        ],
        deathEvents: [],
      },
    });
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 77, status: "APPROVED" } });
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        patient: {
          id: 5,
          mrn: "MRN-005",
          fullName: "Duplicate Patient",
          isActive: false,
          isDeceased: false,
          mergedIntoPatientId: 6,
        },
        mergeHistory: [],
        deathEvents: [],
      },
    });

    const onUpdated = vi.fn();
    render(
      <PatientGovernanceDialog
        patientId={5}
        patientName="Duplicate Patient"
        patientMrn="MRN-005"
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    );

    const approveBtn = await screen.findByRole("button", { name: /اعتماد الدمج/ });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/patients/governance/merges/77/review",
        { decision: "APPROVE" },
      );
      expect(onUpdated).toHaveBeenCalledTimes(1);
    });
  });

  it("submits death documentation on the Death Management tab", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        patient: {
          id: 8,
          mrn: "MRN-008",
          fullName: "Patient Eight",
          isActive: true,
          isDeceased: false,
          mergedIntoPatientId: null,
        },
        mergeHistory: [],
        deathEvents: [],
      },
    });
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { patient: { id: 8, isDeceased: true } } });
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        patient: {
          id: 8,
          mrn: "MRN-008",
          fullName: "Patient Eight",
          isActive: false,
          isDeceased: true,
          dateOfDeath: "2026-11-23T18:00:00.000Z",
          causeOfDeath: "Cardiopulmonary arrest",
        },
        mergeHistory: [],
        deathEvents: [],
      },
    });

    render(
      <PatientGovernanceDialog
        patientId={8}
        patientName="Patient Eight"
        patientMrn="MRN-008"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );

    await screen.findByText(/حوكمة ملف المريض/);
    fireEvent.click(screen.getByRole("button", { name: /إدارة الوفاة/ }));

    fireEvent.change(screen.getByLabelText(/تاريخ الوفاة/), {
      target: { value: "2026-11-23T18:00" },
    });
    fireEvent.change(screen.getByPlaceholderText(/سبب الوفاة السريري/), {
      target: { value: "Cardiopulmonary arrest" },
    });
    fireEvent.click(screen.getByRole("button", { name: /تأكيد وتوثيق الوفاة/ }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/patients/governance/8/death",
        expect.objectContaining({
          causeOfDeath: "Cardiopulmonary arrest",
        }),
      );
    });
  });
});
