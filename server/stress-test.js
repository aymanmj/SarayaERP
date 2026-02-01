const autocannon = require('autocannon');
const { PassThrough } = require('stream');

// إعدادات الاختبار
const TEST_CONFIG = {
  url: 'http://localhost:3000',
  connections: 50, // 50 مستخدم متزامن
  duration: 10,    // لمدة 10 ثواني (محاكاة ذروة مفاجئة)
  pipelining: 1, 
};

// بيانات حجز موعد وهمية
const appointmentPayload = JSON.stringify({
  hospitalId: 1,
  patientId: 1, // تأكد من وجود مريض بهذا الرقم
  doctorId: 1,  // تأكد من وجود طبيب بهذا الرقم
  scheduledStart: new Date().toISOString(),
  scheduledEnd: new Date(Date.now() + 30 * 60000).toISOString(),
  type: "IN_PERSON",
  reason: "Street Test Check"
});

console.log('🚀 Starting Stress Test on Saraya ERP...');
console.log(`🎯 Target: ${TEST_CONFIG.url}/appointments`);
console.log(`👥 Virtual Users: ${TEST_CONFIG.connections}`);

const instance = autocannon({
  ...TEST_CONFIG,
  method: 'POST',
  path: '/appointments',
  body: appointmentPayload,
  headers: {
    'Content-Type': 'application/json',
    // 'Authorization': 'Bearer ...' // 🔴 نحتاج توكن صالح هنا إذا كان النظام يطلب مصادقة
  }
}, (err, result) => {
  if (err) {
    console.error('❌ Error running stress test:', err);
  } else {
    console.log('\n✅ Stress Test Completed!');
    console.log('------------------------------------------------');
    console.log(`📊 Total Requests:      ${result.requests.total}`);
    console.log(`⏱️ Average Latency:     ${result.latency.average} ms`);
    console.log(`🚫 Errors/Timeouts:     ${result.errors + result.timeouts}`);
    console.log(`📉 99th Percentile:     ${result.latency.p99} ms`);
    console.log('------------------------------------------------');
  }
});

// تتبع التقدم
autocannon.track(instance, { renderProgressBar: true });
