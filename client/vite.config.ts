import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (
            id.includes("cornerstone-tools")
          ) {
            return "vendor-dicom-tools";
          }

          if (
            id.includes("cornerstone-wado-image-loader") ||
            id.includes("dicom-parser")
          ) {
            return "vendor-dicom-loader";
          }

          if (
            id.includes("cornerstone-core") ||
            id.includes("cornerstone-math") ||
            id.includes("hammerjs")
          ) {
            return "vendor-dicom-core";
          }

          if (
            id.includes("react") ||
            id.includes("react-dom") ||
            id.includes("react-router-dom") ||
            id.includes("zustand")
          ) {
            return "vendor-react";
          }

          if (
            id.includes("@radix-ui") ||
            id.includes("flowbite") ||
            id.includes("lucide-react") ||
            id.includes("recharts")
          ) {
            return "vendor-ui";
          }

          if (
            id.includes("axios") ||
            id.includes("date-fns") ||
            id.includes("@tanstack/react-query") ||
            id.includes("socket.io-client")
          ) {
            return "vendor-utils";
          }

          return undefined;
        },
      },
    },
  },
  // ✅ هذا الجزء الجديد لحل مشاكل مكتبات الأشعة
  optimizeDeps: {
    include: [
      "cornerstone-core",
      "cornerstone-tools",
      "cornerstone-math",
      "cornerstone-wado-image-loader",
      "dicom-parser",
      "hammerjs",
    ],
  },
  // حل مشكلة استخدام fs في المتصفح لبعض مكتبات DICOM القديمة
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      fs: "memfs",
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ""), // REMOVED: Backend expects /api prefix
      },
    },
  },
});

// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'   // لو مشروعك React
// import tailwindcss from '@tailwindcss/vite'
//
// // https://vitejs.dev/config/
// export default defineConfig({
//   plugins: [
//     react(),
//     tailwindcss(),
//   ],
// })
