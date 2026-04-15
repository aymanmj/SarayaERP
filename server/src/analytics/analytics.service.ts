import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getExecutiveStats(hospitalId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. الإيرادات اليومية (Daily Revenue)
    // نفترض وجود موديل Invoice (أو نستخدم Encounter مؤقتاً إذا لم تكن الفواتير مفعلة بالكامل)
    // سنستخدم جدول Invoice إذا كان موجوداً، أو نحسب وعوداً
    // بناءً على المراجعة السابقة، رأينا PurchaseInvoice، هل هناك SalesInvoice؟
    // دعنا نتحقق من schema.prisma لاحقاً، سنفترض وجود Prescription/Encounter مدفوعات
    // سأستخدم استعلام آمن يعتمد على Encounter مبدئياً حتى نتأكد من الفواتير
    
    // سنبحث عن الانكاونترز اليوم
    const dailyVisits = await this.prisma.encounter.count({
      where: {
        hospitalId,
        createdAt: { gte: today },
      },
    });

    // 2. المرضى المنومين حالياً (Active Inpatients)
    const activeInpatients = await this.prisma.encounter.count({
      where: {
        hospitalId,
        status: 'OPEN', // ✅ Active Encounters
        type: 'IPD',    // ✅ Inpatients only
      },
    });

    // 3. قيمة المخزون (Inventory Value)
    // تجميع قيمة كل الأرصدة: الكمية * سعر التكلفة
    const allStock = await this.prisma.productStock.findMany({
      where: { hospitalId },
      include: {
        product: { select: { costPrice: true } },
      },
    });

    const inventoryValue = allStock.reduce((sum, item) => {
      const qty = Number(item.quantity);
      const cost = Number(item.product.costPrice);
      return sum + qty * cost;
    }, 0);

    // 4. الإيرادات اليومية الفعلية (Actual Daily Revenue from Billing)
    const invoicesToday = await this.prisma.invoice.aggregate({
        _sum: { totalAmount: true },
        where: {
            hospitalId,
            createdAt: { gte: today },
            status: { in: ['ISSUED', 'PAID'] },
            type: { not: 'CREDIT_NOTE' }
        }
    });

    const creditNotesToday = await this.prisma.invoice.aggregate({
        _sum: { totalAmount: true },
        where: {
            hospitalId,
            createdAt: { gte: today },
            status: 'PAID',
            type: 'CREDIT_NOTE'
        }
    });
    
    // Revenue is Gross Billed amount minus Credit Notes
    const grossRevenue = Number(invoicesToday._sum.totalAmount || 0);
    const returnsValue = Number(creditNotesToday._sum.totalAmount || 0);
    const actualRevenue = grossRevenue - returnsValue;

    return {
      dailyVisits,
      activeInpatients,
      inventoryValue: Math.round(inventoryValue),
      dailyRevenue: Math.round(actualRevenue),
      lastUpdated: new Date(),
    };
  }
}
