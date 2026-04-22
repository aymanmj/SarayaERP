// prisma.config.ts

import 'dotenv/config'; // تحميل متغيرات البيئة من .env
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

type Env = {
  DATABASE_URL: string;
};

export default defineConfig({
  // مسار ملف الـ schema.prisma
  schema: path.join('prisma', 'schema.prisma'),

  // مسار مجلد الـ migrations
  migrations: {
    path: path.join('prisma', 'migrations'),
  },

  // إعداد الـ datasource
  // دالة env() من Prisma ترمي خطأ مباشرة إذا المتغير غير موجود
  // لذلك نستخدم process.env مع رابط وهمي للتطوير المحلي (prisma generate / migrate)
  // في الإنتاج، القيمة الحقيقية تأتي من HashiCorp Vault عبر متغيرات البيئة
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://prisma:prisma@localhost:5433/saraya_dev?schema=public',
  },
});
