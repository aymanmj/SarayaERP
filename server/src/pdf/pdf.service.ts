// src/pdf/pdf.service.ts

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';

@Injectable()
export class PdfService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser: puppeteer.Browser | null = null;

  constructor() {
    this.registerHelpers();
  }

  // 1. تشغيل المتصفح مرة واحدة عند بدء تشغيل النظام
  async onModuleInit() {
    this.logger.log('🚀 Initializing PDF Service (Headless Chrome)...');
    await this.launchBrowser();
  }

  // 2. إغلاق المتصفح عند إيقاف النظام لتنظيف الموارد
  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      this.logger.log('🛑 PDF Service stopped.');
    }
  }

  private async launchBrowser() {
    try {
      this.browser = await puppeteer.launch({
        headless: true, // الوضع الجديد
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // مهم جداً في بيئة Docker لتقليل استهلاك الذاكرة
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
        ],
      });
      this.logger.log('✅ PDF Browser Instance Launched.');
    } catch (error) {
      this.logger.error('❌ Failed to launch browser', error);
    }
  }

  private registerHelpers() {
    handlebars.registerHelper('eq', (a, b) => a === b);
    handlebars.registerHelper('gt', (a, b) => Number(a) > Number(b));

    handlebars.registerHelper('formatCurrency', (val, currency = 'LYD') => {
      if (val === undefined || val === null) return '0.000';
      return (
        new Intl.NumberFormat('en-US', {
          style: 'decimal',
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        }).format(Number(val)) +
        ' ' +
        currency
      );
    });

    handlebars.registerHelper('formatDate', (val) => {
      if (!val) return '-';
      const d = new Date(val);
      if (isNaN(d.getTime())) return '-';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}/${mm}/${dd}`;
    });

    handlebars.registerHelper('formatDateTime', (val) => {
      if (!val) return '-';
      const d = new Date(val);
      if (isNaN(d.getTime())) return '-';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
    });

    handlebars.registerHelper('inc', (value) => parseInt(value) + 1);

    handlebars.registerHelper('formatMoney', (val) => {
      if (val === undefined || val === null) return '0.000';
      return new Intl.NumberFormat('en-US', {
        style: 'decimal',
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }).format(Number(val));
    });

    handlebars.registerHelper('toString', (val) => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });

    handlebars.registerHelper('toNumber', (val) => {
      if (val === null || val === undefined) return 0;
      return Number(val);
    });
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

  /**
   * الدالة الرئيسية لتوليد PDF
   */
  async generatePdf(templateName: string, data: any): Promise<Buffer> {
    // إعادة تشغيل المتصفح إذا انهار لأي سبب
    if (!this.browser || !this.browser.isConnected()) {
      this.logger.warn('⚠️ Browser disconnected, relaunching...');
      await this.launchBrowser();
    }

    // 1. تجهيز البيانات والـ QR
    const qrContent = JSON.stringify({
      Hospital: data.hospitalName || 'Saraya ERP',
      Date: data.invoiceDate || new Date().toISOString(),
      Ref: data.invoiceId || data.documentId,
      Total: data.netAmount || data.totalAmount,
    });

    const qrCodeImage = await this.generateQRCode(qrContent);

    // 2. قراءة القالب (Template)
    // تحسين مسار القوالب ليعمل في التطوير والإنتاج
    const templateFilename = `${templateName}.hbs`;
    const possiblePaths = [
      path.join(process.cwd(), 'src/pdf/templates', templateFilename), // Dev
      path.join(process.cwd(), 'dist/pdf/templates', templateFilename), // Prod
      path.join(__dirname, 'templates', templateFilename), // Fallback
    ];

    const templatePath = possiblePaths.find((p) => fs.existsSync(p));

    if (!templatePath) {
      this.logger.error(`Template not found: ${templateName}`);
      throw new Error(`Template ${templateName} not found`);
    }

    const templateHtml = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateHtml);
    const finalHtml = template({ ...data, qrCode: qrCodeImage });

    // 3. إنشاء صفحة جديدة داخل المتصفح المفتوح مسبقاً
    let page: puppeteer.Page | null = null;
    try {
      if (!this.browser) throw new Error('Browser not initialized');

      page = await this.browser.newPage();

      // تحسين الأداء: تعطيل تحميل الصور الخارجية والخطوط غير الضرورية إذا أردت
      // await page.setRequestInterception(true);
      // page.on('request', (req) => {
      //   if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.continue();
      //   else req.continue();
      // });

      await page.setContent(finalHtml, {
        waitUntil: 'load', // Changed from networkidle0 to load to speed up rendering.
        timeout: 15000, // Reduced timeout since 'load' is faster
      });

      // Define default options (A4 for invoices)
      let pdfOptions: puppeteer.PDFOptions = {
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '15mm', left: '10mm', right: '10mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="font-size: 8px; width: 100%; text-align: center; color: #555; font-family: sans-serif;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
            - Generated by Saraya ERP
          </div>
        `,
      };

      // Override options if it's a thermal booking receipt (80mm width)
      if (templateName === 'booking-receipt') {
        pdfOptions = {
          width: '80mm',
          height: '200mm', // A typical length, though often continuous
          printBackground: true,
          margin: { top: '0', bottom: '0', left: '0', right: '0' },
          displayHeaderFooter: false,
        };
      }

      const pdfBuffer = await page.pdf(pdfOptions);

      return Buffer.from(pdfBuffer);
    } catch (error) {
      this.logger.error('Error generating PDF', error);
      throw error;
    } finally {
      // 4. إغلاق الصفحة فقط (وليس المتصفح) لتوفير الموارد
      if (page) await page.close();
    }
  }
}

// // src/pdf/pdf.service.ts

// import { Injectable, Logger } from '@nestjs/common';
// import * as puppeteer from 'puppeteer';
// import * as handlebars from 'handlebars';
// import * as fs from 'fs';
// import * as path from 'path';
// import * as QRCode from 'qrcode';

// @Injectable()
// export class PdfService {
//   private readonly logger = new Logger(PdfService.name);

//   constructor() {
//     this.registerHelpers();
//   }

//   private registerHelpers() {
//     handlebars.registerHelper('eq', (a, b) => a === b);
//     handlebars.registerHelper('gt', (a, b) => Number(a) > Number(b));

//     handlebars.registerHelper('formatMoney', (val) =>
//       this.formatCurrency(Number(val)),
//     );

//     handlebars.registerHelper('formatCurrency', (val, currency = '') => {
//       const formatted = this.formatCurrency(Number(val));
//       return currency ? `${formatted} ${currency}` : formatted;
//     });

//     handlebars.registerHelper('formatDate', (val) => {
//       if (!val) return '-';
//       const date = new Date(val);
//       if (isNaN(date.getTime())) return '-';
//       return date.toLocaleDateString('ar-LY', {
//         year: 'numeric',
//         month: 'long',
//         day: 'numeric',
//       });
//     });

//     handlebars.registerHelper('formatDateTime', (val) => {
//       if (!val) return '-';
//       const date = new Date(val);
//       if (isNaN(date.getTime())) return '-';
//       return date.toLocaleString('ar-LY', {
//         year: 'numeric',
//         month: '2-digit',
//         day: '2-digit',
//         hour: '2-digit',
//         minute: '2-digit',
//       });
//     });

//     handlebars.registerHelper('inc', (value) => parseInt(value) + 1);

//     // Helper to handle objects and convert to string
//     handlebars.registerHelper('toString', (val) => {
//       if (val === null || val === undefined) return '';
//       if (typeof val === 'object') return JSON.stringify(val);
//       return String(val);
//     });

//     // Helper to handle numbers and ensure they're numbers
//     handlebars.registerHelper('toNumber', (val) => {
//       if (val === null || val === undefined) return 0;
//       return Number(val);
//     });
//   }

//   // دالة مساعدة لتنسيق العملة
//   private formatCurrency(value: number) {
//     return new Intl.NumberFormat('en-US', {
//       style: 'decimal',
//       minimumFractionDigits: 3,
//       maximumFractionDigits: 3,
//     }).format(value);
//   }

//   /**
//    * توليد QR Code بصيغة Base64
//    */
//   private async generateQRCode(text: string): Promise<string> {
//     try {
//       return await QRCode.toDataURL(text);
//     } catch (err) {
//       this.logger.error('Failed to generate QR', err);
//       return '';
//     }
//   }

//   async generatePdf(templateName: string, data: any): Promise<Buffer> {
//     // 1. تجهيز بيانات QR Code
//     const qrContent = JSON.stringify({
//       Hospital: data.hospitalName,
//       Date: data.invoiceDate,
//       Total: data.netAmount,
//       InvoiceNo: data.invoiceId,
//     });

//     const qrCodeImage = await this.generateQRCode(qrContent);

//     // 2. إطلاق المتصفح
//     const browser = await puppeteer.launch({
//       headless: true,
//       args: ['--no-sandbox', '--disable-setuid-sandbox'],
//     });

//     try {
//       const page = await browser.newPage();

//       // Robust template path resolution
//       const templateFilename = `${templateName}.hbs`;
//       const possiblePaths = [
//         // 1. Relative to current file (standard for most builds)
//         path.join(__dirname, 'templates', templateFilename),
//         // 2. Relative to src/pdf (if __dirname is in dist/src/pdf)
//         path.join(process.cwd(), 'dist/src/pdf/templates', templateFilename),
//         // 3. Relative to dist/pdf (if src was flattened)
//         path.join(process.cwd(), 'dist/pdf/templates', templateFilename),
//         // 4. Source path (fallback for local dev / ts-node)
//         path.join(process.cwd(), 'src/pdf/templates', templateFilename),
//       ];

//       let templatePath = '';
//       for (const p of possiblePaths) {
//         if (fs.existsSync(p)) {
//           templatePath = p;
//           this.logger.log(`Found template at: ${templatePath}`);
//           break;
//         }
//       }

//       if (!templatePath) {
//         this.logger.error(`Template not found. Checked paths: ${JSON.stringify(possiblePaths)}`);
//         throw new Error(`Template file not found: ${templateFilename}`);
//       }

//       const templateHtml = fs.readFileSync(templatePath, 'utf8');
//       const template = handlebars.compile(templateHtml);

//       // Helpers are registered in constructor

//       // دمج البيانات مع صورة الـ QR
//       const finalHtml = template({
//         ...data,
//         qrCode: qrCodeImage,
//       });

//       await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

//       const pdfBuffer = await page.pdf({
//         format: 'A4',
//         printBackground: true,
//         margin: { top: '10mm', bottom: '15mm', left: '10mm', right: '10mm' },
//         displayHeaderFooter: true,
//         headerTemplate: '<div></div>',
//         footerTemplate: `
//           <div style="font-size: 8px; width: 100%; text-align: center; color: #555; border-top: 1px solid #ddd; padding-top: 5px; font-family: sans-serif;">
//             Page <span class="pageNumber"></span> of <span class="totalPages"></span>
//             | System: Saraya ERP - Professional Healthcare Solutions
//           </div>
//         `,
//       });

//       // ✅ حل مشكلة Type 'Uint8Array' is missing properties from 'Buffer'
//       return Buffer.from(pdfBuffer);
//     } catch (error) {
//       this.logger.error('Error generating PDF', error);
//       throw error;
//     } finally {
//       if (browser) await browser.close();
//     }
//   }
// }
