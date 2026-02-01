/// <reference types="cypress" />
describe('Full ER Patient Journey', () => {
  const timestamp = new Date().getTime();
  const patientName = `Test Patient ${timestamp}`;
  const mrn = `MRN${timestamp}`;
  
  beforeEach(() => {
    // Assuming we have a way to bypass login or login via UI
    // tailored for the dev environment
      cy.viewport(1280, 720);
  });

  it('Complete Flow: Admission -> Triage -> Doctor -> Orders -> Billing -> Discharge', () => {
    // 1. Login
    cy.visit('/login');
    cy.get('input[name="username"]').type('admin'); // Adjust credential as needed
    cy.get('input[name="password"]').type('admin123');
    cy.get('button[type="submit"]').click();

    // Debug: Check if error appears
    cy.get('body').then(($body) => {
      if ($body.text().includes('بيانات الدخول غير صحيحة')) {
        throw new Error('Login failed: Invalid credentials');
      }
      if ($body.text().includes('تعذّر الاتصال بالسيرفر')) {
        throw new Error('Login failed: Server unreachable');
      }
    });

    // Verify Dashboard
    cy.url({ timeout: 10000 }).should('not.include', '/login');
    cy.contains('أهلاً', { timeout: 10000 }).should('be.visible');

    // 2. Create Patient via API (to ensure they exist)
    const patientData = {
      fullName: patientName,
      mrn: mrn,
      gender: 'MALE',
      dateOfBirth: '1990-01-01',
      phone: '0912345678'
    };
    
    // We need a valid token to make API requests, but in Cypress we can cheat by using the UI or assuming public API for dev
    // Or we use the UI to create patient if API is protected and we don't have token easily.
    // Let's use UI to create Patient first -> simpler for now.
    
    // A. Go to Patients Page
    cy.visit('/patients');
    cy.contains('تسجيل مريض جديد').click();
    cy.get('input[name="fullName"]').type(patientName);
    cy.get('input[name="nationalId"]').type(mrn);
    cy.get('input[name="phone"]').type('0912345678');
    cy.contains('حفظ البيانات').click();
    cy.contains('تم تسجيل المريض بنجاح').should('be.visible');

    // 3. Register/Admit Patient (Reception/ER)
    cy.visit('/appointments'); 
    cy.contains('تسجيل طوارئ').click(); 
    
    // Search for the patient we just created
    cy.get('input[placeholder="اسم، ملف، هاتف..."]').type(patientName);
    // Click the first result
    cy.contains(patientName).click();

    cy.get('textarea[placeholder="مثال: ألم شديد في الصدر، ضيق تنفس..."]').type('Severe headache and fever');
    cy.contains('تسجيل الحالة فوراً').click();

    // 4. Triage Assessment
    cy.visit('/triage');
    cy.contains(patientName).should('be.visible');
    cy.contains(patientName).click();
    
    // Should go to Triage Assessment
    cy.url().should('include', '/clinical/triage/assess/');

    // Fill Triage Assessment
    cy.get('textarea[name="chiefComplaint"]').type('Severe headache, high fever');
    cy.get('input[name="vitalSigns.temperature"]').type('39.5');
    cy.get('input[name="vitalSigns.heartRate"]').type('110');
    cy.get('input[name="vitalSigns.bloodPressureSystolic"]').type('140');
    cy.get('input[name="vitalSigns.bloodPressureDiastolic"]').type('90');
    cy.get('input[name="vitalSigns.oxygenSaturation"]').type('96');
    
    // Select Acuity (Click button for Level 2)
    cy.contains('مستوى 2').click();
    
    cy.contains('حفظ التقييم').click();
    
    // Should redirect back to Triage Dashboard
    cy.url().should('include', '/triage');

    // 5. Doctor Assignment (Go to Encounters List)
    cy.visit('/encounters');
    // Find row with patient name and click "Open File"
    cy.contains('tr', patientName).contains('فتح الملف').click();
    
    // Should go to Encounter Details
    cy.url().should('include', '/encounters/');

    // 4. Doctor Assignment
    cy.contains('تولي الحالة').click();
    cy.contains('تم تعيينك طبيباً للحالة').should('be.visible');

    // 5. Add Visit Note
    cy.get('textarea[placeholder="اكتب ملاحظاتك وتوصياتك هنا..."]').type('Patient has high temp (39C). Suspected infection.');
    cy.contains('حفظ').click();

    // 6. Order Lab Test (Simulated)
    cy.contains('المختبر').click();
    cy.contains('طلب تحاليل جديدة').should('be.visible');
    // Select a test from the list (Select first available test button in the list)
    cy.get('div.max-h-40 button').first().click(); 
    cy.contains('إرسال الطلب').click();
    
    // 7. Order Pharmacy (Simulated)
    cy.contains('الأدوية').click();
    cy.contains('وصفة طبية جديدة').should('be.visible');
    
    // Select first available drug from the dropdown
    cy.get('select').first().find('option').eq(1).then($option => {
      const val = $option.val();
      if (val) cy.get('select').first().select(val.toString());
    });

    cy.contains('حفظ وإرسال الوصفة').click();
    cy.contains('تم حفظ الوصفة').should('be.visible');

    // 8. Billing Check
    cy.contains('الفوترة').click();
    // Verify invoice exists or generate it
    cy.contains('إنشاء فاتورة').click();
    cy.contains('ISSUED').should('be.visible');

    // 9. Discharge
    cy.contains('خروج (Discharge)').click();
    cy.on('window:confirm', () => true); // Accept confirmation
    
    // Verify redirection to Encounters List or Triage
    cy.url().should('include', '/encounters');
    // Ideally verify encounter is closed or moved to history
  });
});
