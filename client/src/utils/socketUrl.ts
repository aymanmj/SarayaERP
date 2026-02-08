/**
 * Socket URL Utility
 * ==================
 * يحسب عنوان WebSocket تلقائياً من عنوان المتصفح الحالي
 * Automatically calculates WebSocket URL from current browser location
 * 
 * هذا الحل يعمل في أي بيئة:
 * - التطوير المحلي (localhost)
 * - الإنتاج (أي IP أو domain)
 * - مع أو بدون SSL
 */

/**
 * Get the WebSocket base URL based on current browser location
 * 
 * @returns The base URL for WebSocket connections
 * 
 * Examples:
 *   - Browser at http://localhost:5173 → http://localhost:3000
 *   - Browser at http://192.168.1.100 → http://192.168.1.100:3000
 *   - Browser at https://erp.hospital.com → https://erp.hospital.com
 */
export function getSocketUrl(): string {
  // In development with Vite proxy, we're at port 5173 but API is at 3000
  // In production via Nginx, we're at port 80/443 and API is proxied
  
  const { protocol, hostname, port } = window.location;
  
  // Determine if we're in development mode (Vite dev server)
  const isDevelopment = port === '5173' || port === '5174';
  
  if (isDevelopment) {
    // Development: API is at localhost:3000
    return `http://${hostname}:3000`;
  }
  
  // Production: Use same origin (Nginx proxies everything)
  // For WebSocket, we use the current protocol and hostname
  // Port 80/443 is implicit, no need to specify
  
  // If we're on a non-standard port (not 80/443), include it
  const portSuffix = port && port !== '80' && port !== '443' ? `:${port}` : '';
  
  // Use WSS for HTTPS, WS for HTTP
  // But socket.io handles this automatically, so we can use HTTP/HTTPS
  return `${protocol}//${hostname}${portSuffix}`;
}

/**
 * Get WebSocket URL with namespace
 * 
 * @param namespace - The socket.io namespace (e.g., '/nursing', '/notifications')
 * @returns Full WebSocket URL with namespace
 */
export function getSocketUrlWithNamespace(namespace: string): string {
  const baseUrl = getSocketUrl();
  // Ensure namespace starts with /
  const ns = namespace.startsWith('/') ? namespace : `/${namespace}`;
  return `${baseUrl}${ns}`;
}

/**
 * Debug: Log current socket configuration
 * Useful for troubleshooting connection issues
 */
export function logSocketConfig(): void {
  const { protocol, hostname, port, href } = window.location;
  console.log('🔌 Socket Configuration:');
  console.log('   Browser URL:', href);
  console.log('   Protocol:', protocol);
  console.log('   Hostname:', hostname);
  console.log('   Port:', port || '(default)');
  console.log('   Calculated Socket URL:', getSocketUrl());
}
