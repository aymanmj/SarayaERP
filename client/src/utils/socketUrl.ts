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
 *   - Browser at http://localhost:5173 → http://localhost:5173
 *   - Browser at http://192.168.1.100:8080 → http://192.168.1.100:8080
 *   - Browser at https://erp.hospital.com → https://erp.hospital.com
 */
export function getSocketUrl(): string {
  return window.location.origin;
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
