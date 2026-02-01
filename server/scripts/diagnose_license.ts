// Diagnostic script for License System 2.0

import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { LicenseService } from '../src/licensing/license.service';

async function bootstrap() {
  const logger = new Logger('Diagnostic');
  logger.log('🚀 Starting License Diagnostic...');

  // 1. Check Files
  const licensePath = path.join(process.cwd(), 'saraya.lic');
  const keyPath = path.join(process.cwd(), 'src/licensing/public.key');

  logger.log(`Checking files:`);
  logger.log(`- License File: ${fs.existsSync(licensePath) ? 'EXISTS' : 'MISSING'} (${licensePath})`);
  logger.log(`- Public Key: ${fs.existsSync(keyPath) ? 'EXISTS' : 'MISSING'} (${keyPath})`);

  // 2. Instantiate Service
  const service = new LicenseService();
  
  // Manually init (mocking OnModuleInit)
  logger.log('⏳ Initializing service...');
  try {
     await service.onModuleInit();
     logger.log('✅ Service Initialized.');
  } catch (e: any) {
     logger.error(`❌ Service Init Failed: ${e.message}`);
  }

  // Wait for async machine ID
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 3. Get Status
  logger.log('🔍 Checking license status...');
  try {
    const status = service.getStatus();
    logger.log('Status:', JSON.stringify(status, null, 2));
  } catch (e: any) {
    logger.error(`❌ Unexpected Error: ${e.message}`);
    logger.error(e.stack);
  }

  // 4. Check Machine ID
  logger.log(`📍 Machine ID: ${service.getMachineId()}`);

  // 5. Check details
  logger.log('📋 Details:', JSON.stringify(service.details, null, 2));
}

bootstrap();
