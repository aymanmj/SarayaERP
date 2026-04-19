// ============================================================
// admin-tools/issue-license.js
// Saraya ERP - Professional License Generator v4.0
// Supports: New Activation • Renewal • Smart Duration
// ============================================================

const jwt = require("jsonwebtoken");
const fs = require("fs");
const crypto = require("crypto");
const readline = require("readline");
const path = require("path");

// ── Terminal Interface ──
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

// ── ANSI Colors for pretty output ──
const color = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
  bgGreen: "\x1b[42m",
  bgRed: "\x1b[41m",
};

// ── Pretty Logging Helpers ──
function printHeader(text) {
  console.log(`\n${color.bgBlue}${color.white}${color.bold}  ${text}  ${color.reset}`);
}

function printSuccess(text) {
  console.log(`  ${color.green}✅ ${text}${color.reset}`);
}

function printInfo(text) {
  console.log(`  ${color.cyan}ℹ️  ${text}${color.reset}`);
}

function printWarning(text) {
  console.log(`  ${color.yellow}⚠️  ${text}${color.reset}`);
}

function printError(text) {
  console.log(`  ${color.red}❌ ${text}${color.reset}`);
}

function printField(label, value) {
  console.log(`  ${color.dim}${label}:${color.reset}  ${color.bold}${value}${color.reset}`);
}

function printDivider() {
  console.log(`  ${color.dim}${"─".repeat(54)}${color.reset}`);
}

function printDoubleDivider() {
  console.log(`${color.dim}${"═".repeat(58)}${color.reset}`);
}

// ── Available Modules Definition ──
const ALL_MODULES = [
  { code: "LAB",       nameAr: "مختبر التحاليل",      defaultInPro: true },
  { code: "RADIOLOGY", nameAr: "الأشعة التشخيصية",    defaultInPro: true },
  { code: "PHARMACY",  nameAr: "الصيدلية",            defaultInPro: true },
  { code: "HR",        nameAr: "الموارد البشرية",      defaultInPro: false },
  { code: "ASSETS",    nameAr: "إدارة الأصول",        defaultInPro: false },
  { code: "ACCOUNTS",  nameAr: "المحاسبة العامة",      defaultInPro: false },
  { code: "CDSS",      nameAr: "دعم القرار السريري",   defaultInPro: true },
  { code: "OBGYN",     nameAr: "النساء والتوليد",      defaultInPro: false },
];

// ── Duration Presets ──
const DURATION_OPTIONS = [
  { key: "1", days: 14,  label: "تجريبي",    labelEn: "Trial (14 days)" },
  { key: "2", days: 30,  label: "شهري",      labelEn: "Monthly (30 days)" },
  { key: "3", days: 90,  label: "ربع سنوي",  labelEn: "Quarterly (90 days)" },
  { key: "4", days: 180, label: "نصف سنوي",  labelEn: "Semi-Annual (180 days)" },
  { key: "5", days: 365, label: "سنوي",      labelEn: "Annual (365 days)" },
  { key: "6", days: 730, label: "سنتان",     labelEn: "2-Year (730 days)" },
];

// ============================================================
// MAIN FLOW
// ============================================================

(async () => {
  printHeader("🔐 Saraya ERP - License Generator v4.0");
  printDoubleDivider();

  try {
    // ── Validate Private Key ──
    const privateKeyPath = path.join(__dirname, "private.key");
    if (!fs.existsSync(privateKeyPath)) {
      throw new Error(
        "ملف private.key غير موجود!\n" +
        "  يرجى توليد المفاتيح أولاً بتشغيل:\n" +
        "  node generate-keys.js"
      );
    }
    const privateKey = fs.readFileSync(privateKeyPath, "utf8");
    printSuccess("المفتاح الخاص (private.key) محمّل بنجاح");

    // ─────────────────────────────────────────────
    // STEP 1: Operation Type
    // ─────────────────────────────────────────────
    printHeader("📋 الخطوة 1: نوع العملية");
    console.log("");
    console.log("  1. 🆕  تفعيل جديد  (New Activation)");
    console.log("  2. 🔄  تجديد اشتراك (Renewal)");
    console.log("");

    const operationType = (await ask("  👉 اختر (1-2): ")).trim();
    const isRenewal = operationType === "2";

    if (isRenewal) {
      printInfo("وضع التجديد مفعّل");
      printInfo("عند استخدام المفتاح عبر صفحة التجديد,");
      printInfo("سيتم احتساب الأيام المتبقية تلقائياً وإضافتها");
    } else {
      printInfo("وضع التفعيل الجديد - مفتاح نظيف يبدأ من الصفر");
    }

    // ─────────────────────────────────────────────
    // STEP 2: Client Information
    // ─────────────────────────────────────────────
    printHeader("🏥 الخطوة 2: بيانات العميل");
    console.log("");

    const hwId = (await ask("  🖥️  كود الجهاز (Machine ID): ")).trim();
    if (!hwId) throw new Error("كود الجهاز مطلوب! احصل عليه من صفحة التفعيل.");

    const hospitalName = (await ask("  🏥 اسم المنشأة الصحية:    ")).trim();
    if (!hospitalName) throw new Error("اسم المنشأة مطلوب!");

    printSuccess(`العميل: ${hospitalName}`);
    printSuccess(`الجهاز: ${hwId.substring(0, 8)}...`);

    // ─────────────────────────────────────────────
    // STEP 3: Subscription Duration
    // ─────────────────────────────────────────────
    printHeader("📅 الخطوة 3: مدة الاشتراك");
    console.log("");

    // Show preset options
    for (const opt of DURATION_OPTIONS) {
      console.log(`  ${opt.key}. ${opt.label.padEnd(12)} (${opt.days} يوم)`);
    }
    console.log(`  7. مخصص        (تاريخ محدد YYYY-MM-DD)`);
    console.log(`  8. أيام مخصصة  (عدد أيام محدد)`);
    console.log("");

    const durationChoice = (await ask("  👉 اختر (1-8): ")).trim();

    let expiryDate;
    let durationLabel = "";
    const calculationDate = new Date();

    // Find preset or handle custom
    const preset = DURATION_OPTIONS.find((o) => o.key === durationChoice);

    if (preset) {
      // Preset duration
      calculationDate.setDate(calculationDate.getDate() + preset.days);
      expiryDate = calculationDate.toISOString().split("T")[0];
      durationLabel = `${preset.label} (${preset.days} يوم)`;
    } else if (durationChoice === "7") {
      // Custom date
      expiryDate = (await ask("  📅 تاريخ الانتهاء (YYYY-MM-DD): ")).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
        throw new Error("صيغة التاريخ غير صحيحة. استخدم YYYY-MM-DD");
      }
      durationLabel = `مخصص حتى ${expiryDate}`;
    } else if (durationChoice === "8") {
      // Custom days
      const customDays = parseInt(
        (await ask("  🔢 عدد الأيام: ")).trim(),
        10
      );
      if (isNaN(customDays) || customDays <= 0) {
        throw new Error("عدد الأيام يجب أن يكون رقماً صحيحاً أكبر من صفر.");
      }
      calculationDate.setDate(calculationDate.getDate() + customDays);
      expiryDate = calculationDate.toISOString().split("T")[0];
      durationLabel = `${customDays} يوم`;
    } else {
      throw new Error("اختيار غير صحيح للمدة.");
    }

    printSuccess(`ينتهي في: ${expiryDate}`);

    // ─────────────────────────────────────────────
    // STEP 4: Max Users (Seats)
    // ─────────────────────────────────────────────
    printHeader("👥 الخطوة 4: عدد المستخدمين");
    console.log("");
    console.log("  أدخل رقم محدد (مثلاً: 5, 10, 25, 50, 100)");
    console.log("  أدخل -1 لعدد غير محدود (Unlimited)");
    console.log("");

    const maxUsersInput = (await ask("  👉 الحد الأقصى: ")).trim();
    const maxUsers = parseInt(maxUsersInput, 10);
    if (isNaN(maxUsers)) {
      throw new Error("رقم المستخدمين غير صحيح.");
    }

    printSuccess(
      maxUsers === -1
        ? "عدد المستخدمين: غير محدود ∞"
        : `عدد المستخدمين: ${maxUsers}`
    );

    // ─────────────────────────────────────────────
    // STEP 5: Plan (Tier)
    // ─────────────────────────────────────────────
    printHeader("📦 الخطوة 5: الباقة");
    console.log("");
    console.log("  1. أساسي       (Basic)      - الحد الأدنى");
    console.log("  2. احترافي     (Pro)        - معظم الوحدات");
    console.log("  3. مؤسسة شامل (Enterprise)  - كل شيء");
    console.log("");

    const planChoice = (await ask("  👉 اختر (1-3): ")).trim();
    let plan = "STANDARD";
    let planDisplay = "أساسي (Standard)";
    if (planChoice === "2") {
      plan = "PRO";
      planDisplay = "احترافي (Pro)";
    }
    if (planChoice === "3") {
      plan = "ENTERPRISE";
      planDisplay = "مؤسسة شامل (Enterprise)";
    }

    printSuccess(`الباقة: ${planDisplay}`);

    // ─────────────────────────────────────────────
    // STEP 6: Modules Selection
    // ─────────────────────────────────────────────
    printHeader("🧩 الخطوة 6: الوحدات (Modules)");
    console.log("");

    const selectedModules = [];

    if (planChoice === "3") {
      // Enterprise = all modules
      selectedModules.push(...ALL_MODULES.map((m) => m.code));
      printSuccess("تم تفعيل جميع الوحدات تلقائياً (باقة مؤسسة شامل)");
    } else {
      // Manual selection
      console.log("  اختر الوحدات التي تريد تفعيلها:");
      console.log("  اضغط Enter للقبول بالافتراضي\n");

      for (const mod of ALL_MODULES) {
        const isDefault = planChoice === "2" && mod.defaultInPro;
        const defaultIndicator = isDefault ? "Y" : "N";
        const prompt = `  ${mod.code.padEnd(12)} ${mod.nameAr.padEnd(22)} [${defaultIndicator}]: `;

        const answer = (await ask(prompt)).trim().toLowerCase();
        const accepted =
          answer === "y" || answer === "yes" || (answer === "" && isDefault);

        if (accepted) {
          selectedModules.push(mod.code);
        }
      }
    }

    console.log("");
    printSuccess(`الوحدات المفعّلة: ${selectedModules.join(", ") || "لا يوجد"}`);

    // ─────────────────────────────────────────────
    // STEP 7: Generate License Token
    // ─────────────────────────────────────────────
    printHeader("🔑 توليد مفتاح الترخيص");

    // Compute hardware fingerprint
    const hwFingerprint = crypto
      .createHash("sha256")
      .update(`${hwId}::${hospitalName}`)
      .digest("hex");

    // Build JWT payload
    const payload = {
      hwId,
      hwFingerprint,
      hospitalName,
      expiryDate,
      maxUsers,
      plan,
      modules: selectedModules,
    };

    // Sign with RSA-256
    const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });

    printSuccess("تم توليد المفتاح بنجاح!");

    // ─────────────────────────────────────────────
    // STEP 8: Display Summary
    // ─────────────────────────────────────────────
    console.log("");
    printDoubleDivider();
    printHeader(isRenewal ? "🔄 مفتاح التجديد جاهز!" : "✅ مفتاح التفعيل جاهز!");
    printDoubleDivider();
    console.log("");

    printField("🏥 المنشأة     ", hospitalName);
    printField("🖥️  كود الجهاز  ", hwId);
    printField("📅 المدة       ", durationLabel);
    printField("📅 تاريخ الانتهاء", expiryDate);
    printField("👥 المستخدمين  ", maxUsers === -1 ? "غير محدود ∞" : String(maxUsers));
    printField("📦 الباقة      ", planDisplay);
    printField("🧩 الوحدات     ", selectedModules.join(", ") || "لا يوجد");
    printField("🔑 نوع العملية ", isRenewal ? "تجديد اشتراك" : "تفعيل جديد");
    printField("🔏 البصمة      ", hwFingerprint.substring(0, 16) + "...");

    console.log("");
    printDivider();

    // ─────────────────────────────────────────────
    // STEP 9: Output Token
    // ─────────────────────────────────────────────
    console.log(
      `\n${color.bgGreen}${color.white}${color.bold}  👇 انسخ المفتاح التالي وأرسله للعميل:  ${color.reset}\n`
    );
    console.log(token);
    console.log("");

    // ─────────────────────────────────────────────
    // STEP 10: Save to Files
    // ─────────────────────────────────────────────
    printDivider();

    // Save token to text file
    const tokenFileName = isRenewal ? "renewal-key.txt" : "activation-key.txt";
    const tokenFilePath = path.join(__dirname, tokenFileName);
    fs.writeFileSync(tokenFilePath, token, "utf8");
    printSuccess(`المفتاح محفوظ في: ${tokenFileName}`);

    // Save metadata to JSON
    const metadata = {
      key: token,
      type: isRenewal ? "renewal" : "activation",
      hospitalName,
      hwId,
      expiryDate,
      plan,
      maxUsers,
      modules: selectedModules,
      fingerprint: hwFingerprint,
      generatedAt: new Date().toISOString(),
    };
    const metadataPath = path.join(__dirname, "activation.json");
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
    printSuccess(`البيانات محفوظة في: activation.json`);

    // ─────────────────────────────────────────────
    // STEP 11: Instructions
    // ─────────────────────────────────────────────
    console.log("");
    printDivider();

    if (isRenewal) {
      printWarning("تعليمات التجديد:");
      console.log(`  ${color.yellow}1. أرسل المفتاح للعميل${color.reset}`);
      console.log(`  ${color.yellow}2. العميل يفتح صفحة "تجديد الاشتراك" في النظام${color.reset}`);
      console.log(`  ${color.yellow}3. يلصق المفتاح ويضغط "تجديد الاشتراك"${color.reset}`);
      console.log(`  ${color.yellow}4. الأيام المتبقية تُضاف تلقائياً إن وُجدت${color.reset}`);
    } else {
      printInfo("تعليمات التفعيل:");
      console.log(`  ${color.cyan}1. أرسل المفتاح للعميل${color.reset}`);
      console.log(`  ${color.cyan}2. العميل يفتح صفحة التفعيل في النظام${color.reset}`);
      console.log(`  ${color.cyan}3. يلصق المفتاح ويضغط "تفعيل النظام"${color.reset}`);
    }

    console.log("");
    printDoubleDivider();
    printSuccess("تمت العملية بنجاح! 🎉");
    printDoubleDivider();
  } catch (err) {
    console.log("");
    printError(err.message || err);
    console.log("");
  } finally {
    rl.close();
  }
})();
