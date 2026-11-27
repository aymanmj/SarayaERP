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
import { useSocketStore } from './socketStore';

describe('authStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAuthStore.setState({
      user: null,
      sessionRevision: 0,
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

    it('does not keep an access token in the store', () => {
      expect(useAuthStore.getState()).not.toHaveProperty('token');
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

    it('reconnects sockets after renewal for the same staff member and branch', () => {
      const disconnect = vi.fn();
      const connect = vi.fn();
      vi.spyOn(useSocketStore, 'getState').mockReturnValue({
        socket: {} as NonNullable<ReturnType<typeof useSocketStore.getState>['socket']>, disconnect, connect,
      });
      useAuthStore.getState().setAuth({ user: mockUser });
      expect(useAuthStore.getState().acceptRefreshedSession(2, mockUser.id)).toBe(false);
      expect(useAuthStore.getState().acceptRefreshedSession(mockUser.hospitalId, 2)).toBe(false);
      expect(disconnect).not.toHaveBeenCalled();
      expect(useAuthStore.getState().acceptRefreshedSession(mockUser.hospitalId, mockUser.id)).toBe(true);
      expect(useAuthStore.getState().sessionRevision).toBe(1);
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(disconnect).toHaveBeenCalledOnce();
      expect(connect).toHaveBeenCalledOnce();
    });

    it('should login successfully and update state', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { user: mockUser, token: 'jwt-token-123', success: true },
      });

      await useAuthStore.getState().login('ahmad', 'password123');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
      expect(state).not.toHaveProperty('token');
    });

    it('should persist auth state to localStorage', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { user: mockUser, token: 'jwt-token-123', success: true },
      });

      await useAuthStore.getState().login('ahmad', 'password123');

      expect(localStorage.getItem('auth_status')).toBe('true');
      expect(localStorage.getItem('user_info')).toBe(JSON.stringify(mockUser));
      expect(localStorage.getItem('auth_token')).toBeNull();
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
      expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('should forward optional mfaCode when provided', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: { user: { ...mockUser, mfaEnabled: true }, success: true },
      });

      await useAuthStore.getState().login('ahmad', 'password123', '654321');

      expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
        username: 'ahmad',
        password: 'password123',
        mfaCode: '654321',
      });
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
        isAuthenticated: true,
      });

      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
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
      localStorage.setItem('auth_token', 'old-access-token');
      localStorage.setItem('refreshToken', 'old-refresh');
      localStorage.setItem('user', '{}');
      localStorage.setItem('auth-storage', '{}');

      useAuthStore.getState().hydrateFromStorage();
      expect(localStorage.getItem('auth_token')).toBeNull();

      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(localStorage.getItem('auth-storage')).toBeNull();
    });
  });
});
