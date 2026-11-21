import { spawn } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

type BrowserMessage = {
  id?: number;
  method?: string;
  result?: unknown;
  error?: unknown;
  params?: {
    requestId?: string;
    authChallenge?: { origin: string };
    response?: { url: string; status: number };
    errorText?: string;
  };
};

export async function verifyOhifBrowser(
  executable: string,
  viewer: URL,
  auth:
    | { username: string; password: string }
    | { staffToken: string; dicomRoot: string; trustedCertificate?: string },
  output: string,
  filename = 'ohif-cap13.png',
) {
  const profile = await mkdtemp(join(output, 'ohif-browser-'));
  const certificate =
    'trustedCertificate' in auth && auth.trustedCertificate
      ? new X509Certificate(auth.trustedCertificate)
      : undefined;
  const certificatePin =
    certificate &&
    createHash('sha256')
      .update(certificate.publicKey.export({ type: 'spki', format: 'der' }))
      .digest('base64');
  const browser = spawn(
    executable,
    [
      '--headless=new',
      '--no-first-run',
      '--disable-background-networking',
      '--disable-sync',
      '--remote-debugging-port=0',
      ...(certificatePin
        ? [`--ignore-certificate-errors-spki-list=${certificatePin}`]
        : []),
      `--user-data-dir=${profile}`,
      '--window-size=1440,900',
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  let launchError: Error | undefined;
  browser.once('error', (error) => {
    launchError = error;
  });
  let socket: WebSocket | undefined;
  try {
    let port: string | undefined;
    for (let retry = 0; retry < 80 && !port; retry++) {
      if (launchError) throw launchError;
      if (browser.exitCode !== null)
        throw new Error('OHIF browser exited early');
      const content = await readFile(
        join(profile, 'DevToolsActivePort'),
        'utf8',
      ).catch(() => '');
      port = content.split('\n')[0].trim() || undefined;
      if (!port) await delay(150);
    }
    if (!port || !/^\d+$/.test(port))
      throw new Error('Missing OHIF browser debugger port');
    const tabs = (await fetch(`http://127.0.0.1:${port}/json/list`).then(
      (response) => response.json(),
    )) as { type: string; webSocketDebuggerUrl: string }[];
    const tab = tabs.find(({ type }) => type === 'page');
    if (!tab) throw new Error('Missing browser tab for OHIF');
    const cdp = new WebSocket(tab.webSocketDebuggerUrl);
    socket = cdp;
    await new Promise<void>((resolve, reject) => {
      cdp.addEventListener('open', () => resolve(), { once: true });
      cdp.addEventListener('error', reject, { once: true });
    });
    let id = 0;
    const commands = new Map<number, (message: BrowserMessage) => void>();
    const send = <T = unknown>(method: string, params?: object) =>
      new Promise<T>((resolve, reject) => {
        const sequence = ++id;
        const timeout = setTimeout(() => {
          commands.delete(sequence);
          reject(new Error(`Browser command timed out: ${method}`));
        }, 8000);
        commands.set(sequence, (message) => {
          clearTimeout(timeout);
          if (message.error)
            reject(new Error(`Browser command failed: ${method}`));
          else resolve(message.result as T);
        });
        cdp.send(JSON.stringify({ id: sequence, method, params }));
      });
    let frameReceived = false;
    const studyUid = viewer.searchParams.get('StudyInstanceUIDs');
    if (!studyUid)
      throw new Error('Expected a specific DICOM study in the viewer URL');
    const archiveRequests: string[] = [];
    const pageRequests: string[] = [];
    const dicomRoot = 'dicomRoot' in auth ? auth.dicomRoot : '/dicom-web';
    let listenerError: unknown;
    cdp.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data)) as BrowserMessage;
      if (message.id) {
        commands.get(message.id)?.(message);
        commands.delete(message.id);
      } else if (message.method === 'Fetch.authRequired' && message.params) {
        const { requestId, authChallenge } = message.params;
        const authChallengeResponse =
          authChallenge?.origin === viewer.origin && 'username' in auth
            ? {
                response: 'ProvideCredentials',
                username: auth.username,
                password: auth.password,
              }
            : { response: 'CancelAuth' };
        void send('Fetch.continueWithAuth', {
          requestId,
          authChallengeResponse,
        }).catch((error) => {
          listenerError = error;
        });
      } else if (message.method === 'Fetch.requestPaused') {
        void send('Fetch.continueRequest', {
          requestId: message.params?.requestId,
        }).catch((error) => {
          listenerError = error;
        });
      } else if (
        message.method === 'Network.responseReceived' &&
        message.params?.response
      ) {
        const { url, status } = message.params.response;
        if (
          url.startsWith(viewer.origin) &&
          (status >= 400 || new URL(url).pathname === viewer.pathname)
        )
          pageRequests.push(`${status} ${new URL(url).pathname}`);
        if (url.startsWith(viewer.origin + dicomRoot + '/')) {
          archiveRequests.push(`${status} ${new URL(url).pathname}`);
          if (
            status === 200 &&
            new URL(url).pathname.startsWith(
              `${dicomRoot}/studies/${studyUid}/`,
            ) &&
            /\/frames\/1(?:\?|$)/.test(url)
          )
            frameReceived = true;
        }
      } else if (
        message.method === 'Network.loadingFailed' &&
        message.params?.errorText
      ) {
        pageRequests.push(message.params.errorText);
      }
    });
    await send('Network.enable');
    if ('staffToken' in auth) {
      await send('Network.setCookie', {
        name: 'Authentication',
        value: auth.staffToken,
        url: viewer.origin,
        path: '/',
        httpOnly: true,
        secure: viewer.protocol === 'https:',
        sameSite: 'Lax',
      });
    } else {
      await send('Fetch.enable', { handleAuthRequests: true });
    }
    await send('Page.navigate', { url: viewer.href });
    let canvasCount = 0;
    for (let retry = 0; retry < 75; retry++) {
      if (listenerError)
        throw new Error('Unable to continue an OHIF browser request', {
          cause: listenerError,
        });
      const evaluated = await send<{ result: { value?: number } }>(
        'Runtime.evaluate',
        {
          expression:
            "Array.from(document.querySelectorAll('canvas')).filter(c => c.width > 0 && c.height > 0).length",
          returnByValue: true,
        },
      );
      canvasCount = evaluated.result.value ?? 0;
      if (frameReceived && canvasCount > 0) break;
      await delay(300);
    }
    if (!frameReceived || !canvasCount)
      throw new Error(
        `OHIF browser did not render the frame. Page requests: ${pageRequests.join(', ')}. Archive requests: ${archiveRequests.join(', ')}`,
      );
    await delay(400);
    const screenshot = await send<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
    });
    await writeFile(
      join(output, filename),
      Buffer.from(screenshot.data, 'base64'),
    );
    return { canvasCount, frameReceived };
  } finally {
    socket?.close();
    if (browser.pid && browser.exitCode === null) {
      const stopped = once(browser, 'exit');
      browser.kill();
      await Promise.race([stopped, delay(3000)]);
    }
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}
