import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConsumptionOperationsPage } from "./ConsumptionOperationsPage";
import { apiClient } from "@/api/apiClient";
const state = vi.hoisted(() => ({
  permissions: ["inventory:view"],
  language: "en",
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, hospitalId: 1 },
    hasPermission: (p: string) => state.permissions.includes(p),
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: state.language } }),
}));
vi.mock("@/api/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  state.permissions = ["inventory:view"];
  state.language = "en";
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  vi.mocked(apiClient.get).mockImplementation(async (url)=>({data:String(url).endsWith('source-policy')?{warehouseId:null}:String(url).endsWith('warehouses')?[{id:1,name:'Synthetic source'},{id:2,name:'Another source'}]:{items:[{id:7,serviceItemId:4,referenceType:'LAB_ORDER',referenceId:9,warehouseId:1,status:'FAILED',attempts:10,nextRetryAt:new Date().toISOString(),error:'SERVICE_MATERIAL_CONSUMPTION_FAILED'}],nextCursor:null}}));
vi.mocked(apiClient.put).mockResolvedValue({data:{warehouseId:2}});
  vi.mocked(apiClient.post).mockResolvedValue({ data: { status: "PENDING" } });
});
afterEach(() => {
  cleanup();
  client.clear();
});
const open = () =>
  render(
    <QueryClientProvider client={client}>
      <ConsumptionOperationsPage />
    </QueryClientProvider>,
  );
describe("Consumption operations controls", () => {
  it('saves an explicit source warehouse with a documented reason',async()=>{
    state.permissions.push('inventory:manage');open();
    const source=await screen.findByLabelText('New source warehouse');
    await screen.findByRole('option',{name:'Another source'});
    fireEvent.change(source,{target:{value:'2'}});
    fireEvent.change(screen.getByLabelText('Configuration reason'),{target:{value:'Approved dedicated consumption warehouse'}});
    fireEvent.click(screen.getByRole('button',{name:'Save source warehouse'}));
    await waitFor(()=>expect(apiClient.put).toHaveBeenCalledWith('/inventory/consumption-operations/source-policy',{warehouseId:2,reason:'Approved dedicated consumption warehouse'}));
  });
  it("keeps viewers read only and shows exhausted retries", async () => {
    open();
    await screen.findByText("Automatic retries exhausted");
    expect(
      screen.queryByRole("button", { name: "Reschedule" }),
    ).not.toBeInTheDocument();
  });
  it("requires a reason and posts only a reschedule request", async () => {
    state.permissions.push("inventory:manage");
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
    const button = screen.getByRole("button", { name: "Confirm reschedule" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Retry reason/), {
      target: { value: "Reviewed and fixed source stock" },
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/inventory/consumption-operations/7/retry",
        { reason: "Reviewed and fixed source stock" },
      ),
    );
  });
  it("does not query data without view permission", () => {
    state.permissions = [];
    open();
    expect(screen.getByRole("alert")).toHaveTextContent("permission");
    expect(apiClient.get).not.toHaveBeenCalled();
  });
  it("renders Arabic operation labels", async () => {
    state.language = "ar";
    open();
    await screen.findByText("توقفت المحاولات التلقائية");
    expect(screen.getByRole("heading",{level:1})).toHaveTextContent(
      "متابعة استهلاك مواد الخدمات",
    );
  });
});
