const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../server/src');

function getFiles(dir, files_ = []) {
  const files = fs.readdirSync(dir);
  for (const i in files) {
    const name = path.join(dir, files[i]);
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files_);
    } else {
      files_.push(name);
    }
  }
  return files_;
}

const controllerFiles = getFiles(srcDir).filter(f => f.endsWith('.controller.ts'));

let failed = false;
console.log(`🔍 Scanning ${controllerFiles.length} NestJS controllers for tenant isolation & security guards...\n`);

for (const file of controllerFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const basename = path.basename(file);
  
  // Skip AppController, HealthController, and FhirController as they are public or have specialized OAuth flows
  if (basename === 'app.controller.ts' || basename === 'health.controller.ts' || basename === 'fhir.controller.ts') {
    console.log(`ℹ️ Skipping public/system/specialized controller: ${basename}`);
    continue;
  }
  
  // Find all methods decorated with @Get, @Post, @Put, @Delete, @Patch
  const routeMethods = [];
  const methodRegex = /@(Get|Post|Put|Delete|Patch)\s*\([^)]*\)\s*(?:async\s+)?(\w+)/g;
  let match;
  while ((match = methodRegex.exec(content)) !== null) {
    routeMethods.push({ decorator: match[1], name: match[2], index: match.index });
  }
  
  if (routeMethods.length > 0) {
    let hasClassLevelGuard = false;
    
    // Find the actual controller class declaration
    const controllerClassMatch = /class\s+\w+Controller/i.exec(content);
    if (controllerClassMatch) {
      const classIndex = controllerClassMatch.index;
      // Get the preceding 400 characters (where class decorators are located)
      const precedingText = content.substring(Math.max(0, classIndex - 400), classIndex);
      if (precedingText.includes('@UseGuards')) {
        hasClassLevelGuard = true;
      }
    }
    
    if (!hasClassLevelGuard) {
      // Check individual methods
      const unshieldedMethods = [];
      for (const method of routeMethods) {
        // Look at the text before the method's decorator to see if it has a guard or @Public
        const decoratorIndex = method.index;
        const searchArea = content.substring(Math.max(0, decoratorIndex - 250), decoratorIndex);
        const hasMethodGuard = /@UseGuards/.test(searchArea) || /@Public/.test(searchArea);
        
        if (!hasMethodGuard) {
          unshieldedMethods.push(`${method.decorator}() ${method.name}`);
        }
      }
      
      if (unshieldedMethods.length > 0) {
        console.error(`❌ Security Violation in [${basename}]: Missing class-level guard and has unshielded method(s): ${unshieldedMethods.join(', ')}`);
        failed = true;
        continue;
      }
    }
    
    // Check for permissions (RBAC/ABAC)
    if (!hasClassLevelGuard) {
       // Methods permissions check
       const unpermissionedMethods = [];
       for (const method of routeMethods) {
         const decoratorIndex = method.index;
         const searchArea = content.substring(Math.max(0, decoratorIndex - 250), decoratorIndex);
         const hasMethodPermission = /@Permissions/.test(searchArea) || /@FhirScope/.test(searchArea) || /@Public/.test(searchArea);
         if (!hasMethodPermission) {
           unpermissionedMethods.push(`${method.decorator}() ${method.name}`);
         }
       }
       if (unpermissionedMethods.length > 0) {
         console.warn(`⚠️ Warning in [${basename}]: Unshielded routes missing explicit permissions (@Permissions / @FhirScope): ${unpermissionedMethods.join(', ')}`);
       }
    } else {
       // Class has guard. Check if it imports Permissions or FhirScope or if it is public
       const hasPermissions = content.includes('@Permissions') || content.includes('@FhirScope') || content.includes('@Public');
       if (!hasPermissions && !basename.includes('auth')) {
         console.warn(`⚠️ Warning in [${basename}]: Class-level guard present, but no @Permissions or @FhirScope decorators found. Ensure route-level check exists.`);
       }
    }
  }
}

if (failed) {
  console.error('\n❌ Tenant Isolation & Security Verification FAILED. Please shield all controllers.');
  process.exit(1);
} else {
  console.log('\n✅ Tenant Isolation & Security Verification Passed successfully.');
  process.exit(0);
}
