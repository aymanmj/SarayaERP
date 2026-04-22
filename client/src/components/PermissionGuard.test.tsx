import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PermissionGuard } from './PermissionGuard';
import { useAuthStore } from '../stores/authStore';

// Mock the zustand store
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

/**
 * Helper to mock the store with selector support.
 * PermissionGuard calls: useAuthStore((s) => s.user)
 * So the mock must handle selector functions correctly.
 */
function mockAuthUser(user: any) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: any) => selector({ user })
  );
}

describe('PermissionGuard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not render if user is not logged in', () => {
    mockAuthUser(null);

    render(
      <PermissionGuard allowedRoles={['DOCTOR']}>
        <div>Protected Content</div>
      </PermissionGuard>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should not render if user does not have permission', () => {
    mockAuthUser({
      roles: ['NURSE'],
    });

    render(
      <PermissionGuard allowedRoles={['DOCTOR']}>
        <div>Protected Content</div>
      </PermissionGuard>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render if user has the required role', () => {
    mockAuthUser({
      roles: ['DOCTOR'],
    });

    render(
      <PermissionGuard allowedRoles={['DOCTOR']}>
        <div>Protected Content</div>
      </PermissionGuard>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should always render for ADMIN', () => {
    mockAuthUser({
      roles: ['ADMIN'],
    });

    // Even if we ask for DOCTOR, ADMIN should see it
    render(
      <PermissionGuard allowedRoles={['DOCTOR']}>
        <div>Protected Content</div>
      </PermissionGuard>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should render if user has one of multiple allowed roles (OR logic)', () => {
    mockAuthUser({
      roles: ['PHARMACIST'],
    });

    render(
      <PermissionGuard allowedRoles={['DOCTOR', 'PHARMACIST', 'LAB_TECH']}>
        <div>Multi-role Content</div>
      </PermissionGuard>
    );

    expect(screen.getByText('Multi-role Content')).toBeInTheDocument();
  });

  it('should not render for user with unrelated roles', () => {
    mockAuthUser({
      roles: ['RECEPTIONIST'],
    });

    render(
      <PermissionGuard allowedRoles={['DOCTOR', 'NURSE']}>
        <div>Clinical Content</div>
      </PermissionGuard>
    );

    expect(screen.queryByText('Clinical Content')).not.toBeInTheDocument();
  });

  it('should not render when user has empty roles array', () => {
    mockAuthUser({
      roles: [],
    });

    render(
      <PermissionGuard allowedRoles={['DOCTOR']}>
        <div>Content</div>
      </PermissionGuard>
    );

    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });
});
