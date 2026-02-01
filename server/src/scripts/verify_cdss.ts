import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CDSSService } from '../cdss/cdss.service';

async function bootstrap() {
  console.log('🚀 Starting CDSS Verification...');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'], // Reduce noise
  });

  const cdssService = app.get(CDSSService);

  console.log('\n--- 1. Testing Vitals Check ---');
  const normalVitals = {
    hospitalId: 1, // Mock
    encounterId: 1, // Mock
    patientId: 1,
    bpSystolic: 120,
    bpDiastolic: 80,
    temperature: 37,
    o2Sat: 98,
    pulse: 75
  };
  console.log('Testing Normal Vitals:', normalVitals);
  const res1 = await cdssService.checkVitalsAndAlert(normalVitals);
  console.log('Result:', res1.alerts.length === 0 ? '✅ No Alerts (Pass)' : '❌ Unexpected Alerts: ' + JSON.stringify(res1.alerts));

  const criticalVitals = {
    hospitalId: 1,
    encounterId: 1,
    patientId: 1,
    bpSystolic: 180, // Hypertensive Crisis
    bpDiastolic: 120,
    temperature: 40, // High Fever
    o2Sat: 85, // Hypoxia
    pulse: 75
  };
  console.log('\nTesting Critical Vitals:', criticalVitals);
  const res2 = await cdssService.checkVitalsAndAlert(criticalVitals);
  if (res2.alerts.length > 0) {
    console.log('✅ Critical Alerts Detected:');
    res2.alerts.forEach(a => console.log(`   - [${a.severity}] ${a.message}`));
  } else {
    console.log('❌ Failed to detect critical vitals!');
  }


  console.log('\n--- 2. Testing Lab Results Check ---');
  // High Glucose
  const glucoseCheck = {
    hospitalId: 1,
    patientId: 1,
    encounterId: 1,
    testCode: 'FBS',
    value: 500, // Very High
    unit: 'mg/dL'
  };
  console.log(`Testing Lab Result: ${glucoseCheck.testCode} = ${glucoseCheck.value}`);
  const res3 = await cdssService.checkLabResultAndAlert(glucoseCheck);
  if (res3.alert) {
     console.log('✅ Alert Detected:');
     console.log(`   - [${res3.alert.severity}] ${res3.alert.message}`);
  } else {
     console.log('❌ Failed to detect high glucose!');
  }

  // Normal Glucose
   const normalGlucose = {
    hospitalId: 1,
    patientId: 1,
    encounterId: 1,
    testCode: 'FBS',
    value: 90, 
    unit: 'mg/dL'
  };
  console.log(`Testing Lab Result: ${normalGlucose.testCode} = ${normalGlucose.value}`);
  const res4 = await cdssService.checkLabResultAndAlert(normalGlucose);
  console.log('Result:', res4.alert === null ? '✅ No Alerts (Pass)' : '❌ Unexpected Alert');


  console.log('\n--- 3. Testing Drug Interactions ---');
  const drugPairs = ['Warfarin', 'Aspirin'];
  console.log('Testing Interaction:', drugPairs);
  const res5 = await cdssService.checkDrugInteractions(drugPairs);
  console.log('Result:', JSON.stringify(res5, null, 2));
  
  console.log('\n✅ Verification Complete.');
  await app.close();
}

bootstrap().catch(err => {
  console.error('Available', err);
  process.exit(1);
});
