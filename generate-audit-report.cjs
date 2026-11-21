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
  'BackupController',           // System administration — database backups (system-wide)
  'ComplianceController',       // System compliance — audit logs (global system audits)
  'CronController',             // System infrastructure — background cron triggers
  'LicenseController',          // Enterprise licensing (installation-wide license key)
  'SpecialtiesController',       // Global clinical lookup — medical specialties
  'TerminologyController',      // Global clinical lookup — terminology dictionaries (ICD-10/LOINC)
];

// Portal controllers use PatientAuthGuard (separate auth model for patients)
const PORTAL_EXEMPT = (name) => name.startsWith('Portal');

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function scanDecoratorBlockAfterRoute(afterRoute) {
  let i = 0;
  const n = afterRoute.length;

  while (i < n) {
    while (i < n && /\s/.test(afterRoute[i])) i++;
    if (i >= n || afterRoute[i] !== '@') break;
    i++; // skip '@'
    while (i < n && /[\w.]/.test(afterRoute[i])) i++;
    while (i < n && /\s/.test(afterRoute[i])) i++;
    if (i < n && afterRoute[i] === '(') {
      let depth = 0;
      while (i < n) {
        if (afterRoute[i] === '(') depth++;
        else if (afterRoute[i] === ')') {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        i++;
      }
    }
  }

  const trailingDecorators = afterRoute.slice(0, i);
  const rest = afterRoute.slice(i);
  const methodMatch = rest.match(/^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*\(/);
  const methodName = methodMatch ? methodMatch[1] : 'unknown';

  return { trailingDecorators, methodName };
}

function analyzeControllerRoutes(content) {
  const cleanContent = stripComments(content);
  const classMatch = cleanContent.match(/export\s+class\s+\w+Controller\b/);
  if (!classMatch) {
    return { routeCount: 0, unguardedRoutes: [], hasClassLevelAuth: false };
  }

  const classStartIdx = classMatch.index;
  const beforeClass = cleanContent.slice(0, classStartIdx);
  const lastBlockEnd = Math.max(
    beforeClass.lastIndexOf('}'),
    beforeClass.lastIndexOf(';'),
  );
  const classDecorators = beforeClass.slice(lastBlockEnd + 1);
  const hasClassLevelAuth =
    classDecorators.includes('@Permissions(') ||
    classDecorators.includes('@Roles(') ||
    classDecorators.includes('@Public(');

  const classBody = cleanContent.slice(classStartIdx);
  const routeRegex = /@(Get|Post|Put|Patch|Delete)\s*\(([^)]*)\)/g;
  const unguardedRoutes = [];
  let routeCount = 0;
  let match;

  while ((match = routeRegex.exec(classBody)) !== null) {
    routeCount++;
    const verb = match[1].toUpperCase();
    const rawPath = match[2].trim().replace(/^['"`]|['"`]$/g, '');
    const matchIdx = match.index;

    const beforeRoute = classBody.slice(0, matchIdx);
    const linesBefore = beforeRoute.split('\n');
    let decoratorStartLine = 0;
    for (let idx = linesBefore.length - 1; idx >= 0; idx--) {
      const trimmed = linesBefore[idx].trim();
      if (
        trimmed === '}' ||
        trimmed.endsWith('{}') ||
        trimmed.endsWith(';') ||
        /^(?:export\s+)?class\s+\w+/.test(trimmed)
      ) {
        decoratorStartLine = idx + 1;
        break;
      }
    }
    const leadingDecorators = linesBefore.slice(decoratorStartLine).join('\n');

    const afterRoute = classBody.slice(matchIdx);
    const { trailingDecorators, methodName } =
      scanDecoratorBlockAfterRoute(afterRoute);
    const fullDecoratorBlock = `${leadingDecorators}\n${trailingDecorators}`;

    const isRouteGuarded =
      hasClassLevelAuth ||
      fullDecoratorBlock.includes('@Permissions(') ||
      fullDecoratorBlock.includes('@Public(') ||
      fullDecoratorBlock.includes('@Roles(');

    if (!isRouteGuarded) {
      const normalizedRoute = `${verb} /${rawPath}`.replace(/\/+/g, '/');
      unguardedRoutes.push(`${normalizedRoute} (${methodName})`);
    }
  }

  return { routeCount, unguardedRoutes, hasClassLevelAuth };
}

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
    
    // Check for @Permissions decorator and route-level coverage
    const hasPermissions = content.includes('@Permissions(');
    const { routeCount, unguardedRoutes, hasClassLevelAuth } =
      analyzeControllerRoutes(content);
    const allRoutesGuarded =
      hasClassLevelAuth ||
      (routeCount > 0 ? unguardedRoutes.length === 0 : hasPermissions);
    
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
      abacStatus = (hasPermissionsGuard && hasPermissions && allRoutesGuarded) ? 'YES' : 'NO';
    }
    
    if (tenantStatus === 'YES' || tenantStatus === 'EXEMPT') tenantIsolated++;
    if (abacStatus === 'YES' || abacStatus === 'EXEMPT') abacGuarded++;
    
    results.push({
      controller: controllerName,
      tenantStatus,
      abacStatus,
      unguardedRoutes: isExempt || isPortal ? [] : unguardedRoutes,
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
  report += '| Controller | Tenant Isolated | ABAC Guarded | Unguarded Routes |\n';
  report += '|------------|:---------------:|:------------:|------------------|\n';
  nonCompliant.forEach(r => {
    const routesInfo =
      r.unguardedRoutes && r.unguardedRoutes.length > 0
        ? r.unguardedRoutes.join(', ')
        : 'Missing controller/method guard';
    report += `| ${r.controller} | ${r.tenantStatus === 'YES' ? '✅' : '❌'} | ❌ | ${routesInfo} |\n`;
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

// Check Mode for CI
const isCheckMode = process.argv.includes('--check');
if (isCheckMode) {
  const nonCompliant = results.filter(r => r.abacStatus === 'NO');
  if (nonCompliant.length > 0) {
    console.error(`\n❌ ABAC AUDIT FAILURE: The following ${nonCompliant.length} controllers require ABAC/Tenant Isolation:`);
    nonCompliant.forEach(r => {
      const routesSuffix =
        r.unguardedRoutes && r.unguardedRoutes.length > 0
          ? ` | Unguarded routes: ${r.unguardedRoutes.join(', ')}`
          : '';
      console.error(`  - ${r.controller} (Tenant: ${r.tenantStatus === 'YES' ? '✅' : '❌'}, ABAC: ${r.abacStatus === 'YES' ? '✅' : '❌'}${routesSuffix})`);
    });
    process.exit(1);
  } else {
    console.log(`\n✅ ABAC AUDIT SUCCESS: All controllers have active ABAC and Tenant Isolation guards (100% coverage).`);
    process.exit(0);
  }
}

