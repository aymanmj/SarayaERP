// src/stores/socketStore.ts

import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "./authStore";
import { toast } from "sonner";

interface SocketState {
  socket: Socket | null;
  connect: () => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,

  connect: () => {
    const { token, user } = useAuthStore.getState();
    if (!token || get().socket) return;

    const socket = io("http://localhost:3000", {
      auth: { token: `Bearer ${token}` },
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => {
      console.log("🟢 Connected to Real-time Server");
    });

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
