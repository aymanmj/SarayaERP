import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IcuStepDownModal } from './IcuStepDownModal';
import { apiClient } from '../../../../api/apiClient';

vi.mock('../../../../api/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key, i18n: { language: 'ar' } }) }));
// The API suite tests signature validation. Here the boundary under test is that
// signing never automatically asserts the patient's physical arrival.
vi.mock('../../transfers/HandoverNoteModal', () => ({
  HandoverNoteModal: ({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: (signed?: boolean) => void }) => isOpen ? <div>
    <button onClick={() => { onSuccess(true); onClose(); }}>اعتماد اختباري</button>
    <button onClick={() => { onSuccess(false); onClose(); }}>مسودة اختبارية</button>
  </div> : null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: [{ id: 1, name: 'General Ward', type: 'GENERAL', rooms: [{ roomNumber: 'R1', beds: [{ id: 22, bedNumber: 'B22', status: 'AVAILABLE' }] }] }] });
  vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 41 } });
  vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function submitRequest() {
  render(<IcuStepDownModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} encounterId={7} patientName="Synthetic Patient" />);
  await screen.findByRole('option', { name: /General Ward/ });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '22' } });
  fireEvent.change(screen.getByPlaceholderText(/مثال: استقرار الحالة/), { target: { value: 'Synthetic transfer reason' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'تنفيذ النقل' })); });
}

describe('ICU step-down arrival boundary', () => {
  it('requires a separate physical-arrival action after signing the handover', async () => {
    await submitRequest();
    fireEvent.click(await screen.findByRole('button', { name: 'اعتماد اختباري' }));
    const arrival = screen.getByRole('button', { name: 'تأكيد وصول المريض إلى سرير الوجهة' });
    expect(arrival).toBeEnabled();
    expect(apiClient.patch).not.toHaveBeenCalledWith('/transfers/41/arrive');
    await act(async () => { fireEvent.click(arrival); });
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/transfers/41/arrive'));
  });

  it('does not enable arrival after saving an unsigned draft', async () => {
    await submitRequest();
    fireEvent.click(await screen.findByRole('button', { name: 'مسودة اختبارية' }));
    expect(screen.getByRole('button', { name: 'تأكيد وصول المريض إلى سرير الوجهة' })).toBeDisabled();
    expect(apiClient.patch).not.toHaveBeenCalledWith('/transfers/41/arrive');
  });

  it('cancels its failed reservation attempt before allowing a new request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(apiClient.patch).mockRejectedValueOnce(new Error('Synthetic reservation conflict'));
    await submitRequest();
    const retry = await screen.findByRole('button', { name: 'المحاولة مرة أخرى' });
    await act(async () => { fireEvent.click(retry); });
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/transfers/41/cancel'));
    await screen.findByRole('button', { name: 'تنفيذ النقل' });
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
});
