// src/pdf/pdf.service.ts

import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor() {
    this.registerHelpers();
  }

  private registerHelpers() {
    handlebars.registerHelper('eq', (a, b) => a === b);
    handlebars.registerHelper('gt', (a, b) => Number(a) > Number(b));

    handlebars.registerHelper('formatMoney', (val) =>
      this.formatCurrency(Number(val)),
    );

    handlebars.registerHelper('formatCurrency', (val, currency = '') => {
      const formatted = this.formatCurrency(Number(val));
      return currency ? `${formatted} ${currency}` : formatted;
    });

    handlebars.registerHelper('formatDate', (val) => {
      if (!val) return '-';
      const date = new Date(val);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('ar-LY', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    handlebars.registerHelper('formatDateTime', (val) => {
      if (!val) return '-';
      const date = new Date(val);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleString('ar-LY', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    });

    handlebars.registerHelper('inc', (value) => parseInt(value) + 1);

    // Helper to handle objects and convert to string
    handlebars.registerHelper('toString', (val) => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });

    // Helper to handle numbers and ensure they're numbers
    handlebars.registerHelper('toNumber', (val) => {
      if (val === null || val === undefined) return 0;
      return Number(val);
    });
  }

  // دالة مساعدة لتنسيق العملة
  private formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(value);
  }

  /**
   * توليد QR Code بصيغة Base64
   */
  private async generateQRCode(text: string): Promise<string> {
    try {
      return await QRCode.toDataURL(text);
    } catch (err) {
      this.logger.error('Failed to generate QR', err);
      return '';
    }
  }

  async generatePdf(templateName: string, data: any): Promise<Buffer> {
    // 1. تجهيز بيانات QR Code
    const qrContent = JSON.stringify({
      Hospital: data.hospitalName,
      Date: data.invoiceDate,
      Total: data.netAmount,
      InvoiceNo: data.invoiceId,
    });

    const qrCodeImage = await this.generateQRCode(qrContent);

    // 2. إطلاق المتصفح
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();

      // Robust template path resolution
      const templateFilename = `${templateName}.hbs`;
      const possiblePaths = [
        // 1. Relative to current file (standard for most builds)
        path.join(__dirname, 'templates', templateFilename),
        // 2. Relative to src/pdf (if __dirname is in dist/src/pdf)
        path.join(process.cwd(), 'dist/src/pdf/templates', templateFilename),
        // 3. Relative to dist/pdf (if src was flattened)
        path.join(process.cwd(), 'dist/pdf/templates', templateFilename),
        // 4. Source path (fallback for local dev / ts-node)
        path.join(process.cwd(), 'src/pdf/templates', templateFilename),
      ];

      let templatePath = '';
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          templatePath = p;
          this.logger.log(`Found template at: ${templatePath}`);
          break;
        }
      }

      if (!templatePath) {
        this.logger.error(`Template not found. Checked paths: ${JSON.stringify(possiblePaths)}`);
        throw new Error(`Template file not found: ${templateFilename}`);
      }

      const templateHtml = fs.readFileSync(templatePath, 'utf8');
      const template = handlebars.compile(templateHtml);

      // Helpers are registered in constructor

      // دمج البيانات مع صورة الـ QR
      const finalHtml = template({
        ...data,
        qrCode: qrCodeImage,
      });

      await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '15mm', left: '10mm', right: '10mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="font-size: 8px; width: 100%; text-align: center; color: #555; border-top: 1px solid #ddd; padding-top: 5px; font-family: sans-serif;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
            | System: Saraya ERP - Professional Healthcare Solutions
          </div>
        `,
      });

      // ✅ حل مشكلة Type 'Uint8Array' is missing properties from 'Buffer'
      return Buffer.from(pdfBuffer);
    } catch (error) {
      this.logger.error('Error generating PDF', error);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }
}

// // src/pdf/pdf.service.ts

// import { Injectable, Logger } from '@nestjs/common';
// import * as puppeteer from 'puppeteer';
// import * as handlebars from 'handlebars';
// import * as fs from 'fs';
// import * as path from 'path';

// @Injectable()
// export class PdfService {
//   private readonly logger = new Logger(PdfService.name);

//   /**
//    * توليد ملف PDF بناءً على قالب HTML وبيانات
//    * @param templateName اسم ملف القالب (بدون الامتداد)
//    * @param data البيانات المراد حقنها في القالب
//    * @returns Buffer (ملف الـ PDF)
//    */
//   async generatePdf(templateName: string, data: any): Promise<Buffer> {
//     const browser = await puppeteer.launch({
//       headless: true,
//       args: ['--no-sandbox', '--disable-setuid-sandbox'], // ضروري لبيئات السيرفر والـ Docker
//     });

//     try {
//       const page = await browser.newPage();

//       // 1. قراءة القالب
//       // سنفترض وجود مجلد 'templates' في جذر المشروع أو src
//       const templatePath = path.join(
//         process.cwd(),
//         'src/pdf/templates',
//         `${templateName}.hbs`,
//       );
//       const templateHtml = fs.readFileSync(templatePath, 'utf8');

//       // 2. دمج البيانات مع القالب (Compilation)
//       const template = handlebars.compile(templateHtml);

//       // دالة مساعدة لتنسيق الأرقام داخل القالب
//       handlebars.registerHelper('formatMoney', (val) => {
//         return Number(val).toLocaleString('en-US', {
//           minimumFractionDigits: 3,
//         });
//       });
//       handlebars.registerHelper('formatDate', (val) => {
//         if (!val) return '-';
//         return new Date(val).toLocaleDateString('ar-LY');
//       });

//       const finalHtml = template(data);

//       // 3. تحويل الـ HTML إلى PDF
//       await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

//       const pdfBuffer = await page.pdf({
//         format: 'A4',
//         printBackground: true, // لطباعة الألوان والخلفيات
//         margin: {
//           top: '20mm',
//           bottom: '20mm',
//           left: '10mm',
//           right: '10mm',
//         },
//       });

//       return Buffer.from(pdfBuffer);
//     } catch (error) {
//       this.logger.error('Error generating PDF', error);
//       throw error;
//     } finally {
//       await browser.close();
//     }
//   }
// }
