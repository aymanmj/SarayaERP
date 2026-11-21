import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { InvoiceAdjustmentsPanel } from './InvoiceAdjustmentsPanel';
import { apiClient } from '../api/apiClient';

const { user, toast } = vi.hoisted(() => ({ user: { id: 1, roles: [] as string[], permissions: ['billing:adjustments:request'] as string[] }, toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../api/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../stores/authStore', () => ({ useAuthStore: (select: (state: { user: typeof user }) => unknown) => select({ user }) }));
vi.mock('sonner', () => ({ toast }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, fallback?: unknown) => typeof fallback === 'string' ? fallback : key }) }));
const item = { id: 5, chargeId: 7, status: 'PENDING', kind: 'CREDIT', previousAmount: '100.000', correctedAmount: '60.000', delta: '-40.000', reason: 'Synthetic correction evidence', requestedById: 1, reviewedById: null, reviewReason: null, postingEntryId: null };
const response = { items: [item], lines: [{ id: 7, totalAmount: '100.000', serviceItem: { name: 'Synthetic original room' } }], eligible: true, effectivePatientShare: '100.000', amountDue: '100.000', patientCredit: '0.000' };
let queryClient: QueryClient;
const onChanged = vi.fn();
beforeEach(() => { vi.clearAllMocks(); user.id = 1; user.permissions.splice(0, user.permissions.length, 'billing:adjustments:request'); user.roles.splice(0); queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); vi.mocked(apiClient.get).mockResolvedValue({ data: response }); vi.mocked(apiClient.post).mockResolvedValue({}); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); });
const open = () => render(<QueryClientProvider client={queryClient}><InvoiceAdjustmentsPanel invoiceId={9} onChanged={onChanged} /></QueryClientProvider>);

describe('Approved room-fee correction panel', () => {
  it('requests cancellation of the entire prescription charge without an editable amount', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...response, items: [], prescriptionId: 22 },
    });
    open();
    fireEvent.change(await screen.findByLabelText('سبب التصحيح'), {
      target: { value: 'Synthetic prescription cancellation' },
    });
    expect(screen.queryByLabelText('المبلغ الصحيح للبند')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'invoiceAdjustments.requestPrescriptionCancellation' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/billing/invoices/9/adjustments',
      expect.objectContaining({ chargeId: 7, correctedAmount: '0.000' }),
    ));
  });
  it('links to the original and replacement invoices for a corrected prescription', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        ...response,
        prescriptionId: 22,
        originalPrescriptionInvoiceId: 8,
        replacementPrescriptionInvoiceId: 10,
      },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <InvoiceAdjustmentsPanel invoiceId={9} onChanged={onChanged} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'invoiceAdjustments.originalPrescriptionInvoice' }))
      .toHaveAttribute('href', '/billing/invoices/8');
    expect(screen.getByRole('link', { name: 'invoiceAdjustments.replacementPrescriptionInvoice' }))
      .toHaveAttribute('href', '/billing/invoices/10');
  });
  it('shows patient and insurer adjustments separately for a cancelled insured prescription', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {
      ...response, prescriptionId: 22, insuredPrescription: true,
      effectiveInsuranceShare: '0.000', patientCredit: '0.222',
      items: [{ ...item, status: 'POSTED', delta: '-0.667', insuranceDelta: '-2.666' }],
    } });
    open();
    expect(await screen.findByText('-0.667')).toBeInTheDocument();
    expect(screen.getByText('-2.666')).toBeInTheDocument();
    expect(screen.getByText(/0.222 LYD/)).toBeInTheDocument();
  });
  it('submits a documented amount correction and preserves the request identity on a failed retry', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({ response: { data: { message: 'Synthetic network failure' } } });
    open();
    fireEvent.change(await screen.findByLabelText('البند الأصلي'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('المبلغ الصحيح للبند'), { target: { value: '60.000' } });
    fireEvent.change(screen.getByLabelText('سبب التصحيح'), { target: { value: 'Synthetic correction evidence' } });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال طلب التصحيح' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Synthetic network failure'));
    expect(onChanged).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'إرسال طلب التصحيح' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/billing/invoices/9/adjustments', expect.objectContaining({ chargeId: 7, correctedAmount: '60.000', reason: 'Synthetic correction evidence', requestId: expect.any(String) }));
    expect(vi.mocked(apiClient.post).mock.calls[0][1]).toEqual(vi.mocked(apiClient.post).mock.calls[1][1]);
  });
  it('requests an insurer-only credit within the net collections limit', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {
      ...response, items: [], prescriptionId: 22, insuredPrescription: true,
      eligible: false, eligibleInsuranceCredit: true, effectiveInsuranceShare: '2.666',
      effectivePatientShare: '0.667', insuranceNetCollected: '1.200',
    } });
    open();
    const amount = await screen.findByLabelText('invoiceAdjustments.correctedInsuranceShare');
    fireEvent.change(screen.getByLabelText('سبب التصحيح'), { target: { value: 'Verified pricing evidence' } });
    fireEvent.change(amount, { target: { value: '1.199' } });
    const submit = screen.getByRole('button', { name: 'invoiceAdjustments.requestInsuranceCredit' });
    expect(submit).toBeDisabled();
    fireEvent.change(amount, { target: { value: '2.000' } });
    fireEvent.click(submit);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/billing/invoices/9/adjustments', expect.objectContaining({
      chargeId: 7, correctedAmount: '2.000', insuranceOnly: true,
    })));
  });
  it('requests the fixed correction quoted from the partial dispense record', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: {
      ...response, items: [], prescriptionId: 22, insuredPrescription: true, eligible: false,
      partialDispenseQuote: {
        correctedAmount: '3.333', patientShare: '0.667', insurerShare: '2.666',
        closureReason: 'Patient declined the remainder',
      },
    } });
    open();
    expect(await screen.findByText('Patient declined the remainder')).toBeInTheDocument();
    expect(screen.queryByLabelText('المبلغ الصحيح للبند')).not.toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'invoiceAdjustments.requestPartialCredit' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('سبب التصحيح'), { target: { value: 'Matched delivered quantities' } });
    fireEvent.click(submit);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/billing/invoices/9/adjustments',
      expect.objectContaining({ chargeId: 7, correctedAmount: '3.333', partialDispense: true }),
    ));
  });
  it('keeps approvals unavailable to the requester even with approval permission', async () => {
    user.permissions.push('billing:adjustments:approve'); open();
    await screen.findByText('Synthetic correction evidence');
    expect(screen.queryByRole('button', { name: 'اعتماد وترحيل' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء طلبي' })).toBeDisabled();
  });
  it('requires a second reviewer, review evidence and confirmation before financial posting', async () => {
    user.id = 2; user.permissions.splice(0, user.permissions.length, 'billing:adjustments:approve'); open();
    const approve = await screen.findByRole('button', { name: 'اعتماد وترحيل' }); expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText('سبب الاعتماد أو الرفض أو الإلغاء'), { target: { value: 'Checked supporting evidence' } });
    vi.mocked(window.confirm).mockReturnValueOnce(false); fireEvent.click(approve); expect(apiClient.post).not.toHaveBeenCalled();
    fireEvent.click(approve);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/billing/invoices/9/adjustments/5/approve', { reason: 'Checked supporting evidence' }));
  });
  it('shows the amount owed to a patient without suggesting a cash refund and keeps readers read-only', async () => {
    user.permissions.splice(0, user.permissions.length, 'billing:view');
    vi.mocked(apiClient.get).mockResolvedValue({ data: { ...response, amountDue: '0.000', patientCredit: '40.000', items: [{ ...item, status: 'POSTED', postingEntryId: 11 }] } });
    open(); await screen.findByText(/40.000 LYD/);
    expect(screen.getByText(/دون افتراض استرداده/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('المبلغ الصحيح للبند')).not.toBeInTheDocument();
  });
});
