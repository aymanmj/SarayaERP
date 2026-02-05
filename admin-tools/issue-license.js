// license-tools/issue-license.js

const jwt = require("jsonwebtoken");
const fs = require("fs");
const readline = require("readline");

// إعداد واجهة الإدخال
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

(async () => {
  console.log("\n🔐 --- Saraya ERP License Generator (Advanced) --- 🔐\n");

  try {
    // التأكد من وجود المفتاح الخاص
    if (!fs.existsSync("private.key")) {
      throw new Error("ملف private.key غير موجود! يرجى توليد المفاتيح أولاً.");
    }
    const privateKey = fs.readFileSync("private.key", "utf8");

    // 1. بيانات العميل
    const hwId = await ask("1️⃣  أدخل كود جهاز العميل (Machine ID): ");
    if (!hwId) throw new Error("كود الجهاز مطلوب!");

    const hospitalName = await ask("2️⃣  اسم المستشفى/العيادة: ");

    // 2. نوع الاشتراك (المدة)
    console.log("\n--- 📅 مدة الاشتراك ---");
    console.log("1. تجريبي (14 يوم)");
    console.log("2. شهري (30 يوم)");
    console.log("3. سنوي (365 يوم)");
    console.log("4. مخصص (تاريخ محدد)");

    const durationChoice = await ask("اختر المدة (1-4): ");
    let expiryDate;
    const now = new Date();

    switch (durationChoice.trim()) {
      case "1":
        now.setDate(now.getDate() + 14);
        expiryDate = now.toISOString().split("T")[0];
        break;
      case "2":
        now.setDate(now.getDate() + 30);
        expiryDate = now.toISOString().split("T")[0];
        break;
      case "3":
        now.setDate(now.getDate() + 365);
        expiryDate = now.toISOString().split("T")[0];
        break;
      case "4":
        expiryDate = await ask("أدخل تاريخ الانتهاء (YYYY-MM-DD): ");
        break;
      default:
        throw new Error("خيار غير صحيح.");
    }

    // 3. عدد المستخدمين (Seats)
    console.log("\n--- 👥 عدد المستخدمين ---");
    console.log("أدخل رقم محدد (مثلاً 5, 10, 50)");
    console.log("أدخل -1 لعدد غير محدود (Unlimited)");
    const maxUsersInput = await ask("الحد الأقصى للمستخدمين: ");
    const maxUsers = parseInt(maxUsersInput, 10);

    if (isNaN(maxUsers)) throw new Error("رقم المستخدمين غير صحيح.");

    // 4. نوع الباقة (Tier) - For display mostly
    console.log("\n--- 📦 نوع الباقة (Display Tier) ---");
    console.log("1. BASIC");
    console.log("2. PRO");
    console.log("3. ENTERPRISE");

    const planChoice = await ask("اختر مسمى الباقة (1-3): ");
    let plan = "BASIC";
    if (planChoice === "2") plan = "PRO";
    if (planChoice === "3") plan = "ENTERPRISE";

    // 5. الموديلات (Modules)
    console.log("\n--- 🧩 الموديلات (Modules) ---");
    const allModules = ['LAB', 'RADIOLOGY', 'PHARMACY', 'HR', 'ASSETS', 'ACCOUNTS', 'CDSS'];
    const selectedModules = [];
    
    // Auto-select based on Plan for convenience, but allow override?
    // Let's just ask one by one for maximum control.
    console.log("اختر الموديلات التي تريد تفعيلها (y/n):");
    
    for (const mod of allModules) {
        // Default logic
        let defaultAns = 'n';
        if (plan === 'ENTERPRISE') defaultAns = 'y';
        else if (plan === 'PRO' && ['LAB', 'RADIOLOGY', 'PHARMACY', 'CDSS'].includes(mod)) defaultAns = 'y';
        else if (plan === 'BASIC' && !['LAB', 'RADIOLOGY', 'PHARMACY', 'HR', 'ASSETS', 'ACCOUNTS', 'CDSS'].includes(mod)) defaultAns = 'y'; // Basic has none of these usually

        const ans = await ask(`✅ تفعيل ${mod}؟ (${defaultAns === 'y' ? 'Y/n' : 'y/N'}): `);
        const choice = ans.trim().toLowerCase();
        
        if (choice === 'y' || (choice === '' && defaultAns === 'y')) {
            selectedModules.push(mod);
        }
    }
    
    // تجميع البيانات
    const payload = {
      hwId: hwId.trim(),
      hospitalName: hospitalName.trim(),
      expiryDate: expiryDate,
      maxUsers: maxUsers,
      plan: plan,
      modules: selectedModules
    };

    // التشفير والتوقيع
    const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });

    console.log("\n==================================================");
    console.log("✅ تم إصدار الرخصة بنجاح!");
    console.log("==================================================");
    console.log(`🏥 العميل:       ${payload.hospitalName}`);
    console.log(`📅 تاريخ الانتهاء: ${payload.expiryDate}`);
    console.log(`👥 المستخدمين:    ${maxUsers === -1 ? "مفتوح" : maxUsers}`);
    console.log(`📦 الباقة:       ${plan}`);
    console.log(`🧩 الموديلات:    ${selectedModules.join(', ') || 'لا يوجد'}`);
    console.log("==================================================");
    console.log("\n👇 انسخ كود التفعيل التالي وأرسله للعميل:\n");
    console.log(token);
    console.log("\n==================================================");
  } catch (error) {
    console.error("\n❌ خطأ:", error.message);
  } finally {
    rl.close();
  }
})();

// const jwt = require("jsonwebtoken");
// const fs = require("fs");

// // إعدادات الرخصة (قم بتعديلها حسب العميل)
// const CLIENT_MACHINE_ID = "8a06b747-23df-4046-bf25-a704aa6e19a6"; // 👈 ضع كود العميل هنا
// const HOSPITAL_NAME = "مستشفى الأمل التخصصي";
// const EXPIRY_DATE = "2026-12-31"; // تاريخ الانتهاء
// const PLAN = "ENTERPRISE";

// try {
//   const privateKey = fs.readFileSync("private.key", "utf8");

//   const payload = {
//     hwId: CLIENT_MACHINE_ID,
//     hospitalName: HOSPITAL_NAME,
//     expiryDate: EXPIRY_DATE,
//     plan: PLAN,
//   };

//   // التشفير باستخدام المفتاح الخاص
//   const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });

//   console.log("\n================ LICENSE KEY ================\n");
//   console.log(token);
//   console.log("\n=============================================\n");
//   console.log(`✅ License generated for: ${HOSPITAL_NAME}`);
//   console.log(`📅 Expires: ${EXPIRY_DATE}`);
//   console.log("👉 Copy the key above and send it to the client.");
// } catch (error) {
//   console.error("❌ Error: Make sure 'private.key' exists in this folder.");
// }
