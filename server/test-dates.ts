import { resolve } from 'path';
import { config } from 'dotenv';
config({ path: resolve(__dirname, '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const roles = await prisma.role.findMany();
  console.log("All DB Roles:", roles.map(r => r.name));

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  
  console.log("todayStart (local boundary, ISO):", todayStart.toISOString());
  console.log("todayEnd (local boundary, ISO):", todayEnd.toISOString());

  const appts = await prisma.appointment.findMany({
    where: { scheduledStart: { gte: todayStart, lte: todayEnd } }
  });
  console.log(`Appointments falling strictly between these borders: ${appts.length}`);

  const payments = await prisma.payment.findMany({
    where: { paidAt: { gte: todayStart, lte: todayEnd } }
  });
  console.log(`Payments falling strictly between these borders: ${payments.length}`);

  // Fetch all appts & payments scheduled/paid today by just using string comparisons 
  // or a wide UTC boundary to see what exactly is in DB right now
  const allAppts = await prisma.appointment.findMany({ orderBy: { scheduledStart: "desc" }, take: 10 });
  console.log("last 10 appts:", allAppts.map(a => a.scheduledStart.toISOString()));

  const allPayments = await prisma.payment.findMany({ orderBy: { paidAt: "desc" }, take: 5 });
  console.log("last 5 payments:", allPayments.map(p => ({ date: p.paidAt.toISOString(), amt: p.amount })));

}

main().finally(() => prisma.$disconnect());
