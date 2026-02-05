# ==========================================
# Stage 1: Build React App
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# نسخ ملفات التعريف
COPY package*.json ./

# تنصيب المكتبات
RUN npm ci

# نسخ باقي الكود
COPY . .

# بناء المشروع (تخطي فحص TypeScript والبناء مباشرة)
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
