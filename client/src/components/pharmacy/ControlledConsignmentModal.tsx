import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { Money } from "../../utils/money";

type ControlledLogRow = {
  id: number;
  batchNumber: string;
  transactionType: string;
  quantityBefore: string;
  quantityChange: string;
  quantityAfter: string;
  wastedQuantity: string;
  reason: string;
  entryHash: string;
  createdAt: string;
  product?: { id: number; code: string; name: string; controlledSchedule?: string | null };
  warehouse?: { id: number; name: string };
  performedBy?: { id: number; fullName: string };
  witnessedBy?: { id: number; fullName: string };
};

type ConsignmentRow = {
  id: number;
  batchNumber: string;
  serialNumber?: string | null;
  quantityReceived: string;
  quantityConsumed: string;
  quantityReturned: string;
  quantityRemaining: string;
  agreedUnitPrice: string;
  status: string;
  supplier?: { id: number; name: string };
  product?: { id: number; code: string; name: string };
};

type WardReturnRow = {
  id: number;
  batchNumber?: string | null;
  quantity: string;
  reason: string;
  sealIntact: boolean;
  coldChainMaintained: boolean;
  status: "PENDING_PHARMACIST" | "APPROVED_RESTOCKED" | "REJECTED_DESTROY";
  product?: { id: number; code: string; name: string };
  warehouse?: { id: number; name: string };
  requestedBy?: { id: number; fullName: string };
  reviewedBy?: { id: number; fullName: string } | null;
};

interface Props {
  onClose: () => void;
}

export function ControlledConsignmentModal({ onClose }: Props) {
  const [tab, setTab] = useState<"CONTROLLED" | "CONSIGNMENT" | "WARD_RETURNS">(
    "CONTROLLED",
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [controlledLogs, setControlledLogs] = useState<ControlledLogRow[]>([]);
  const [consignments, setConsignments] = useState<ConsignmentRow[]>([]);
  const [wardReturns, setWardReturns] = useState<WardReturnRow[]>([]);

  // Quick controlled substance form
  const [ctrlWarehouseId, setCtrlWarehouseId] = useState("1");
  const [ctrlProductId, setCtrlProductId] = useState("");
  const [ctrlBatch, setCtrlBatch] = useState("");
  const [ctrlType, setCtrlType] = useState<
    "RECEIPT" | "DISPENSE" | "WASTE" | "RETURN" | "SHIFT_COUNT"
  >("DISPENSE");
  const [ctrlQty, setCtrlQty] = useState("1");
  const [ctrlWaste, setCtrlWaste] = useState("0");
  const [ctrlWitnessId, setCtrlWitnessId] = useState("");
  const [ctrlPatientId, setCtrlPatientId] = useState("");
  const [ctrlReason, setCtrlReason] = useState("");

  // Quick consignment consume inputs
  const [consumeEncInputs, setConsumeEncInputs] = useState<
    Record<number, string>
  >({});
  const [consumeQtyInputs, setConsumeQtyInputs] = useState<
    Record<number, string>
  >({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, conRes, wrRes] = await Promise.all([
        apiClient.get<ControlledLogRow[]>("/inventory/governance/controlled-logs"),
        apiClient.get<ConsignmentRow[]>("/inventory/governance/consignments"),
        apiClient.get<WardReturnRow[]>("/inventory/governance/ward-returns"),
      ]);
      setControlledLogs(Array.isArray(cRes.data) ? cRes.data : []);
      setConsignments(Array.isArray(conRes.data) ? conRes.data : []);
      setWardReturns(Array.isArray(wrRes.data) ? wrRes.data : []);
    } catch {
      toast.error("فشل تحميل سجلات المخدّرات والأمانة ومرتجع العنابر.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleRecordControlled = async () => {
    if (!ctrlProductId || !ctrlBatch.trim() || !ctrlWitnessId || ctrlReason.trim().length < 3) {
      toast.error("يرجى تعبئة الصنف والتشغيلة ومعرّف الشاهد المستقل والسبب.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post("/inventory/governance/controlled-logs", {
        warehouseId: Number(ctrlWarehouseId),
        productId: Number(ctrlProductId),
        batchNumber: ctrlBatch.trim(),
        transactionType: ctrlType,
        quantity: Number(ctrlQty) || 0,
        wastedQuantity: Number(ctrlWaste) || 0,
        witnessedById: Number(ctrlWitnessId),
        ...(ctrlPatientId ? { patientId: Number(ctrlPatientId) } : {}),
        reason: ctrlReason.trim(),
      });
      toast.success("تم تسجيل حركة الدواء المقيّد بتوقيع ثنائي وسلسلة SHA-256.");
      setCtrlReason("");
      await loadAll();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "فشل تسجيل الحركة المقيّدة.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleConsumeConsignment = async (receiptId: number) => {
    const encId = Number(consumeEncInputs[receiptId]);
    const qty = Number(consumeQtyInputs[receiptId] || "1");
    if (!encId || qty <= 0) {
      toast.error("أدخل رقم الزيارة والكمية المستهلكة.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(
        `/inventory/governance/consignments/${receiptId}/consume`,
        { encounterId: encId, quantity: qty },
      );
      toast.success("تم تسجيل استهلاك مستلزم الأمانة واحتساب استحقاق المورد بدقة Money.");
      await loadAll();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "فشل استهلاك الأمانة.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleReviewWardReturn = async (
    returnId: number,
    decision: "APPROVE_RESTOCK" | "REJECT_DESTROY",
  ) => {
    setBusy(true);
    try {
      await apiClient.post(
        `/inventory/governance/ward-returns/${returnId}/review`,
        {
          decision,
          reviewNotes:
            decision === "APPROVE_RESTOCK"
              ? "تمت مراجعة الختم وسلسلة التبريد وإعادة التخزين."
              : "رُفضت الإعادة للمخزون وحُوِّلت للإتلاف.",
        },
      );
      toast.success(
        decision === "APPROVE_RESTOCK"
          ? "تم اعتماد المرتجع وإعادة إضافته للمخزون ذريًا."
          : "تم رفض المرتجع وتوجيهه للإتلاف.",
      );
      await loadAll();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "فشل البت في مرتجع العنبر.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="سجل المخدرات والأمانة ومرتجع العنابر"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-6 text-slate-100 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-amber-300">
              🔐 حوكمة المخدّرات والمقيّدات والأمانة ومرتجع العنابر (CAP10)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              سجل المخدّرات برقابة 4 عيون وسلسلة SHA-256، دورة مستلزمات الأمانة، واعتماد مرتجع العنابر من الصيدلي.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs"
          >
            إغلاق
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setTab("CONTROLLED")}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${
              tab === "CONTROLLED"
                ? "bg-amber-600 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            1. سجل المخدّرات والمقيّدات ({controlledLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("CONSIGNMENT")}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${
              tab === "CONSIGNMENT"
                ? "bg-sky-600 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            2. مستلزمات الأمانة ({consignments.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("WARD_RETURNS")}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${
              tab === "WARD_RETURNS"
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            3. مرتجع العنابر ({wardReturns.length})
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-400 text-sm">
            جاري التحميل...
          </div>
        ) : (
          <>
            {tab === "CONTROLLED" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs">
                  <select
                    aria-label="نوع الحركة المقيّدة"
                    value={ctrlType}
                    onChange={(e) =>
                      setCtrlType(
                        e.target.value as
                          | "RECEIPT"
                          | "DISPENSE"
                          | "WASTE"
                          | "RETURN"
                          | "SHIFT_COUNT",
                      )
                    }
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2"
                  >
                    <option value="RECEIPT">استلام خزنة (RECEIPT)</option>
                    <option value="DISPENSE">صرف لمريض (DISPENSE)</option>
                    <option value="WASTE">إتلاف فائض بشاهد (WASTE)</option>
                    <option value="RETURN">إرجاع للخزنة (RETURN)</option>
                    <option value="SHIFT_COUNT">جرد تسليم وردية</option>
                  </select>
                  <input
                    type="number"
                    placeholder="معرّف المخزن"
                    value={ctrlWarehouseId}
                    onChange={(e) => setCtrlWarehouseId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2"
                  />
                  <input
                    type="number"
                    placeholder="معرّف الدواء المقيّد"
                    value={ctrlProductId}
                    onChange={(e) => setCtrlProductId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2"
                  />
                  <input
                    type="text"
                    placeholder="رقم التشغيلة"
                    value={ctrlBatch}
                    onChange={(e) => setCtrlBatch(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2"
                  />
                  <input
                    type="number"
                    step="0.001"
                    placeholder="الكمية"
                    value={ctrlQty}
                    onChange={(e) => setCtrlQty(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2"
                  />
                  <input
                    type="number"
                    step="0.001"
                    placeholder="الكمية المتلفة (Waste)"
                    value={ctrlWaste}
                    onChange={(e) => setCtrlWaste(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2"
                  />
                  <input
                    type="number"
                    placeholder="معرّف الشاهد المستقل (4 عيون)"
                    value={ctrlWitnessId}
                    onChange={(e) => setCtrlWitnessId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2"
                  />
                  <input
                    type="number"
                    placeholder="معرّف المريض (للصرف)"
                    value={ctrlPatientId}
                    onChange={(e) => setCtrlPatientId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2"
                  />
                  <input
                    type="text"
                    placeholder="السبب والتبرير السريري..."
                    value={ctrlReason}
                    onChange={(e) => setCtrlReason(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 col-span-2 md:col-span-3"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleRecordControlled}
                    className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold"
                  >
                    تسجيل بتوقيع ثنائي
                  </button>
                </div>

                <div className="space-y-2">
                  {controlledLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 text-xs space-y-1"
                    >
                      <div className="flex justify-between font-bold">
                        <span className="text-amber-300">
                          [{log.transactionType}] {log.product?.name ?? `#${log.id}`} (تشغيلة {log.batchNumber})
                        </span>
                        <span className="font-mono text-emerald-300">
                          الرصيد: {log.quantityBefore} → {log.quantityAfter}
                        </span>
                      </div>
                      <div className="text-slate-400">
                        المُنفِّذ: {log.performedBy?.fullName ?? "—"} • الشاهد (4 عيون):{" "}
                        {log.witnessedBy?.fullName ?? "—"} • الفائض المتلف: {log.wastedQuantity}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">
                        SHA-256: {log.entryHash.slice(0, 28)}…
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "CONSIGNMENT" && (
              <div className="space-y-3">
                {consignments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 text-xs space-y-2"
                  >
                    <div className="flex flex-wrap justify-between gap-2 font-bold">
                      <span className="text-sky-300">
                        {c.product?.name ?? "مستلزم أمانة"} — المورد: {c.supplier?.name ?? "—"} (تشغيلة {c.batchNumber})
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300">
                        المتبقي: {c.quantityRemaining} / {c.quantityReceived} • السعر:{" "}
                        {Money.toFixed(c.agreedUnitPrice)} LYD
                      </span>
                    </div>
                    {Number(c.quantityRemaining) > 0 && (
                      <div className="flex flex-wrap gap-2 items-center pt-1">
                        <input
                          type="number"
                          placeholder="رقم الزيارة (Encounter ID)"
                          value={consumeEncInputs[c.id] ?? ""}
                          onChange={(e) =>
                            setConsumeEncInputs((prev) => ({
                              ...prev,
                              [c.id]: e.target.value,
                            }))
                          }
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 w-48"
                        />
                        <input
                          type="number"
                          step="0.001"
                          placeholder="الكمية"
                          value={consumeQtyInputs[c.id] ?? "1"}
                          onChange={(e) =>
                            setConsumeQtyInputs((prev) => ({
                              ...prev,
                              [c.id]: e.target.value,
                            }))
                          }
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 w-28"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleConsumeConsignment(c.id)}
                          className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold"
                        >
                          تسجيل استهلاك لمريض
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {consignments.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    لا توجد إيصالات أمانة مسجّلة حاليًا.
                  </div>
                )}
              </div>
            )}

            {tab === "WARD_RETURNS" && (
              <div className="space-y-3">
                {wardReturns.map((wr) => (
                  <div
                    key={wr.id}
                    className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 text-xs space-y-2"
                  >
                    <div className="flex flex-wrap justify-between gap-2 font-bold">
                      <span className="text-emerald-300">
                        {wr.product?.name ?? "صنف"} × {wr.quantity} — {wr.reason}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                        {wr.status}
                      </span>
                    </div>
                    <div className="text-slate-400">
                      الختم سليم: {wr.sealIntact ? "✅ نعم" : "❌ لا"} • سلسلة التبريد:{" "}
                      {wr.coldChainMaintained ? "✅ محفوظة" : "❌ منقطعة"} • مقدم الطلب:{" "}
                      {wr.requestedBy?.fullName ?? "—"}
                    </div>
                    {wr.status === "PENDING_PHARMACIST" && (
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            handleReviewWardReturn(wr.id, "APPROVE_RESTOCK")
                          }
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                        >
                          اعتماد وإعادة للمخزون (4 عيون)
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            handleReviewWardReturn(wr.id, "REJECT_DESTROY")
                          }
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
                        >
                          رفض وتحويل للإتلاف
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {wardReturns.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    لا توجد طلبات مرتجع عنابر حاليًا.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
