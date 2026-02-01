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

  // إعداد الـ datasource (هنا مكان الـ DATABASE_URL في Prisma 7)
  datasource: {
    url: env<Env>('DATABASE_URL'),
  },
});
