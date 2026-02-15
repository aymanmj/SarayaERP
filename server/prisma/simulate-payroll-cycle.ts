// prisma/simulate-payroll-cycle.ts

import {
  PrismaClient,
  EncounterType,
  InvoiceStatus,
  AppointmentStatus,
  ShiftType,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 بدء محاكاة الدورة المالية والتشغيلية الكاملة...');

  // ==========================================
  // 1. إعداد الطبيب (البيانات المالية)
  // ==========================================
  console.log('👨‍⚕️ 1. تحديث بيانات الطبيب (د. أحمد)...');

  // سنبحث عن الطبيب أو ننشئه إذا لم يوجد
  let doctor = await prisma.user.findFirst({
    where: { username: 'dr_ahmed' },
  });

  if (!doctor) {
    console.error('❌ الطبيب dr_ahmed غير موجود. يرجى تشغيل الـ Seed أولاً.');
    return;
  }

  // تحديث العقد المالي
  doctor = await prisma.user.update({
    where: { id: doctor.id },
    data: {
      basicSalary: 5000,
      commissionRate: 0.1, // 10% عمولة
      housingAllowance: 500,
      transportAllowance: 200,
      otherAllowance: 0,
      isActive: true,
      isDoctor: true,
    },
  });
  console.log(`   ✅ تم ضبط الراتب: 5000 د.ل | العمولة: 10%`);

  // ==========================================
  // 2. جدول المناوبات (Roster)
  // ==========================================
  console.log('📅 2. إنشاء جدول المناوبة (Roster) لليوم...');

  const today = new Date();
  today.setHours(0, 0, 0, 0); // بداية اليوم

  // جلب وردية صباحية
  let shift = await prisma.workShift.findFirst({
    where: { type: ShiftType.MORNING },
  });

  if (!shift) {
    // إنشاء وردية لو مش موجودة
    shift = await prisma.workShift.create({
      data: {
        hospitalId: doctor.hospitalId,
        name: 'Simulated Morning Shift',
        type: ShiftType.MORNING,
        startTime: '08:00',
        endTime: '16:00',
        graceMinutes: 15,
      },
    });
  }

  // حذف أي جدول سابق لليوم لتجنب التضارب
  await prisma.employeeRoster.deleteMany({
    where: { userId: doctor.id, date: today },
  });

  await prisma.employeeRoster.create({
    data: {
      hospitalId: doctor.hospitalId,
      userId: doctor.id,
      workShiftId: shift.id,
      date: today,
      isOffDay: false,
    },
  });
  console.log(`   ✅ تم تعيين وردية (08:00 - 16:00) لليوم.`);

  // ==========================================
  // 3. الحضور والانصراف (Attendance)
  // ==========================================
  console.log('⏰ 3. تسجيل بصمة الحضور (تأخير متعمد)...');

  // موعد الحضور: 09:30 (تأخير ساعة ونصف عن الـ 08:00)
  const checkInTime = new Date(today);
  checkInTime.setHours(9, 30, 0, 0);

  // موعد الانصراف: 16:00
  const checkOutTime = new Date(today);
  checkOutTime.setHours(16, 0, 0, 0);

  // حذف أي بصمة سابقة
  await prisma.attendanceRecord.deleteMany({
    where: { userId: doctor.id, date: today },
  });

  await prisma.attendanceRecord.create({
    data: {
      userId: doctor.id,
      date: today,
      checkIn: checkInTime,
      checkOut: checkOutTime,
      status: 'LATE',
      lateMinutes: 90, // النظام يحسبها في الـ Service، هنا نحاكي القيمة النهائية
    },
  });
  console.log(`   ✅ تم تسجيل دخول: 09:30 (تأخير 90 دقيقة).`);

  // ==========================================
  // 4. النشاط الطبي والعمولات (Commissions)
  // ==========================================
  console.log('💰 4. تنفيذ خدمة طبية (لإثبات العمولة)...');

  // جلب مريض عشوائي
  const patient = await prisma.patient.findFirst();
  if (!patient) {
    console.log('❌ لا يوجد مرضى');
    return;
  }

  // إنشاء Encounter
  const encounter = await prisma.encounter.create({
    data: {
      hospitalId: doctor.hospitalId,
      patientId: patient.id,
      doctorId: doctor.id,
      type: EncounterType.OPD,
      status: 'CLOSED', // نغلقها كأنها انتهت
      chiefComplaint: 'Simulation Checkup',
    },
  });

  // جلب خدمة طبية
  let service = await prisma.serviceItem.findFirst({
    where: { hospitalId: doctor.hospitalId, defaultPrice: { gt: 0 } },
  });

  // لو مافيش خدمة ننشئ واحدة
  if (!service) {
    service = await prisma.serviceItem.create({
      data: {
        hospitalId: doctor.hospitalId,
        code: 'SIM-SRV',
        name: 'Simulated Surgery',
        type: 'CONSULTATION',
        defaultPrice: 200,
        isActive: true,
      },
    });
  }

  // القيمة: 200 دينار
  const servicePrice = 200;

  // تسجيل الـ Charge (باسم الطبيب)
  const charge = await prisma.encounterCharge.create({
    data: {
      hospitalId: doctor.hospitalId,
      encounterId: encounter.id,
      serviceItemId: service!.id,
      sourceType: 'MANUAL',
      quantity: 1,
      unitPrice: servicePrice,
      totalAmount: servicePrice,
      performerId: doctor.id, // 👈 هذا هو المهم للعمولة
    },
  });

  // ✅ الفوترة (مهم جداً: العمولة لا تُحسب إلا إذا كانت الفاتورة موجودة وغير ملغاة)
  // سنبحث عن سنة مالية وفترة مفتوحة
  const fy = await prisma.financialYear.findFirst({
    where: { status: 'OPEN' },
  });
  const period = await prisma.financialPeriod.findFirst({
    where: { isOpen: true },
  });

  if (fy && period) {
    const invoice = await prisma.invoice.create({
      data: {
        hospitalId: doctor.hospitalId,
        patientId: patient.id,
        encounterId: encounter.id,
        status: InvoiceStatus.PAID, // مدفوعة
        totalAmount: servicePrice,
        paidAmount: servicePrice,
        patientShare: servicePrice,
        financialYearId: fy.id,
        financialPeriodId: period.id,
      },
    });

    // ربط الـ Charge بالفاتورة
    await prisma.encounterCharge.update({
      where: { id: charge.id },
      data: { invoiceId: invoice.id },
    });

    console.log(
      `   ✅ تم تنفيذ خدمة بقيمة ${servicePrice} د.ل وإصدار فاتورة مدفوعة.`,
    );
  } else {
    console.log(
      `   ⚠️ تحذير: لم يتم إنشاء فاتورة لعدم وجود سنة مالية مفتوحة. العمولة قد لا تظهر.`,
    );
  }

  // ==========================================
  // 5. تنظيف كشوفات سابقة للشهر الحالي (إعادة تعيين)
  // ==========================================
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  await prisma.payrollRun.deleteMany({
    where: { month: currentMonth, year: currentYear },
  });

  console.log(
    `🧹 تم تنظيف أي كشوفات رواتب سابقة لشهر ${currentMonth}/${currentYear} لإتاحة التجربة.`,
  );

  console.log('\n=======================================');
  console.log('🎉 اكتملت المحاكاة بنجاح!');
  console.log('=======================================');
  console.log('الآن، اذهب إلى المتصفح وقم بالخطوات التالية:');
  console.log('1. افتح صفحة الرواتب (Payroll).');
  console.log(`2. اختر الشهر ${currentMonth} والسنة ${currentYear}.`);
  console.log('3. اضغط زر "بدء الاحتساب الذكي".');
  console.log('4. ستجد في التفاصيل:');
  console.log(`   - الراتب: 5000`);
  console.log(`   - العمولة: ${servicePrice * 0.1} (10% من ${servicePrice})`);
  console.log(`   - الخصومات: قيمة 90 دقيقة تأخير.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
