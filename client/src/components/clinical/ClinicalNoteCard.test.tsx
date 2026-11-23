import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ClinicalNoteCard, type ClinicalNoteRecord } from "./ClinicalNoteCard";
import { apiClient } from "../../api/apiClient";

vi.mock("../../api/apiClient", () => ({
  apiClient: {
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("ClinicalNoteCard (CAP07)", () => {
  const onChanged = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows author to edit and sign an unsigned draft", async () => {
    const draft: ClinicalNoteRecord = {
      id: 101,
      type: "DOCTOR_ROUND",
      content: "Initial clinical progress note",
      createdById: 10,
      createdBy: { id: 10, fullName: "Dr. Author" },
      createdAt: "2026-11-23T18:00:00.000Z",
    };

    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 101 } });

    render(
      <ClinicalNoteCard
        note={draft}
        encounterId={55}
        currentUserId={10}
        canManageNotes={true}
        canCoSignNotes={true}
        onChanged={onChanged}
      />,
    );

    expect(screen.getByText(/مسودة غير موقّعة/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تعديل المسودة/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /توقيع إلكتروني وقفل/ }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/clinical-notes/101/sign", {});
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });

  it("hides Co-Sign from the signing physician (4-eyes) and shows it to an independent consultant with addendum + integrity verify", async () => {
    const signedNote: ClinicalNoteRecord = {
      id: 202,
      type: "CONSULTATION",
      subjective: "Fever subsided",
      assessment: "Improving viral illness",
      createdById: 10,
      createdBy: { id: 10, fullName: "Dr. Author" },
      signedById: 10,
      signedBy: { id: 10, fullName: "Dr. Author" },
      signedAt: "2026-11-23T19:00:00.000Z",
      signatureHash: "a".repeat(64),
      createdAt: "2026-11-23T18:30:00.000Z",
      appendages: [],
    };

    // Same doctor who signed must NOT see Co-Sign button or Edit Draft
    const { rerender } = render(
      <ClinicalNoteCard
        note={signedNote}
        encounterId={55}
        currentUserId={10}
        canManageNotes={true}
        canCoSignNotes={true}
        onChanged={onChanged}
      />,
    );

    expect(screen.queryByRole("button", { name: /تعديل المسودة/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /توقيع مشترك/ })).not.toBeInTheDocument();

    // Independent consultant sees Co-Sign, Addendum, and Verify Integrity
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 202 } });
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { integrityVerified: true, signatureHash: "a".repeat(64) },
    });

    rerender(
      <ClinicalNoteCard
        note={signedNote}
        encounterId={55}
        currentUserId={20}
        canManageNotes={true}
        canCoSignNotes={true}
        onChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /توقيع مشترك/ }));
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/clinical-notes/202/cosign", {});
    });

    fireEvent.click(screen.getByRole("button", { name: /التحقق من السلامة/ }));
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith("/clinical-notes/202/verify");
      expect(screen.getByText(/بصمة SHA-256 سليمة/)).toBeInTheDocument();
    });
  });
});
