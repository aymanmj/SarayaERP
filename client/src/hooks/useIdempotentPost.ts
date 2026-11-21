import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { apiClient } from "@/api/apiClient";
type Pending = { url: string; body: Record<string, unknown>; scope: string };

function createRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // The local HTTP deployment can use getRandomValues even without randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export function useIdempotentPost(
  scope: string,
  onPendingChange?: (hasPending: boolean) => void,
) {
  const ref = useRef<Pending | null>(null);
  const flight = useRef(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const hasPending = pending !== null;
  useEffect(() => {
    onPendingChange?.(hasPending);
  }, [hasPending, onPendingChange]);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);
  async function submit(url: string, body: Record<string, unknown>) {
    if (flight.current) throw new Error("طلب آخر قيد التنفيذ");
    const previous = ref.current;
    if (previous && (previous.url !== url || previous.scope !== scope))
      throw new Error("يلزم حسم نتيجة الطلب السابق قبل إجراء آخر");
    const request = previous ?? {
      url,
      body: { ...body, requestId: createRequestId() },
      scope,
    };
    ref.current = request;
    setPending(request);
    flight.current = true;
    setBusy(true);
    try {
      const result = await apiClient.post(request.url, request.body);
      ref.current = null;
      setPending(null);
      return result;
    } catch (error: unknown) {
      if (
        !previous &&
        isAxiosError(error) &&
        error.response &&
        [400, 401, 403, 404, 409, 422].includes(error.response.status)
      ) {
        ref.current = null;
        setPending(null);
      }
      throw error;
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  async function retry() {
    const request = ref.current;
    if (!request) throw new Error("لا يوجد طلب لإعادة المحاولة");
    return submit(request.url, request.body);
  }
  return { pending, busy, submit, retry };
}
