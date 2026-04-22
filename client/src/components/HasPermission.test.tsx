import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HasPermission } from './HasPermission';
import { useAuthStore } from '../stores/authStore';

// Mock the zustand store
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

// Helper to mock the selector-based store
function mockAuthUser(user: any) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: any) => selector({ user })
  );
}

describe('HasPermission', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should show fallback when user is null', () => {
    mockAuthUser(null);

    render(
      <HasPermission access="billing:invoice:cancel" fallback={<div>Access Denied</div>}>
        <div>Secret Content</div>
      </HasPermission>
    );

    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
  });

  it('should show nothing (null fallback by default) when user is null', () => {
    mockAuthUser(null);

    const { container } = render(
      <HasPermission access="billing:invoice:cancel">
        <div>Secret Content</div>
      </HasPermission>
    );

    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
    expect(container.innerHTML).toBe('');
  });

  it('should always render for ADMIN regardless of permission', () => {
    mockAuthUser({
      roles: ['ADMIN'],
      permissions: [],
    });

    render(
      <HasPermission access="billing:invoice:cancel">
        <div>Admin sees everything</div>
      </HasPermission>
    );

    expect(screen.getByText('Admin sees everything')).toBeInTheDocument();
  });

  it('should render if user has the exact permission', () => {
    mockAuthUser({
      roles: ['CASHIER'],
      permissions: ['billing:invoice:cancel'],
    });

    render(
      <HasPermission access="billing:invoice:cancel">
        <div>Authorized Content</div>
      </HasPermission>
    );

    expect(screen.getByText('Authorized Content')).toBeInTheDocument();
  });

  it('should show fallback if user lacks the required permission', () => {
    mockAuthUser({
      roles: ['NURSE'],
      permissions: ['nursing:vitals:read'],
    });

    render(
      <HasPermission access="billing:invoice:cancel" fallback={<span>No Access</span>}>
        <div>Restricted Content</div>
      </HasPermission>
    );

    expect(screen.queryByText('Restricted Content')).not.toBeInTheDocument();
    expect(screen.getByText('No Access')).toBeInTheDocument();
  });

  it('should handle user with empty permissions array', () => {
    mockAuthUser({
      roles: ['DOCTOR'],
      permissions: [],
    });

    render(
      <HasPermission access="billing:invoice:cancel">
        <div>Content</div>
      </HasPermission>
    );

    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('should handle user with undefined permissions', () => {
    mockAuthUser({
      roles: ['DOCTOR'],
      permissions: undefined,
    });

    render(
      <HasPermission access="billing:invoice:cancel">
        <div>Content</div>
      </HasPermission>
    );

    // permissions?.includes should return undefined, not crash
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });
});
