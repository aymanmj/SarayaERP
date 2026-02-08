# ==========================================
# Saraya ERP - Frontend Dockerfile
# ==========================================
# STANDARD BASE IMAGES:
#   - Build Stage: node:20-slim (Debian)
#   - Production Stage: nginx:alpine (lightweight)
# ==========================================

# ==========================================
# Stage 1: Build React App
# ==========================================
FROM node:20-slim AS builder

WORKDIR /app

# نسخ ملفات التعريف
COPY package*.json ./

# إعدادات الشبكة لتجنب ECONNRESET
RUN npm config set fetch-retry-maxtimeout 600000 \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-factor 10

# تنصيب المكتبات
RUN npm ci

# نسخ باقي الكود
COPY . .

# ==========================================
# Build Arguments for Vite
# متغيرات البناء للواجهة الأمامية
# ==========================================
ARG VITE_API_URL=http://localhost:3000
ARG VITE_APP_NAME=Saraya\ ERP
ARG VITE_APP_VERSION=1.0.1

# تحويل ARG إلى ENV ليتعرف عليها Vite
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_BASE_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_APP_VERSION=$VITE_APP_VERSION

# بناء المشروع
RUN npm run build -- --mode production

# ==========================================
# Stage 2: Serve with Nginx
# ==========================================
FROM nginx:alpine AS production

# تنصيب curl للفحوصات الصحية (Health Checks)
RUN apk add --no-cache curl

# حذف الإعدادات الافتراضية
RUN rm /etc/nginx/conf.d/default.conf

# نسخ إعداداتنا الخاصة
COPY nginx.conf /etc/nginx/conf.d/default.conf

# نسخ ملفات البناء إلى مجلد Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# فتح المنفذ 80
EXPOSE 80

# تشغيل Nginx
CMD ["nginx", "-g", "daemon off;"]
