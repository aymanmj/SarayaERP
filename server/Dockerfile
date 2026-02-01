# ==========================================
# Stage 1: Builder (البناء)
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# تنصيب أدوات البناء اللازمة للمكتبات التي تعتمد على C++ (مثل node-machine-id)
RUN apk add --no-cache python3 make g++

# نسخ ملفات التعريف
COPY package*.json ./
COPY prisma ./prisma/

# تنصيب جميع المكتبات (بما فيها devDependencies)
RUN npm ci

# نسخ باقي الكود
COPY . .

# توليد Prisma Client
RUN npx prisma generate

# بناء المشروع (تحويل TypeScript إلى JavaScript)
RUN npm run build

# ==========================================
# Stage 2: Production (التشغيل)
# ==========================================
FROM node:20-alpine

WORKDIR /app

# تنصيب المكتبات اللازمة لتشغيل Puppeteer (Chromium) في بيئة Alpine
# هذه الخطوة حرجة جداً لضمان عمل الطباعة PDF
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      nodejs \
      yarn

# إخبار Puppeteer باستخدام الكروم المثبت في النظام بدلاً من تنزيله
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# نسخ ملفات التعريف فقط
COPY package*.json ./

# تنصيب مكتبات الإنتاج فقط (لتصغير حجم الصورة)
RUN npm ci --only=production

# نسخ الملفات المبنية من المرحلة السابقة
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# ✅ هام جداً: نسخ المفتاح العام للترخيص
# تأكد أن الملف public.key موجود في هذا المسار قبل البناء
COPY --from=builder /app/src/licensing/public.key ./src/licensing/public.key

# فتح المنفذ
EXPOSE 3000

# أمر التشغيل: تنفيذ المايجريشن أولاً ثم تشغيل السيرفر
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
