// src/stores/socketStore.ts

import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "./authStore";
import { toast } from "sonner";
import { getSocketUrl } from "../utils/socketUrl";

interface SocketState {
  socket: Socket | null;
  connect: () => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,

  connect: () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token, user } = useAuthStore.getState();
    if (!token || get().socket) return;

    // Use automatic URL detection - works in any environment
    const wsUrl = getSocketUrl();
    console.log('🔌 Connecting to socket at:', wsUrl);

    const socket = io(wsUrl, {
      auth: { token: `Bearer ${token}` },
      reconnectionAttempts: 5,
      withCredentials: true,
    });

    socket.on("connect", () => {
      console.log("🟢 Connected to Real-time Server");
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on("notification", (data: any) => {
      // عرض الإشعار اللحظي
      // data = { title, message, type, link }

      const sound = new Audio("/notification.mp3"); // (تأكد من وضع ملف صوتي في public)
      sound.play().catch(() => {}); // تشغيل صوت خفيف

      if (data.type === "WARNING") {
        toast.warning(data.message, {
          description: data.title,
          action: data.link
            ? {
                label: "عرض",
                onClick: () => (window.location.href = data.link),
              }
            : undefined,
        });
      } else {
        toast.info(data.message, {
          description: data.title,
          action: data.link
            ? {
                label: "عرض",
                onClick: () => (window.location.href = data.link),
              }
            : undefined,
        });
      }
    });

    set({ socket });
  },

  disconnect: () => {
    const socket = get().socket;
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },
}));
