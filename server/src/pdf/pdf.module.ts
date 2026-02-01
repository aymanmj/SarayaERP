// src/pdf/pdf.module.ts

import { Module, Global } from '@nestjs/common';
import { PdfService } from './pdf.service';

@Global() // لكي نستخدمه في أي مكان (Billing, Lab, etc.)
@Module({
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
