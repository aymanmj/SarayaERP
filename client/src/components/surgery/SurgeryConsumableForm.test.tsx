import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AxiosError } from "axios";
import { SurgeryConsumableForm } from "./SurgeryConsumableForm";
import { apiClient } from "@/api/apiClient";
vi.mock("@/api/apiClient", () => ({ apiClient: { post: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const onPosted = vi.fn();
const view = () =>
  render(
    <SurgeryConsumableForm
      caseId={42}
      products={[
        { id: 2, name: "Supply", type: "SUPPLY" },
        { id: 3, name: "Drug", type: "DRUG" },
      ]}
      onPosted={onPosted}
    />,
  );
const fill = () => {
  fireEvent.change(screen.getByLabelText("المستلزم"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("الكمية"), {
    target: { value: "0.125" },
  });
};
describe("Surgery supply request recovery", () => {
  it("offers supplies only and sends the precise quantity with UUID", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 1 } });
    view();
    expect(
      screen.queryByRole("option", { name: "Drug" }),
    ).not.toBeInTheDocument();
    fill();
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText("تم الصرف وتسجيل رسوم المستهلك بنجاح");
    expect(apiClient.post).toHaveBeenCalledWith(
      "/surgery/cases/42/consumables",
      {
        productId: 2,
        quantity: "0.125",
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    );
    expect(onPosted).toHaveBeenCalledTimes(1);
  });
  it("retains the same frozen request after an uncertain reply", async () => {
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new AxiosError("network"))
      .mockResolvedValueOnce({ data: { id: 1 } });
    view();
    fill();
    fireEvent.click(screen.getByRole("button"));
    const retry = await screen.findByRole("button", {
      name: "إعادة المحاولة بالطلب نفسه",
    });
    expect(screen.getByLabelText("الكمية")).toBeDisabled();
    expect(screen.getByLabelText("المستلزم")).toBeDisabled();
    const original = vi.mocked(apiClient.post).mock.calls[0][1];
    fireEvent.click(retry);
    await screen.findByText("تم الصرف وتسجيل رسوم المستهلك بنجاح");
    expect(vi.mocked(apiClient.post).mock.calls[1][1]).toEqual(original);
    expect(onPosted).toHaveBeenCalledTimes(1);
  });
  it("blocks zero, negative and over-precision quantities", () => {
    view();
    fill();
    for (const quantity of ["0", "-1", "0.0001", "NaN"]) {
      fireEvent.change(screen.getByLabelText("الكمية"), {
        target: { value: quantity },
      });
      fireEvent.click(screen.getByRole("button"));
    }
    expect(apiClient.post).not.toHaveBeenCalled();
  });
  it("prevents concurrent double submission", async () => {
    let resolve: () => void = () => {};
    vi.mocked(apiClient.post).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = () => r({ data: {} });
        }),
    );
    view();
    fill();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.submit(screen.getByRole("button").closest("form")!);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() => expect(onPosted).toHaveBeenCalledTimes(1));
  });
  it("keeps an uncertain request after a later authorization rejection", async () => {
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new AxiosError("network"))
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 403, data: { message: "Denied" } },
      })
      .mockResolvedValueOnce({ data: { id: 1 } });
    view();
    fill();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(
      await screen.findByRole("button", { name: "إعادة المحاولة بالطلب نفسه" }),
    );
    await screen.findByText("Denied");
    expect(screen.getByLabelText("الكمية")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "إعادة المحاولة بالطلب نفسه" }),
    );
    await screen.findByText("تم الصرف وتسجيل رسوم المستهلك بنجاح");
    expect(vi.mocked(apiClient.post).mock.calls[2][1]).toEqual(
      vi.mocked(apiClient.post).mock.calls[0][1],
    );
  });
  it("does not report a committed dispense as failed when refresh throws", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 1 } });
    onPosted.mockImplementationOnce(() => {
      throw new Error("refresh failed");
    });
    view();
    fill();
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText(
      "تم الصرف؛تعذر تحديث العرض. حدّث بيانات العملية دون إعادة الصرف",
    );
    expect(
      screen.queryByRole("button", { name: "إعادة المحاولة بالطلب نفسه" }),
    ).not.toBeInTheDocument();
  });
});
