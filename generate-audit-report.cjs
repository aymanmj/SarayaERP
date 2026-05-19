const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'server', 'src');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

let totalControllers = 0;
let tenantIsolated = 0;
let abacGuarded = 0;
let results = [];

// Controllers that are intentionally exempt from ABAC/Tenant Isolation
const EXEMPT_CONTROLLERS = [
  'AppController',              // Root health/info endpoint
  'AuthController',             // Login/registration — pre-authentication
  'HealthController',           // Kubernetes/Docker health probes
  'CdsHooksController',         // CDS Hooks FHIR standard — external integration
  'FhirController',             // FHIR R4 standard — separate auth model
  'PortalTelegramController',   // Telegram webhook — called by Telegram API (no JWT)
];

// Portal controllers use PatientAuthGuard (separate auth model for patients)
const PORTAL_EXEMPT = (name) => name.startsWith('Portal');

walkDir(srcDir, function(filePath) {
  if (filePath.endsWith('.controller.ts') && !filePath.includes('.spec.')) {
    totalControllers++;
    const content = fs.readFileSync(filePath, 'utf8');
    
    const controllerNameMatch = content.match(/class (\w+Controller)/);
    const controllerName = controllerNameMatch ? controllerNameMatch[1] : path.basename(filePath);

    // Check Tenant Isolation
    const hasTenantIsolation = content.includes('user.hospitalId') || 
                                content.includes('@TenantId()') || 
                                content.includes('hospitalId') ||
                                content.includes('CurrentUser') ||
                                content.includes('CurrentPatient');
    
    // Check ABAC Guard (PermissionsGuard OR PatientAuthGuard for portal)
    const hasPermissionsGuard = content.includes('PermissionsGuard');
    const hasPatientGuard = content.includes('PatientAuthGuard');
    const hasAnyGuard = hasPermissionsGuard || hasPatientGuard;
    
    // Check for @Permissions decorator
    const hasPermissions = content.includes('@Permissions(');
    
    // Determine effective status
    const isExempt = EXEMPT_CONTROLLERS.includes(controllerName);
    const isPortal = PORTAL_EXEMPT(controllerName);
    
    let tenantStatus, abacStatus;
    
    if (isExempt) {
      tenantStatus = 'EXEMPT';
      abacStatus = 'EXEMPT';
    } else if (isPortal) {
      tenantStatus = hasTenantIsolation ? 'YES' : 'NO';
      abacStatus = hasPatientGuard ? 'YES' : 'NO';
    } else {
      tenantStatus = hasTenantIsolation ? 'YES' : 'NO';
      abacStatus = (hasPermissionsGuard && hasPermissions) ? 'YES' : 'NO';
    }
    
    if (tenantStatus === 'YES') tenantIsolated++;
    if (abacStatus === 'YES' || abacStatus === 'EXEMPT') abacGuarded++;
    
    results.push({
      controller: controllerName,
      tenantStatus,
      abacStatus,
    });
  }
});

// Sort: compliant first, then non-compliant, then exempt
results.sort((a, b) => {
  const order = { YES: 0, NO: 1, EXEMPT: 2 };
  const diff = (order[a.abacStatus] || 0) - (order[b.abacStatus] || 0);
  return diff !== 0 ? diff : a.controller.localeCompare(b.controller);
});

const reportPath = path.join(__dirname, 'audit_coverage_report.md');

const nonExemptTotal = results.filter(r => r.abacStatus !== 'EXEMPT').length;
const nonExemptABAC = results.filter(r => r.abacStatus === 'YES').length;
const nonExemptTenant = results.filter(r => r.tenantStatus === 'YES').length;

let report = '# ABAC & Tenant Isolation Coverage Report\n\n';
report += `**Generated:** ${new Date().toISOString().split('T')[0]}\n\n`;
report += `| Metric | Count | Percentage |\n`;
report += `|--------|-------|------------|\n`;
report += `| Total Controllers | ${totalControllers} | — |\n`;
report += `| ABAC Guarded | ${abacGuarded} | ${Math.round((abacGuarded/totalControllers)*100)}% |\n`;
report += `| Tenant Isolated | ${tenantIsolated} | ${Math.round((tenantIsolated/totalControllers)*100)}% |\n`;
report += `| Exempt (Auth/Health/FHIR) | ${results.filter(r => r.abacStatus === 'EXEMPT').length} | — |\n`;
report += `| **Effective ABAC Coverage** | **${nonExemptABAC}/${nonExemptTotal}** | **${Math.round((nonExemptABAC/nonExemptTotal)*100)}%** |\n\n`;

// Compliant controllers
report += '## Compliant Controllers\n\n';
report += '| Controller | Tenant Isolated | ABAC Guarded |\n';
report += '|------------|:---------------:|:------------:|\n';
results.filter(r => r.abacStatus === 'YES').forEach(r => {
  report += `| ${r.controller} | ${r.tenantStatus === 'YES' ? '✅' : '⚠️'} | ✅ |\n`;
});

// Non-compliant controllers
const nonCompliant = results.filter(r => r.abacStatus === 'NO');
if (nonCompliant.length > 0) {
  report += '\n## Requires Attention\n\n';
  report += '| Controller | Tenant Isolated | ABAC Guarded |\n';
  report += '|------------|:---------------:|:------------:|\n';
  nonCompliant.forEach(r => {
    report += `| ${r.controller} | ${r.tenantStatus === 'YES' ? '✅' : '❌'} | ❌ |\n`;
  });
}

// Exempt controllers
const exempt = results.filter(r => r.abacStatus === 'EXEMPT');
if (exempt.length > 0) {
  report += '\n## Exempt Controllers\n\n';
  report += '> These controllers are intentionally exempt from ABAC: authentication endpoints, health probes, and FHIR standard integrations.\n\n';
  report += '| Controller | Reason |\n';
  report += '|------------|--------|\n';
  exempt.forEach(r => {
    report += `| ${r.controller} | Pre-auth / Infrastructure |\n`;
  });
}

fs.writeFileSync(reportPath, report);
console.log(`Report generated at ${reportPath}`);
console.log(`\n=== ABAC GOVERNANCE SUMMARY ===`);
console.log(`Total: ${totalControllers} | ABAC: ${abacGuarded} (${Math.round((abacGuarded/totalControllers)*100)}%) | Tenant: ${tenantIsolated} (${Math.round((tenantIsolated/totalControllers)*100)}%)`);
console.log(`Effective (non-exempt): ${nonExemptABAC}/${nonExemptTotal} (${Math.round((nonExemptABAC/nonExemptTotal)*100)}%)`);
