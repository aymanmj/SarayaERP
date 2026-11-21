import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./apiClient";

const auth = vi.hoisted(() => ({
  clearSession: vi.fn(), logout: vi.fn(),
  acceptRefreshedSession: vi.fn((branch: number, user: number) => branch === 3 && user === 5),
  user: { id: 5 }, currentBranchId: 3,
}));
vi.mock("../stores/authStore", () => ({ useAuthStore: { getState: () => auth } }));

const adapter = apiClient.defaults.adapter;
function reject(config: InternalAxiosRequestConfig, status: number, message: string): never {
  throw new AxiosError(message, String(status), config, undefined, {
    status, data: { message }, statusText: message, headers: {}, config,
  });
}

afterEach(() => {
  apiClient.defaults.adapter = adapter;
  auth.currentBranchId = 3;
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("staff session retry", () => {
  it("retries with a renewed cookie without receiving a token in the response", async () => {
    let attempts = 0;
    apiClient.defaults.adapter = async (config) => {
      if (config.url === "/auth/refresh") {
        return { status: 200, statusText: "OK", headers: {}, config, data: { userId: 5, hospitalId: 3 } };
      }
      if (++attempts === 1) reject(config, 401, "expired");
      return { status: 200, statusText: "OK", headers: {}, config, data: "ok" };
    };
    expect((await apiClient.get("/staff-example")).data).toBe("ok");
    expect(auth.acceptRefreshedSession).toHaveBeenCalledWith(3, 5);
    expect(attempts).toBe(2);
  });

  it("does not retry a request initiated before the branch changed", async () => {
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      auth.currentBranchId = 4;
      reject(config, 401, "expired");
    });
    apiClient.defaults.adapter = adapter;
    await expect(apiClient.get("/staff-example")).rejects.toMatchObject({ response: { status: 401 } });
    expect(adapter).toHaveBeenCalledOnce();
    expect(auth.clearSession).not.toHaveBeenCalled();
  });
  it("retries the operation once after a concurrent refresh without clearing the session", async () => {
    let attempts = 0;
    apiClient.defaults.adapter = async (config) => {
      if (config.url === "/auth/refresh") reject(config, 409, "AUTH_REFRESH_CONFLICT");
      if (config.url === "/auth/me") return { status: 200, statusText: "OK", headers: {}, config, data: { sub: 5, hospitalId: 3 } };
      if (++attempts === 1) reject(config, 401, "expired");
      return { status: 200, statusText: "OK", headers: {}, config, data: "ok" };
    };
    expect((await apiClient.get("/staff-example")).data).toBe("ok");
    expect(attempts).toBe(2);
    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it("does not replay a failed operation under another branch", async () => {
    const originalAttempt = vi.fn();
    apiClient.defaults.adapter = async (config) => {
      if (config.url === "/auth/refresh") reject(config, 409, "AUTH_REFRESH_CONFLICT");
      if (config.url === "/auth/me") return { status: 200, statusText: "OK", headers: {}, config, data: { sub: 5, hospitalId: 4 } };
      originalAttempt();
      reject(config, 401, "expired");
    };
    await expect(apiClient.get("/staff-example")).rejects.toMatchObject({ response: { status: 409 } });
    expect(originalAttempt).toHaveBeenCalledOnce();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it("clears only local state when the refresh credential is rejected", async () => {
    window.history.replaceState({}, "", "/login");
    apiClient.defaults.adapter = async (config) => {
      reject(config, config.url === "/auth/refresh" ? 403 : 401, "invalid");
    };
    await expect(apiClient.get("/staff-example")).rejects.toMatchObject({ response: { status: 403 } });
    expect(auth.clearSession).toHaveBeenCalledOnce();
    expect(auth.logout).not.toHaveBeenCalled();
  });
});
