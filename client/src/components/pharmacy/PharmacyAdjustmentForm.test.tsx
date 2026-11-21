import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { PharmacyAdjustmentForm } from "./PharmacyAdjustmentForm";
import { apiClient } from "@/api/apiClient";
const state = vi.hoisted(() => ({ permissions: ["pharmacy:view"] }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, hospitalId: 1 },
    hasPermission: (p: string) => state.permissions.includes(p),
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));
vi.mock("@/api/apiClient", () => ({ apiClient: { post: vi.fn() } }));
const refreshed = vi.fn().mockResolvedValue(undefined);
const open = () =>
  render(
    <PharmacyAdjustmentForm
      products={[{ id: 2, name: "Synthetic drug" }]}
      onPosted={refreshed}
    />,
  );
function fill() {
  fireEvent.change(screen.getByLabelText("Drug"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Existing batch"), {
    target: { value: " A " },
  });
  fireEvent.change(screen.getByLabelText("Quantity change"), {
    target: { value: "-0.500" },
  });
  fireEvent.change(screen.getByLabelText("Adjustment reason"), {
    target: { value: "  Reviewed independently documented variance  " },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.permissions = ["pharmacy:view"];
  vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 7 } });
  refreshed.mockResolvedValue(undefined);
});
afterEach(cleanup);
describe("Controlled pharmacy adjustment form", () => {
  it("does not grant stock adjustment to a general pharmacy operator", () => {
    state.permissions.push("pharmacy:manage");
    open();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/permission is required/)).toBeInTheDocument();
  });
  it("sends an exact signed quantity, batch, reason and operation identity", async () => {
    state.permissions.push("pharmacy:stock:adjust");
    open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Post adjustment" }));
    await screen.findByText("Adjustment posted");
    expect(apiClient.post).toHaveBeenCalledWith(
      "/pharmacy/stock/transactions",
      {
        drugItemId: 2,
        type: "ADJUST",
        quantity: "-0.500",
        batchNumber: "A",
        reason: "Reviewed independently documented variance",
        requestId: expect.any(String),
      },
    );
    expect(refreshed).toHaveBeenCalledTimes(1);
  });
  it("keeps the request identity and prevents editing after an uncertain response", async () => {
    state.permissions.push("pharmacy:stock:adjust");
    vi.mocked(apiClient.post).mockRejectedValueOnce(
      new Error("Synthetic lost response"),
    );
    open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Post adjustment" }));
    await screen.findByText(/Could not confirm adjustment/);
    expect(screen.getByLabelText("Quantity change")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Post adjustment" }));
    await screen.findByText("Adjustment posted");
    const calls = vi.mocked(apiClient.post).mock.calls;
    expect(calls[1]?.[1]).toEqual(calls[0]?.[1]);
    expect(screen.getByLabelText("Quantity change")).not.toBeDisabled();
  });
  it("allows correction of rejected input after a definite client error", async () => {
    state.permissions.push("pharmacy:stock:adjust");
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { message: "Synthetic invalid batch" } },
    });
    open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Post adjustment" }));
    await screen.findByText("Synthetic invalid batch");
    expect(screen.getByLabelText("Existing batch")).not.toBeDisabled();
  });
  it("does not report a failed adjustment when only the list refresh fails", async () => {
    state.permissions.push("pharmacy:stock:adjust");
    refreshed.mockRejectedValueOnce(new Error("Synthetic refresh failure"));
    open();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Post adjustment" }));
    await screen.findByText("Adjustment posted; could not refresh the list");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Post adjustment" }),
      ).toBeDisabled(),
    );
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
});
