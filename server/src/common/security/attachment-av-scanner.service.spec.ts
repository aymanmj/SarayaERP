import * as net from 'node:net';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  AttachmentAvScannerService,
  buildEicarTestSignature,
  scanAttachmentBuffer,
} from './attachment-av-scanner.service';

function startMockClamdServer(
  handler: (payload: Buffer, socket: net.Socket) => void,
): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let state: 'HEADER' | 'LEN' | 'BODY' = 'HEADER';
      let buf = Buffer.alloc(0);
      let expectedChunkLen = 0;
      const received: Buffer[] = [];

      socket.on('data', (data: Buffer) => {
        buf = Buffer.concat([buf, data]);
        while (true) {
          if (state === 'HEADER') {
            const nullIdx = buf.indexOf(0);
            if (nullIdx === -1) return;
            buf = buf.subarray(nullIdx + 1);
            state = 'LEN';
          } else if (state === 'LEN') {
            if (buf.length < 4) return;
            expectedChunkLen = buf.readUInt32BE(0);
            buf = buf.subarray(4);
            if (expectedChunkLen === 0) {
              handler(Buffer.concat(received), socket);
              return;
            }
            state = 'BODY';
          } else {
            if (buf.length < expectedChunkLen) return;
            received.push(buf.subarray(0, expectedChunkLen));
            buf = buf.subarray(expectedChunkLen);
            state = 'LEN';
          }
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}

describe('AttachmentAvScannerService (SEC05 ClamAV INSTREAM)', () => {
  it('accepts clean PDF bytes in eicar_builtin mode', async () => {
    const service = new AttachmentAvScannerService();
    const res = await service.scanBuffer(
      Buffer.from('%PDF-1.4 clean medical report', 'utf8'),
      'report.pdf',
      { mode: 'eicar_builtin' },
    );
    expect(res.clean).toBe(true);
    expect(res.infected).toBe(false);
    expect(res.signature).toBeNull();
    expect(res.engine).toBe('eicar_builtin');
  });

  it('detects standard EICAR test signature embedded inside a PDF buffer', async () => {
    const infectedPdf = Buffer.from(
      `%PDF-1.4\n% ${buildEicarTestSignature()}\n%%EOF`,
      'ascii',
    );
    const res = await scanAttachmentBuffer(infectedPdf, {
      mode: 'eicar_builtin',
    });
    expect(res.clean).toBe(false);
    expect(res.infected).toBe(true);
    expect(res.signature).toBe('Eicar-Test-Signature');
  });

  it('streams chunks over TCP zINSTREAM to clamd and returns CLEAN on stream: OK', async () => {
    let receivedLen = 0;
    const { server, port } = await startMockClamdServer((payload, socket) => {
      receivedLen = payload.length;
      socket.end('stream: OK\0');
    });

    try {
      const bigCleanBuf = Buffer.alloc(140_000, 0x41);
      const res = await scanAttachmentBuffer(bigCleanBuf, {
        mode: 'clamd',
        host: '127.0.0.1',
        port,
        timeoutMs: 3000,
      });
      expect(receivedLen).toBe(140_000);
      expect(res.clean).toBe(true);
      expect(res.infected).toBe(false);
      expect(res.engine).toBe('clamd');
    } finally {
      server.close();
    }
  });

  it('detects clamd FOUND signature response', async () => {
    const { server, port } = await startMockClamdServer((_payload, socket) => {
      socket.end('stream: Win.Trojan.PDF-Exploit FOUND\0');
    });

    try {
      const res = await scanAttachmentBuffer(Buffer.from('%PDF-1.4 evil'), {
        mode: 'clamd',
        host: '127.0.0.1',
        port,
        timeoutMs: 3000,
      });
      expect(res.clean).toBe(false);
      expect(res.infected).toBe(true);
      expect(res.signature).toBe('Win.Trojan.PDF-Exploit');
    } finally {
      server.close();
    }
  });

  it('fails closed with 503 ServiceUnavailableException when clamd is unreachable', async () => {
    await expect(
      scanAttachmentBuffer(Buffer.from('%PDF-1.4 test'), {
        mode: 'clamd',
        host: '127.0.0.1',
        port: 1,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('fails closed with 503 when disabled mode is attempted in production without explicit override', async () => {
    await expect(
      scanAttachmentBuffer(Buffer.from('%PDF-1.4 test'), {
        mode: 'disabled',
        nodeEnv: 'production',
        allowUnscannedUploads: false,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
