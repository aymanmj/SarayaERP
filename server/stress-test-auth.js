const autocannon = require('autocannon');

// Config
const BASE_URL = 'http://localhost:3000';
const USERNAME = 'reception_user';
const PASSWORD = '123456';

async function main() {
  console.log('🔄 Setting up Stress Test Environment...');

  // 1. Login
  console.log('🔑 Logging in...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${loginRes.statusText}`);
  }
  const loginData = await loginRes.json();
  // console.log('Login Response:', JSON.stringify(loginData, null, 2));
  
  // Response is wrapped in { data: ... }
  const authPayload = loginData.data || loginData; 

  const token = authPayload.accessToken;
  const hospitalId = authPayload.user?.hospitalId; 
  
  if (!hospitalId) {
    console.error('Auth Payload:', authPayload);
    throw new Error('Could not extract hospitalId from user.');
  }

  console.log('✅ Logged in successfully. Hospital ID:', hospitalId);

// Helper to unwrap response
function unwrap(data) {
  return data.data || data;
}

  // 2. Get Doctor
  console.log('👨‍⚕️ Fetching Doctor...');
  const docsRes = await fetch(`${BASE_URL}/users/doctors-list`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const docsJson = await docsRes.json();
  const docs = unwrap(docsJson);
  
  if (!Array.isArray(docs)) {
      console.log('Doctors Response:', JSON.stringify(docsJson, null, 2));
      throw new Error('Doctors response is not an array');
  }

  if (docs.length === 0) throw new Error('No doctors found!');
  const doctorId = docs[0].id; // Use first doctor
  console.log(`✅ Using Doctor ID: ${doctorId}`);

  // 3. Create/Get Patient
  console.log('🏥 Preparing Patient...');
  // We'll Create a dummy patient for testing
  const patientPayload = {
    fullName: `Stress Test Patient ${Date.now()}`,
    mrn: `ST-${Date.now()}`,
    birthDate: '1990-01-01',
    gender: 'MALE',
    phone: '0910000000',
    hospitalId: hospitalId
  };
  
  const patRes = await fetch(`${BASE_URL}/patients`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(patientPayload)
  });
  
  const patJson = await patRes.json();
  const patientData = unwrap(patJson);
  const patientId = patientData.id;
  console.log(`✅ Using Patient ID: ${patientId}`);


  // 4. Run Stress Test
  console.log('\n🚀 STARTING AUTHENTICATED STRESS TEST...');
  
  const appointmentPayload = JSON.stringify({
    hospitalId,
    patientId,
    doctorId,
    scheduledStart: new Date().toISOString(),
    scheduledEnd: new Date(Date.now() + 30 * 60000).toISOString(),
    type: "IN_PERSON",
    isEmergency: false, 
    reason: "Stress Test Auto"
  });

  autocannon({
    url: BASE_URL,
    image: false, // Don't print ascii art
    connections: 20, // 20 concurrent
    duration: 10,
    method: 'POST',
    path: '/appointments',
    body: appointmentPayload,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, (err, result) => {
    if (err) {
      console.error(err);
    } else {
      console.log('\n✅ TEST COMPLETED');
      console.log('------------------------------------------------');
      console.log(`📊 Requests: ${result.requests.total} (Avg Latency: ${result.latency.average}ms)`);
      console.log(`✅ 2xx: ${result['2xx']}`);
      console.log(`🚫 4xx: ${result['4xx']} (Likely validation/limit errors)`);
      console.log(`🔥 5xx: ${result['5xx']}`);
      console.log('------------------------------------------------');
    }
  });
}

main().catch(console.error);
