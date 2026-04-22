import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock dependencies BEFORE importing the store
vi.mock('../api/apiClient', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

vi.mock('./licenseStore', () => ({
  useLicenseStore: {
    getState: vi.fn(() => ({ reset: vi.fn() })),
  },
}));

import { useAuthStore } from './authStore';
import { apiClient } from '../api/apiClient';
import { useLicenseStore } from './licenseStore';

describe('authStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
    });

    // Clear localStorage
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Initial State ─────────────────────────────────────────
  describe('Initial State', () => {
    it('should have null user by default', () => {
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('should not be authenticated by default', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('should have null token by default', () => {
      expect(useAuthStore.getState().token).toBeNull();
    });
  });

  // ─── Login ─────────────────────────────────────────────────
  describe('login', () => {
    const mockUser = {
      id: 1,
      fullName: 'Dr. Ahmad',
      username: 'ahmad',
      hospitalId: 1,
      roles: ['DOCTOR'],
      permissions: ['encounter:create'],
    };

    it('should login successfully and update state', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { user: mockUser, token: 'jwt-token-123', success: true },
      });

      await useAuthStore.getState().login('ahmad', 'password123');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
      expect(state.token).toBe('jwt-token-123');
    });

    it('should persist auth state to localStorage', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { user: mockUser, token: 'jwt-token-123', success: true },
      });

      await useAuthStore.getState().login('ahmad', 'password123');

      expect(localStorage.getItem('auth_status')).toBe('true');
      expect(localStorage.getItem('user_info')).toBe(JSON.stringify(mockUser));
      expect(localStorage.getItem('auth_token')).toBe('jwt-token-123');
    });

    it('should reset license store on login', async () => {
      const mockReset = vi.fn();
      (useLicenseStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({ reset: mockReset });

      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { user: mockUser, success: true },
      });

      await useAuthStore.getState().login('ahmad', 'password123');

      expect(mockReset).toHaveBeenCalled();
    });

    it('should handle login without token in response', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { user: mockUser, success: true },
      });

      await useAuthStore.getState().login('ahmad', 'password123');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.token).toBeNull(); // token not provided
      expect(localStorage.getItem('auth_token')).toBe('');
    });

    it('should throw on API failure', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Invalid credentials')
      );

      await expect(
        useAuthStore.getState().login('wrong', 'wrong')
      ).rejects.toThrow('Invalid credentials');
    });
  });

  // ─── Logout ────────────────────────────────────────────────
  describe('logout', () => {
    it('should clear all auth state', async () => {
      // Set up authenticated state
      useAuthStore.setState({
        user: { id: 1, fullName: 'Test', username: 'test', hospitalId: 1, roles: ['DOCTOR'], permissions: [] },
        token: 'some-token',
        isAuthenticated: true,
      });

      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should clear localStorage on logout', async () => {
      localStorage.setItem('auth_status', 'true');
      localStorage.setItem('user_info', '{}');
      localStorage.setItem('auth_token', 'token');

      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

      await useAuthStore.getState().logout();

      expect(localStorage.getItem('auth_status')).toBeNull();
      expect(localStorage.getItem('user_info')).toBeNull();
      expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('should not throw if API logout fails (fire & forget)', async () => {
      useAuthStore.setState({
        user: { id: 1, fullName: 'Test', username: 'test', hospitalId: 1, roles: [], permissions: [] },
        token: 'token',
        isAuthenticated: true,
      });

      (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error')
      );

      // Should not throw
      await useAuthStore.getState().logout();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  // ─── Hydrate From Storage ─────────────────────────────────
  describe('hydrateFromStorage', () => {
    it('should remove legacy storage keys', () => {
      localStorage.setItem('token', 'old-token');
      localStorage.setItem('refreshToken', 'old-refresh');
      localStorage.setItem('user', '{}');
      localStorage.setItem('auth-storage', '{}');

      useAuthStore.getState().hydrateFromStorage();

      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(localStorage.getItem('auth-storage')).toBeNull();
    });
  });
});
