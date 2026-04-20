import http from 'k6/http';
import { check, sleep } from 'k6';

// Global variables for configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const FHIR_URL = __ENV.FHIR_URL || 'http://localhost:3000/api/fhir';
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN || 'your_super_secret_jwt_token_here';

export let options = {
    stages: [
        { duration: '30s', target: 50 },  // Ramp up to 50 users over 30 seconds
        { duration: '1m', target: 50 },   // Stay at 50 users for 1 minute
        { duration: '30s', target: 100 }, // Ramp up to 100 users over 30 seconds
        { duration: '1m', target: 100 },  // Stay at 100 users for 1 minute
        { duration: '30s', target: 0 },   // Ramp down to 0 users
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
        http_req_failed: ['rate<0.01'],   // Error rate must be less than 1%
    },
};

export default function () {
    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'x-hospital-id': '1'
        },
    };

    // 1. Simulate reading system analytics / dashboard config (Typical Gateway Load)
    let resAnalytics = http.get(`${BASE_URL}/api/analytics/dashboard-metrics`, params);
    check(resAnalytics, {
        'Analytics status was 200/401/404': (r) => [200, 401, 404].includes(r.status), // Allowing 401/404 out of the box if no seed
        'Analytics time < 300ms': (r) => r.timings.duration < 300,
    });
    
    sleep(1);

    // 2. Simulate User hitting FHIR Patient Resource (Interoperability Load)
    let resFhirPatient = http.get(`${FHIR_URL}/Patient?_count=10`, params);
    check(resFhirPatient, {
        'FHIR Patient status 200/401/404': (r) => [200, 401, 404].includes(r.status),
        'FHIR Patient time < 400ms': (r) => r.timings.duration < 400,
    });
    
    sleep(1);

    // 3. Simulate hitting FHIR Observation Resource (Vitals/Lab Load)
    let resFhirObservation = http.get(`${FHIR_URL}/Observation?category=vital-signs`, params);
    check(resFhirObservation, {
        'FHIR Observation status 200/401/404': (r) => [200, 401, 404].includes(r.status),
        'FHIR Observation time < 400ms': (r) => r.timings.duration < 400,
    });

    sleep(1);
}
