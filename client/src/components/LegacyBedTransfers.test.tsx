import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LegacyBedTransfers, type LegacyBedTransfer } from './LegacyBedTransfers';
import { apiClient } from '../api/apiClient';
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../api/apiClient', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('sonner', () => ({ toast }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key }) }));
const transfer: LegacyBedTransfer = { id: 5, createdAt: '2026-11-06', fromBed: { bedNumber: 'A1' }, toBed: { bedNumber: 'A2' }, requestedUser: { fullName: 'Synthetic Nurse' }, transferReason: 'Synthetic reason', status: 'REQUESTED' };
const onChanged = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(true); vi.mocked(apiClient.post).mockResolvedValue({}); onChanged.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const open = (canApprove = true, canCancel = true, status = 'REQUESTED', activeAdmission = true) => render(<LegacyBedTransfers transfers={[{ ...transfer, status }]} canApprove={canApprove} canCancel={canCancel} activeAdmission={activeAdmission} onChanged={onChanged} />);
describe('Legacy bed transfer actions', () => {
  it('renders real bed references and executes only after physical confirmation', async () => {
    open();
    expect(screen.getByText('A1 → A2')).toBeInTheDocument();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد وتنفيذ النقل' }));
    expect(apiClient.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد وتنفيذ النقل' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(apiClient.post).toHaveBeenCalledWith('/admissions/transfers/5/approve');
  });
  it('lets a manager cancel without approving, while a reader has no action buttons', async () => {
    const view = open(false, true);
    expect(screen.queryByRole('button', { name: 'اعتماد وتنفيذ النقل' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء طلب النقل' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/admissions/bed-transfer/5/cancel'));
    view.unmount(); open(false, false);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('completes an already approved historical request through the guarded alias', async () => {
    open(true, true, 'APPROVED');
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد وتنفيذ النقل' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/admissions/bed-transfer/5/complete'));
  });
  it('keeps the request visible after server rejection and does not reload it as a success', async () => {
    vi.mocked(apiClient.post).mockRejectedValue({ response: { data: { message: 'Synthetic conflict' } } });
    open(); fireEvent.click(screen.getByRole('button', { name: 'اعتماد وتنفيذ النقل' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Synthetic conflict'));
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'اعتماد وتنفيذ النقل' })).toBeEnabled();
  });
  it('allows cleanup of closed admissions but no execution or completed-request actions', () => {
    const view = open(true, true, 'REQUESTED', false);
    expect(screen.queryByRole('button', { name: 'اعتماد وتنفيذ النقل' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء طلب النقل' })).toBeInTheDocument();
    view.unmount(); open(true, true, 'COMPLETED');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
