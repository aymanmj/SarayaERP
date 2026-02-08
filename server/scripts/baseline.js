const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const migrationsDir = path.join(__dirname, '../prisma/migrations');

async function baseline() {
  console.log('🔄 Starting Migration Baseline...');
  
  if (!fs.existsSync(migrationsDir)) {
    console.error('❌ Migrations directory not found!');
    process.exit(1);
  }

  // Get all migration directories
  const migrations = fs.readdirSync(migrationsDir)
    .filter(item => fs.statSync(path.join(migrationsDir, item)).isDirectory())
    .filter(item => item !== 'migration_lock.toml')
    .sort(); // Ensure chronological order

  console.log(`Found ${migrations.length} migrations.`);

  let appliedCount = 0;
  let failedCount = 0;

  for (const migration of migrations) {
    console.log(`👉 Resolving: ${migration}...`);
    try {
      // Use --applied to mark it as already executed
      execSync(`npx prisma migrate resolve --applied "${migration}"`, { 
        stdio: 'pipe', // Hide output unless error to reduce noise
        encoding: 'utf8' 
      });
      console.log(`   ✅ Marked as applied.`);
      appliedCount++;
    } catch (error) {
      const msg = error.message || error.toString();
      if (msg.includes('P3008')) {
           console.log(`   ⚠️  Already applied (P3008). Skipping.`);
           appliedCount++; // Count as success
      } else {
           console.error(`   ❌ Failed to resolve ${migration}:`);
           console.error(msg);
           failedCount++;
      }
    }
  }

  console.log('---------------------------------------------------');
  console.log(`🏁 Baseline Complete.`);
  console.log(`✅ Applied/Skipped: ${appliedCount}`);
  console.log(`❌ Failed:          ${failedCount}`);
  
  if (failedCount === 0) {
      console.log('🎉 Database is now successfully baselined! You can run "migrate deploy" safely.');
      process.exit(0);
  } else {
      console.error('⚠️ Some migrations failed to resolve. Check logs.');
      process.exit(1);
  }
}

baseline();
