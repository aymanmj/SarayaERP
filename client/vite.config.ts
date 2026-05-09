import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",

      // ============================================
      // Workbox Configuration (Offline-First)
      // ============================================
      workbox: {
        // Cache all static assets during install
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff,woff2,ttf}"],
        maximumFileSizeToCacheInBytes: 5000000,

        // Offline navigation fallback — عند محاولة فتح صفحة بدون شبكة
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],

        // Runtime Caching Strategies for API and external resources
        runtimeCaching: [
          {
            // API calls are never cached; stale clinical data is worse than a clear failure.
            urlPattern: /^https?:\/\/[^/]+\/api\/.*/i,
            handler: "NetworkOnly",
          },
          {
            // 📸 Static assets (images, fonts): Cache-first — سريع ودائم
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf|eot)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "saraya-static-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 يوم
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // 🔤 Google Fonts — Cache-first
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "saraya-fonts-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // سنة
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },

      // ============================================
      // PWA Manifest (Desktop App Experience)
      // ============================================
      manifest: {
        name: "نظام السرايا الطبي — Saraya Medical ERP",
        short_name: "السرايا الطبي",
        description: "نظام إدارة المستشفيات والمنشآت الصحية — Enterprise Medical ERP",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        dir: "rtl",
        lang: "ar",
        categories: ["medical", "business", "productivity"],
        icons: [
          {
            src: "/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icon-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      // ============================================
      // Development Options
      // ============================================
      devOptions: {
        enabled: false, // يُفعّل فقط عند الاختبار: enabled: true
      },
    }),
  ],
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (
            id.includes("react/") || 
            id.includes("react-dom/") || 
            id.includes("react-router-dom") ||
            id.includes("zustand")
          ) {
            return "vendor-react";
          }

          if (id.includes("lucide-react") || id.includes("date-fns")) {
            return "vendor-ui";
          }

          if (id.includes("cornerstone-tools")) {
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
