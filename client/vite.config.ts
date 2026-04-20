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
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom', 'zustand'],
          'vendor-ui': [
            '@radix-ui/react-label',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-slot',
            'flowbite',
            'lucide-react',
            'recharts'
          ],
          'vendor-utils': ['axios', 'date-fns', '@tanstack/react-query', 'socket.io-client']
        }
      }
    }
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
