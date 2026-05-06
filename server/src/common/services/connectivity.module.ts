// ============================================
// ConnectivityModule — Internet Status Monitor
// ============================================
// يراقب حالة الاتصال بالإنترنت ويوفر ConnectivityService
// كـ Global Module لجميع الوحدات الأخرى

import { Module, Global } from '@nestjs/common';
import { ConnectivityService } from './connectivity.service';

@Global()
@Module({
  providers: [ConnectivityService],
  exports: [ConnectivityService],
})
export class ConnectivityModule {}
