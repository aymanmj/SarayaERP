import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export async function captureConsumptionMaterials(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  serviceItemId: number,
) {
  const rows = await tx.serviceItemProduct.findMany({
    where: { serviceItemId, isMandatory: true },
    include: { product: { select: { hospitalId: true } } },
    orderBy: { productId: 'asc' },
  });
  for (const row of rows)
    if (
      row.product.hospitalId !== hospitalId ||
      !row.quantity.isFinite() ||
      row.quantity.lte(0) ||
      row.quantity.decimalPlaces() > 3
    )
      throw new BadRequestException(
        'تعريف مواد الخدمة غير صالح أو خارج المنشأة',
      );
  return rows.map((row) => ({
    productId: row.productId,
    quantity: row.quantity.toFixed(3),
  }));
}
export function readConsumptionMaterials(value: Prisma.JsonValue) {
  if (!Array.isArray(value))
    throw new ConflictException('عملية دون تعريف مواد مثبت؛تلزم المراجعة');
  const result = value.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      typeof item.productId !== 'number' ||
      !Number.isSafeInteger(item.productId) ||
      item.productId <= 0 ||
      typeof item.quantity !== 'string' ||
      !/^\d+\.\d{3}$/.test(item.quantity)
    )
      throw new ConflictException('تعريف مواد مثبت غير صالح');
    const quantity = new Prisma.Decimal(item.quantity);
    if (quantity.lte(0)) throw new ConflictException('كمية مواد غير صالحة');
    return { productId: item.productId, quantity };
  });
  if (new Set(result.map((row) => row.productId)).size !== result.length)
    throw new ConflictException('مواد مثبتة مكررة');
  return result;
}
