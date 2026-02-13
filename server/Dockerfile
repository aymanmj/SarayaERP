# ==========================================
# Saraya ERP - Production Dockerfile (Optimized)
# ==========================================

# ------------------------------------------
# Stage 1: Builder
# ------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# تثبيت أدوات البناء
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# نسخ ملفات التبعيات
COPY package*.json ./
COPY prisma ./prisma/

# تثبيت الكل
RUN npm ci

# نسخ السورس كود
COPY . .

# توليد Prisma Client
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# البناء
RUN npm run build

# تجميع سكربت الـ Seed
RUN npx tsc prisma/seed.ts --outDir dist/prisma --module commonjs --target es2019 --esModuleInterop --skipLibCheck --moduleResolution node

# ------------------------------------------
# Stage 2: Production
# ------------------------------------------
FROM node:20-slim AS production

# تثبيت Tini لإدارة العمليات (يمنع مشاكل الزومبي مع Puppeteer)
# وتثبيت الخطوط العربية (ضروري جداً للفواتير)
RUN apt-get update && apt-get install -y \
    tini \
    chromium \
    libnss3 \
    libfreetype6 \
    libharfbuzz0b \
    ca-certificates \
    fonts-freefont-ttf \
    fonts-kacst \
    fonts-noto-core \
    fonts-noto-cjk \
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# إعدادات Puppeteer والبيئة
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

# نسخ ملفات التعريف
COPY package*.json ./

# تعديل أمر الـ seed
RUN sed -i 's/"ts-node prisma\/seed.ts"/"node dist\/prisma\/seed.js"/g' package.json

# تثبيت تبعيات الإنتاج فقط
RUN npm ci --only=production

# نسخ الملفات من الـ Builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# نسخ المفتاح العام للمكان الذي يتوقعه الكود المترجم (داخل dist أحياناً أو في الجذر)
# سننسخه للجذر ولداخل dist لضمان العثور عليه
COPY --from=builder /app/src/licensing/public.key ./public.key
COPY --from=builder /app/src/licensing/public.key ./dist/licensing/public.key

# توليد Prisma Client للإنتاج
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# إعداد سكربت التشغيل والصلاحيات
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY --from=builder /app/scripts ./scripts

# ✅ ضبط الصلاحيات للمستخدم node (غير الروت)
RUN chmod +x /app/docker-entrypoint.sh && \
    chown -R node:node /app

# التحويل للمستخدم الآمن
USER node

EXPOSE 3000

# استخدام Tini كـ Entrypoint
ENTRYPOINT ["/usr/bin/tini", "--"]

# تشغيل السكربت الخاص بك
CMD ["/app/docker-entrypoint.sh"]





# # ==========================================
# # Saraya ERP - Backend Dockerfile
# # ==========================================
# # STANDARD BASE IMAGES:
# #   - Build Stage: node:20-slim (Debian)
# #   - Production Stage: node:20-slim (Debian)
# # 
# # NOTE: We use Debian-based images because:
# #   - Better compatibility with native modules (bcrypt, node-machine-id)
# #   - Chromium for PDF generation works reliably
# #   - More stable package management (apt vs apk)
# # ==========================================

# # ==========================================
# # Stage 1: Builder (البناء)
# # ==========================================
# FROM node:20-slim AS builder

# WORKDIR /app

# # تنصيب أدوات البناء اللازمة للمكتبات التي تعتمد على C++ (مثل node-machine-id)
# RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# # نسخ ملفات التعريف
# COPY package*.json ./
# COPY prisma ./prisma/

# # تنصيب جميع المكتبات (بما فيها devDependencies)
# RUN npm ci

# # نسخ باقي الكود
# COPY . .

# # توليد Prisma Client
# ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
# RUN npx prisma generate

# # بناء المشروع (تحويل TypeScript إلى JavaScript)
# RUN npm run build

# # تجميع سكربت الـ Seed
# RUN npx tsc prisma/seed.ts --outDir dist/prisma --module commonjs --target es2019 --esModuleInterop --skipLibCheck --moduleResolution node

# # ==========================================
# # Stage 2: Production (التشغيل)
# # ==========================================
# FROM node:20-slim AS production

# WORKDIR /app

# # تنصيب المكتبات اللازمة لتشغيل Puppeteer (Chromium) في بيئة Debian
# # هذه الخطوة حرجة جداً لضمان عمل الطباعة PDF
# RUN apt-get update && apt-get install -y \
#     chromium \
#     libnss3 \
#     libfreetype6 \
#     libharfbuzz0b \
#     ca-certificates \
#     fonts-freefont-ttf \
#     curl \
#     --no-install-recommends \
#     && rm -rf /var/lib/apt/lists/*

# # إخبار Puppeteer باستخدام الكروم المثبت في النظام بدلاً من تنزيله
# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
#     PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# # نسخ ملفات التعريف فقط
# COPY package*.json ./

# # تعديل أمر الـ seed ليعمل في بيئة الإنتاج (استخدام الملف المترجم بدلاً من ts-node)
# RUN sed -i 's/"ts-node prisma\/seed.ts"/"node dist\/prisma\/seed.js"/g' package.json

# # تنصيب مكتبات الإنتاج فقط (لتصغير حجم الصورة)
# RUN npm ci --only=production

# # نسخ الملفات المبنية من المرحلة السابقة
# COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/prisma ./prisma

# # Generate Prisma Client for Production
# ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
# RUN npx prisma generate

# # ✅ هام جداً: نسخ المفتاح العام للترخيص
# COPY --from=builder /app/src/licensing/public.key ./src/licensing/public.key

# # نسخ سكربت التشغيل
# COPY docker-entrypoint.sh /app/docker-entrypoint.sh
# RUN chmod +x /app/docker-entrypoint.sh

# # نسخ السكربتات المساعدة (مثل baseline.js)
# COPY --from=builder /app/scripts ./scripts

# # فتح المنفذ
# EXPOSE 3000

# # أمر التشغيل: تنفيذ المايجريشن + الـ Seed (إن لزم) + تشغيل السيرفر
# CMD ["/app/docker-entrypoint.sh"]
