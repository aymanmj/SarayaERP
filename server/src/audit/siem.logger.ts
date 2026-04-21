import * as winston from 'winston';

const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'hash', 'hashedpassword'];

/**
 * دالة مساعدة لتنقيح وحجب البيانات الحساسة (Redaction)
 * يتم استخدامها لحماية بيانات المرضى أو أمن النظام قبل إرسالها إلى أنظمة المراقبة SIEM
 */
function redactObject(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }
  
  const redacted = { ...obj };
  for (const key in redacted) {
    if (Object.prototype.hasOwnProperty.call(redacted, key)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        redacted[key] = '[REDACTED_BY_SIEM]';
      } else {
        redacted[key] = redactObject(redacted[key]);
      }
    }
  }
  return redacted;
}

const redactFormat = winston.format((info) => {
  if (info.details) {
    info.details = redactObject(info.details);
  }
  if (info.oldValues) {
    info.oldValues = redactObject(info.oldValues);
  }
  if (info.newValues) {
    info.newValues = redactObject(info.newValues);
  }
  return info;
});

/**
 * مقبس ترحيل الحركات إلى سجلات المركز الأمني (SIEM).
 * يوجه البيانات إلى Console (stdout) ليتم التقاطها تلقائياً بـ Promtail أو FluentBit.
 */
export const siemLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    redactFormat(),
    winston.format.json() // إخراج بصيغة NDJSON (دقيقة وقابلة للتحليل آلياً)
  ),
  defaultMeta: { service: 'saraya-erp', stream: 'SiemAudit' },
  transports: [
    new winston.transports.Console()
  ],
});
