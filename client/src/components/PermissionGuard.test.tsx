import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PermissionGuard } from './PermissionGuard';
import { useAuthStore } from '../stores/authStore';

// Mock the zustand store
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

describe('PermissionGuard', () => {
  it('should not render if user is not logged in', () => {
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);

    render(
      <PermissionGuard allowedRoles={['DOCTOR']}>
        <div>Protected Content</div>
      </PermissionGuard>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should not render if user does not have permission', () => {
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
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
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
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
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
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
});
