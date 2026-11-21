import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemSettingsPage } from './SystemSettingsPage';
import { systemSettingsApi, type SystemSetting } from '../../api/systemSettings';

const { permissions, toast } = vi.hoisted(() => ({ permissions: ['admin:manage'] as string[], toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../api/systemSettings', () => ({ systemSettingsApi: { findAll: vi.fn(), update: vi.fn() } }));
vi.mock('../../stores/authStore', () => ({ useAuthStore: (select: (state: { user: { permissions: string[] } }) => unknown) => select({ user: { permissions } }) }));
vi.mock('sonner', () => ({ toast }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key, i18n: { language: 'ar' } }) }));

const policy: SystemSetting = { id: 1, hospitalId: 1, key: 'billing.roomDayPolicy', value: 'COMPLETED_24H', type: 'STRING', group: 'BILLING', updatedAt: '2026-11-06T00:00:00Z' };
let queryClient: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  permissions.splice(0, permissions.length, 'admin:manage');
  vi.mocked(systemSettingsApi.findAll).mockResolvedValue([{ ...policy }]);
  vi.mocked(systemSettingsApi.update).mockImplementation(async (key, value) => ({ ...policy, key, value }));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); queryClient.clear(); });
const open = () => render(<QueryClientProvider client={queryClient}><SystemSettingsPage /></QueryClientProvider>);

describe('Configurable room-day policy', () => {
  it('shows the default and all three alternatives, explains future-only scope, and saves selection', async () => {
    open();
    const select = await screen.findByRole('combobox', { name: 'طريقة احتساب أيام الإقامة' });
    expect(select).toHaveValue('COMPLETED_24H');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByText(/التعديل يسري على حالات الدخول الجديدة فقط/)).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'STARTED_24H' } });
    await waitFor(() => expect(systemSettingsApi.update).toHaveBeenCalledWith('billing.roomDayPolicy', 'STARTED_24H'));
    await waitFor(() => expect(select).toHaveValue('STARTED_24H'));
  });
  it('keeps the control read-only for a user without admin management permission', async () => {
    permissions.splice(0, permissions.length, 'admin:view');
    open();
    const select = await screen.findByRole('combobox', { name: 'طريقة احتساب أيام الإقامة' });
    expect(select).toBeDisabled();
    fireEvent.change(select, { target: { value: 'CALENDAR_NIGHTS' } });
    expect(systemSettingsApi.update).not.toHaveBeenCalled();
  });
  it('keeps the previous selection if saving fails', async () => {
    vi.mocked(systemSettingsApi.update).mockRejectedValue(new Error('Synthetic save failure'));
    open();
    const select = await screen.findByRole('combobox', { name: 'طريقة احتساب أيام الإقامة' });
    fireEvent.change(select, { target: { value: 'CALENDAR_NIGHTS' } });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(select).toHaveValue('COMPLETED_24H');
  });
});
