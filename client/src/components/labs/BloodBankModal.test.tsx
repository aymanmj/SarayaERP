import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BloodBankModal } from "./BloodBankModal";
import { apiClient } from "../../api/apiClient";

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
  },
}));

describe("BloodBankModal (CAP04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === "/blood-bank/inventory") {
        return {
          data: {
            units: [
              {
                id: 11,
                unitNumber: "ISBT-2026-0001",
                componentType: "PRBC",
                bloodGroup: "O-",
                volumeMl: 350,
                donorReference: "DON-1",
                collectedAt: "2026-11-22T00:00:00.000Z",
                expiresAt: "2026-12-27T00:00:00.000Z",
                storageLocation: "FRIDGE-A1",
                screeningStatus: "PENDING",
                status: "QUARANTINED",
              },
            ],
            summary: {
              totalUnits: 1,
              availableUnits: 0,
              expiringSoonUnits: 0,
              expiredAvailableUnits: 0,
              quarantinedUnits: 1,
              crossmatchedUnits: 0,
              issuedUnits: 0,
            },
          },
        } as never;
      }
      if (url === "/blood-bank/crossmatches") {
        return {
          data: [
            {
              id: 21,
              patientBloodGroup: "O-",
              antibodyScreen: "NEGATIVE",
              crossmatchResult: "COMPATIBLE",
              status: "ACTIVE",
              validUntil: "2026-11-27T00:00:00.000Z",
              verifiedById: null,
              patient: { id: 5, fullName: "سالم عمر", mrn: "MRN-1001" },
              bloodUnit: {
                id: 11,
                unitNumber: "ISBT-2026-0001",
                componentType: "PRBC",
                bloodGroup: "O-",
              },
            },
          ],
        } as never;
      }
      if (url === "/blood-bank/transfusions") {
        return {
          data: [
            {
              id: 31,
              status: "STOPPED_REACTION",
              bedsideVerifier1Id: 2,
              bedsideVerifier2Id: 3,
              hasReaction: true,
              reactionType: "FEBRILE_NON_HEMOLYTIC",
              reactionSeverity: "MODERATE",
              patient: { id: 5, fullName: "سالم عمر", mrn: "MRN-1001" },
              bloodUnit: {
                id: 11,
                unitNumber: "ISBT-2026-0001",
                componentType: "PRBC",
                bloodGroup: "O-",
              },
              clinicalIncident: {
                id: 99,
                incidentNumber: "HEMO-2026-31-1001",
                severity: "MODERATE",
              },
            },
          ],
        } as never;
      }
      return { data: [] } as never;
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { ok: true } } as never);
  });

  it("renders quarantined blood units and clears serology screening", async () => {
    render(<BloodBankModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("ISBT-2026-0001")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "إجازة الفحص المصلي" }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/blood-bank/units/11/screen",
        expect.objectContaining({ screeningStatus: "CLEARED" }),
      );
    });
  });

  it("supports 4-eyes crossmatch verification and displays linked hemovigilance incidents", async () => {
    render(<BloodBankModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/التوافق \(1\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /التوافق \(1\)/ }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "اعتماد التوافق (4 عيون)" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "اعتماد التوافق (4 عيون)" }),
    );
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/blood-bank/crossmatches/21/verify",
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: /نقل الدم واليقظة \(1\)/ }),
    );
    await waitFor(() => {
      expect(screen.getByText(/HEMO-2026-31-1001/)).toBeInTheDocument();
    });
  });
});
