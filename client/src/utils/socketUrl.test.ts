import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSocketUrl, getSocketUrlWithNamespace } from './socketUrl';

describe('socketUrl', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // We need to mock window.location which is read-only
    // Use Object.defineProperty to override
  });

  afterEach(() => {
    // Restore
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  function mockLocation(overrides: Partial<Location>) {
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        protocol: 'http:',
        hostname: 'localhost',
        port: '',
        href: '',
        pathname: '/',
        ...overrides,
      },
      writable: true,
      configurable: true,
    });
  }

  // ─── getSocketUrl ──────────────────────────────────────────
  describe('getSocketUrl', () => {
    it('should return localhost:3000 in development (port 5173)', () => {
      mockLocation({ protocol: 'http:', hostname: 'localhost', port: '5173' });

      expect(getSocketUrl()).toBe('http://localhost:3000');
    });

    it('should return correct URL for dev on LAN IP', () => {
      mockLocation({ protocol: 'http:', hostname: '192.168.1.100', port: '5173' });

      expect(getSocketUrl()).toBe('http://192.168.1.100:3000');
    });

    it('should return same origin in production (port 80)', () => {
      mockLocation({ protocol: 'http:', hostname: 'erp.hospital.com', port: '' });

      expect(getSocketUrl()).toBe('http://erp.hospital.com');
    });

    it('should return same origin with HTTPS in production', () => {
      mockLocation({ protocol: 'https:', hostname: 'erp.hospital.com', port: '' });

      expect(getSocketUrl()).toBe('https://erp.hospital.com');
    });

    it('should include non-standard port in production', () => {
      mockLocation({ protocol: 'http:', hostname: 'erp.local', port: '8080' });

      expect(getSocketUrl()).toBe('http://erp.local:8080');
    });

    it('should not include port 80 in URL', () => {
      mockLocation({ protocol: 'http:', hostname: 'erp.local', port: '80' });

      expect(getSocketUrl()).toBe('http://erp.local');
    });

    it('should not include port 443 in URL', () => {
      mockLocation({ protocol: 'https:', hostname: 'erp.local', port: '443' });

      expect(getSocketUrl()).toBe('https://erp.local');
    });

    it('should handle port 5174 as development', () => {
      mockLocation({ protocol: 'http:', hostname: 'localhost', port: '5174' });

      expect(getSocketUrl()).toBe('http://localhost:3000');
    });
  });

  // ─── getSocketUrlWithNamespace ─────────────────────────────
  describe('getSocketUrlWithNamespace', () => {
    it('should append namespace with leading slash', () => {
      mockLocation({ protocol: 'http:', hostname: 'localhost', port: '5173' });

      expect(getSocketUrlWithNamespace('/nursing')).toBe('http://localhost:3000/nursing');
    });

    it('should add leading slash if namespace does not have one', () => {
      mockLocation({ protocol: 'http:', hostname: 'localhost', port: '5173' });

      expect(getSocketUrlWithNamespace('notifications')).toBe(
        'http://localhost:3000/notifications'
      );
    });

    it('should work with production URLs', () => {
      mockLocation({ protocol: 'https:', hostname: 'erp.hospital.com', port: '' });

      expect(getSocketUrlWithNamespace('/alerts')).toBe('https://erp.hospital.com/alerts');
    });
  });
});
