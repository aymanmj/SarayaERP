// src/hooks/useNursingWebSocket.ts
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { getSocketUrl } from "../utils/socketUrl";
import { useAuthStore } from "../stores/authStore";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface NursingUpdate {
  type: string;

  data: any;
  timestamp: string;
}

interface PatientAlert {
  type: "CRITICAL" | "WARNING" | "INFO";
  vitalSignId?: number;
  encounterId: number;
  patientName: string;
  message: string;
  timestamp: string;
}

interface MedicationUpdate {
  type: "administered" | "not_given" | "scheduled" | "overdue";
  administrationId?: number;
  encounterId: number;
  medication: string;
  administeredBy?: string;
  status: string;
  timestamp: string;
}

interface VitalsUpdate {
  type: "vitals_updated";
  vitalSignId: number;
  encounterId: number;

  vitals: any;
  nurseName: string;
  timestamp: string;
}

type NursingMessage =
  | { event: "medication_update"; payload: MedicationUpdate }
  | { event: "vitals_update"; payload: VitalsUpdate }
  | { event: "patient_alert"; payload: PatientAlert };

type RecoveryResponse =
  | { cursor: string; hasMore: boolean; messages: NursingMessage[] }
  | { error: "retry" | "invalid_cursor" | "unauthorized" };

function alertKey(alert: PatientAlert) {
  return alert.vitalSignId ?? `${alert.encounterId}:${alert.timestamp}`;
}

function mergeRecent<T extends { timestamp: string }>(
  items: T[],
  update: T,
  key: (value: T) => string | number,
) {
  const id = key(update);
  if (items.some((item) => key(item) === id)) return items;
  return [update, ...items]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 50);
}

export function useNursingWebSocket() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.id);
  const hospitalId = useAuthStore((state) => state.currentBranchId);
  const sessionRevision = useAuthStore((state) => state.sessionRevision);
  const [isConnected, setIsConnected] = useState(false);
  const [alerts, setAlerts] = useState<PatientAlert[]>([]);
  const [medicationUpdates, setMedicationUpdates] = useState<
    MedicationUpdate[]
  >([]);
  const [vitalsUpdates, setVitalsUpdates] = useState<VitalsUpdate[]>([]);
  const [connectedNurses, setConnectedNurses] = useState<string[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const notifiedAlerts = useRef(new Set<string>());
  const recovery = useRef<{
    scope: string;
    cursor: string | null;
    seen: Set<string>;
  }>({
    scope: "",
    cursor: null,
    seen: new Set(),
  });

  useEffect(() => {
    if (!isAuthenticated || !userId || !hospitalId) return;
    const scope = `${userId}:${hospitalId}`;
    if (recovery.current.scope !== scope) {
      recovery.current = { scope, cursor: null, seen: new Set() };
    }
    const wsUrl = getSocketUrl();

    const socket = io(`${wsUrl}/nursing`, {
      auth: { staffScope: { userId, hospitalId } },
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: true, // Important for cookies
    });

    socketRef.current = socket;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    let recoveryGeneration = 0;

    const accept = (id: string) => {
      const { seen } = recovery.current;
      if (seen.has(id)) return false;
      seen.add(id);
      if (seen.size > 512) {
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      return true;
    };
    const mergeAlert = (alert: PatientAlert) => {
      if (accept(`alert:${alertKey(alert)}`))
        setAlerts((items) => mergeRecent(items, alert, alertKey));
    };
    const medicationKey = (item: MedicationUpdate) =>
      item.administrationId ?? `${item.encounterId}:${item.timestamp}`;
    const mergeMedication = (update: MedicationUpdate) => {
      if (accept(`medication:${medicationKey(update)}`))
        setMedicationUpdates((items) =>
          mergeRecent(items, update, medicationKey),
        );
    };
    const mergeVitals = (update: VitalsUpdate) => {
      if (accept(`vital:${update.vitalSignId}`))
        setVitalsUpdates((items) =>
          mergeRecent(items, update, (item) => item.vitalSignId),
        );
    };

    const stopRecovery = () => {
      recoveryGeneration++;
      clearTimeout(recoveryTimer);
    };
    const recover = (generation: number) => {
      if (!socket.connected || generation !== recoveryGeneration) return;
      socket
        .timeout(5000)
        .emit(
          "recover_notifications",
          { after: recovery.current.cursor },
          (error: Error | null, page?: RecoveryResponse) => {
            if (generation !== recoveryGeneration) return;
            if (page && "error" in page && page.error === "unauthorized")
              return;
            let wait = 30000;
            if (!error && page && "messages" in page) {
              for (const message of page.messages) {
                switch (message.event) {
                  case "patient_alert":
                    mergeAlert(message.payload);
                    break;
                  case "medication_update":
                    mergeMedication(message.payload);
                    break;
                  case "vitals_update":
                    mergeVitals(message.payload);
                    break;
                }
              }
              recovery.current.cursor = page.cursor;
              if (page.hasMore) wait = 350;
            }
            recoveryTimer = setTimeout(() => recover(generation), wait);
          },
        );
    };

    const notifyAlert = (alert: PatientAlert) => {
      if (
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      )
        return;
      const key = `${userId}:${hospitalId}:${alert.encounterId}:${alert.timestamp}`;
      const shown = notifiedAlerts.current;
      if (shown.has(key)) return;
      new Notification(`Patient Alert: ${alert.patientName}`, {
        body: alert.message,
        icon: "/alert-icon.png",
        tag: key,
      });
      shown.add(key);
      if (shown.size > 500) {
        const oldest = shown.values().next().value;
        if (oldest !== undefined) shown.delete(oldest);
      }
    };

    // Connection events
    socket.on("connect", () => {
      console.log("✅ Connected to nursing WebSocket");
      setIsConnected(true);
    });

    socket.on("connect_error", (error) => {
      console.error("❌ WebSocket connection error:", error);
      console.error("Error details:", error.message);
      setIsConnected(false);
    });

    socket.on("disconnect", (reason) => {
      console.log("❌ Disconnected from nursing WebSocket:", reason);
      setIsConnected(false);
      stopRecovery();
    });

    // Initial data

    socket.on(
      "initial_data",
      (data: { criticalAlerts: PatientAlert[]; pendingMedications: any[] }) => {
        // Handle initial data
        if (data.criticalAlerts && Array.isArray(data.criticalAlerts)) {
          data.criticalAlerts.forEach(mergeAlert);

          // Notify for critical alerts on load
          data.criticalAlerts
            .filter((alert) => alert.type === "CRITICAL")
            .forEach(notifyAlert);
        }
        stopRecovery();
        recover(recoveryGeneration);

        // Also handle medications if needed
        // setMedicationUpdates(data.pendingMedications...);
      },
    );

    // Real-time updates
    socket.on("patient_alert", (alert: PatientAlert) => {
      mergeAlert(alert);

      // Show browser notification if permission granted
      notifyAlert(alert);
    });

    socket.on("medication_update", (update: MedicationUpdate) => {
      mergeMedication(update);
    });

    socket.on("vitals_update", (update: VitalsUpdate) => {
      mergeVitals(update);
    });

    socket.on("critical_vitals_alert", (alert) => {
      setAlerts((prev) =>
        [
          {
            type: "CRITICAL" as const,
            encounterId: alert.encounterId,
            patientName: alert.patientName,
            message: `Critical values detected: ${alert.criticalValues.join(", ")}`,
            timestamp: alert.timestamp,
          },
          ...prev,
        ].slice(0, 50),
      );
    });

    socket.on("medication_reminder", (reminder) => {
      setMedicationUpdates((prev) =>
        [
          {
            type: "scheduled" as const,
            encounterId: reminder.encounterId,
            medication: "Multiple medications",
            status: "PENDING",
            timestamp: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 50),
      );
    });

    socket.on("nurse_connected", (data) => {
      setConnectedNurses((prev) => [...prev, data.nurseName]);
    });

    socket.on("nurse_disconnected", (data) => {
      setConnectedNurses((prev) =>
        prev.filter((name) => name !== data.nurseName),
      );
    });

    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => {
      stopRecovery();
      socketRef.current = null;
      socket.disconnect();
    };
  }, [isAuthenticated, userId, hospitalId, sessionRevision]);

  // Methods to interact with WebSocket
  const joinWard = (wardId: number) => {
    socketRef.current?.emit("join_ward", { wardId });
  };

  const clearAlerts = () => {
    setAlerts([]);
  };

  const clearMedicationUpdates = () => {
    setMedicationUpdates([]);
  };

  const clearVitalsUpdates = () => {
    setVitalsUpdates([]);
  };

  return {
    isConnected,
    alerts,
    medicationUpdates,
    vitalsUpdates,
    connectedNurses,
    joinWard,
    clearAlerts,
    clearMedicationUpdates,
    clearVitalsUpdates,
  };
}
