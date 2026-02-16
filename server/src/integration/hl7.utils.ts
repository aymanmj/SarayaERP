// src/integration/hl7.utils.ts

export const VT = String.fromCharCode(0x0b); // Start Block
export const FS = String.fromCharCode(0x1c); // End Block
export const CR = String.fromCharCode(0x0d); // Carriage Return

/**
 * تغليف الرسالة ببروتوكول MLLP
 */
export function wrapInMLLP(data: string): string {
  return `${VT}${data}${FS}${CR}`;
}

/**
 * دالة ذكية لاستخراج الرسائل من الـ Buffer
 * تتعامل مع الحالات التي تصل فيها الرسائل ملتصقة أو مجزأة
 */
export function extractMessagesFromBuffer(buffer: string): {
  messages: string[];
  remainingBuffer: string;
} {
  const messages: string[] = [];
  let currentBuffer = buffer;

  while (true) {
    const startIdx = currentBuffer.indexOf(VT);
    const endIdx = currentBuffer.indexOf(FS + CR);

    // إذا لم نجد علامة البداية أو النهاية، ننتظر المزيد من البيانات
    if (startIdx === -1 || endIdx === -1) {
      break;
    }

    // استخراج الرسالة النظيفة (بدون VT و FS+CR)
    if (endIdx > startIdx) {
      const rawMsg = currentBuffer.substring(startIdx + 1, endIdx);
      messages.push(rawMsg);
      // قص الجزء المعالج من البفر
      currentBuffer = currentBuffer.substring(endIdx + 2);
    } else {
      // حالة شاذة: علامة النهاية قبل البداية (بيانات فاسدة)، نتخلص من الجزء الفاسد
      currentBuffer = currentBuffer.substring(startIdx);
    }
  }

  return { messages, remainingBuffer: currentBuffer };
}

export function getHL7Date(date = new Date()): string {
  return date
    .toISOString()
    .replace(/[-T:.Z]/g, '')
    .slice(0, 14);
}

// دالة مساعدة لإنشاء ACK
export function createACK(
  originalMsg: string,
  type: 'AA' | 'AE' | 'AR' = 'AA',
  errorMessage?: string,
): string {
  const segments = originalMsg.split('\r'); // HL7 uses CR only usually inside message
  const msh = segments[0].split('|');
  const sendingApp = msh[2] || '';
  const sendingFac = msh[3] || '';
  const msgControlId = msh[9] || '';

  // بناء MSH للرد (نعكس المرسل والمستقبل)
  const ackMsh = `MSH|^~\\&|SARAYA|HIS|${sendingApp}|${sendingFac}|${getHL7Date()}||ACK^R01|ACK${Date.now()}|P|2.4`;
  const msa = `MSA|${type}|${msgControlId}${errorMessage ? `|${errorMessage}` : ''}`;

  return `${ackMsh}\r${msa}\r`;
}

