import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNursingWebSocket } from "./useNursingWebSocket";

const { auth, handlers, emit, io } = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: { id: 5 },
    currentBranchId: 3,
    sessionRevision: 0,
  },
  handlers: new Map<string, (event: unknown) => void>(),
  emit: vi.fn(),
  io: vi.fn(),
}));
vi.mock("../stores/authStore", () => ({
  useAuthStore: (select: (state: typeof auth) => unknown) => select(auth),
}));
vi.mock("socket.io-client", () => ({
  io: io.mockImplementation(() => ({
    on: (event: string, handler: (event: unknown) => void) =>
      handlers.set(event, handler),
    connected: true,
    timeout: () => ({ emit }),
    disconnect: vi.fn(),
  })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  emit.mockReset();
  io.mockClear();
  handlers.clear();
  auth.sessionRevision = 0;
});

it("enables HTTP polling if the WebSocket transport is unavailable", () => {
  const hook = renderHook(() => useNursingWebSocket());
  expect(io).toHaveBeenCalledWith(
    expect.stringMatching(/\/nursing$/),
    expect.objectContaining({
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      withCredentials: true,
    }),
  );
  hook.unmount();
});

it("does not announce the same critical measurement again after renewal", () => {
  const notification = Object.assign(
    vi.fn(function () {}),
    { permission: "granted" },
  );
  vi.stubGlobal("Notification", notification);
  const hook = renderHook(() => useNursingWebSocket());
  const alert = {
    type: "CRITICAL",
    encounterId: 11,
    patientName: "Synthetic patient",
    message: "Synthetic measurement",
    timestamp: "2026-11-18T00:00:00.000Z",
  };
  act(() => handlers.get("patient_alert")?.(alert));
  auth.sessionRevision++;
  hook.rerender();
  act(() => handlers.get("initial_data")?.({ criticalAlerts: [alert] }));
  expect(notification).toHaveBeenCalledTimes(1);
  act(() =>
    handlers.get("patient_alert")?.({
      ...alert,
      timestamp: "2026-11-18T00:01:00.000Z",
    }),
  );
  expect(notification).toHaveBeenCalledTimes(2);
  hook.unmount();
});

it("replays from the last scanned cursor and merges live and recovered records only once", () => {
  const hook = renderHook(() => useNursingWebSocket());
  const medication = {
    type: "administered",
    status: "GIVEN",
    administrationId: 9,
    encounterId: 11,
    medication: "Synthetic medication",
    timestamp: "2026-11-18T00:02:00.000Z",
  };
  const page = (cursor: string) => ({
    cursor,
    hasMore: false,
    messages: [{ event: "medication_update", payload: medication }],
  });
  emit.mockImplementationOnce(
    (_event, _data, ack: (error: null, response: unknown) => void) =>
      ack(null, page("300")),
  );
  act(() => handlers.get("medication_update")?.(medication));
  act(() => handlers.get("initial_data")?.({ criticalAlerts: [] }));
  expect(emit.mock.calls[0]?.slice(0, 2)).toEqual([
    "recover_notifications",
    { after: null },
  ]);
  expect(hook.result.current.medicationUpdates).toEqual([medication]);
  act(() => hook.result.current.clearMedicationUpdates());
  auth.sessionRevision++;
  hook.rerender();
  emit.mockImplementationOnce(
    (_event, _data, ack: (error: null, response: unknown) => void) =>
      ack(null, page("301")),
  );
  act(() => handlers.get("initial_data")?.({ criticalAlerts: [] }));
  expect(emit.mock.calls[1]?.slice(0, 2)).toEqual([
    "recover_notifications",
    { after: "300" },
  ]);
  expect(hook.result.current.medicationUpdates).toEqual([]);
  hook.unmount();
});
