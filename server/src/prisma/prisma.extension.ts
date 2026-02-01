import { PrismaClient } from '@prisma/client';

export const extendedPrisma = (prisma: PrismaClient) => {
  return prisma.$extends({
    query: {
      $allModels: {
        async delete({ model, args }) {
          // التحقق من أن النموذج يدعم الحذف الناعم (يحتوي على isDeleted)
          // هذا يتم عبر الـ generic args، نستخدم casting لتجاوز خطأ TS
          return (prisma as any)[model].update({
            ...args,
            data: {
              isDeleted: true,
              deletedAt: new Date(),
            },
          });
        },
        async deleteMany({ model, args }) {
          return (prisma as any)[model].updateMany({
            ...args,
            data: {
              isDeleted: true,
              deletedAt: new Date(),
            },
          });
        },
        async findMany({ model, args }) {
          // تجاوز تدقيق الأنواع هنا لأننا نعلم أن النماذج المستهدفة تملك الحقل
          const queryArgs = args as any;

          if (queryArgs.where) {
            if (queryArgs.where.isDeleted === undefined) {
              // نفترض أن الحقل موجود، إذا لم يكن موجوداً Prisma ستهمل هذا الشرط في النماذج التي لا تملكه
              queryArgs.where.isDeleted = false;
            }
          } else {
            queryArgs.where = { isDeleted: false };
          }
          return (prisma as any)[model].findMany(queryArgs);
        },
        async findFirst({ model, args }) {
          const queryArgs = args as any;

          if (queryArgs.where) {
            if (queryArgs.where.isDeleted === undefined) {
              queryArgs.where.isDeleted = false;
            }
          } else {
            queryArgs.where = { isDeleted: false };
          }
          return (prisma as any)[model].findFirst(queryArgs);
        },
      },
    },
  });
};
