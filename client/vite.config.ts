import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
        target: "http://localhost:3000", // Changed from 3000
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
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
