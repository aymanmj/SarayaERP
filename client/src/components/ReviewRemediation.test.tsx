import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { PatientDepositPanel } from './billing/PatientDepositPanel';
import { MedicationAdministrationPane } from './nursing/MedicationAdministrationPane';
import { VitalsPane } from './encounter/VitalsPane';
import NursingPatientDetailsPage from '../pages/NursingPatientDetailsPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), allowed: [] as string[] }));
vi.mock('../api/apiClient', () => ({ apiClient: { get: mocks.get, post: mocks.post } }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1, hospitalId: 2, permissions: mocks.allowed }, hasPermission: (p: string) => mocks.allowed.includes(p) }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'ar' }, t: (key: string, fallback?: string) => fallback ?? key }),
}));
vi.mock('../hooks/useNursingWebSocket', () => ({ useNursingWebSocket: () => ({ isConnected: true }) }));
vi.mock('./nursing/NursingNotificationCenter', () => ({ NursingNotificationCenter: () => null }));

const medication = {
  id: 3,
  product: { name: 'Synthetic medication', strength: '', form: '' },
  dose: '1',
  route: 'PO',
  frequency: 'daily',
  notes: null,
};
const prescriptions = [{
  id: 1,
  status: 'ACTIVE',
  doctor: { fullName: 'Synthetic prescriber' },
  createdAt: '2026-11-19',
  items: [medication],
}];

function mockMAR(administrations: object[] = []) {
  mocks.get.mockImplementation((url: string) => Promise.resolve({
    data: url.endsWith('mar-schedule') ? [] : { prescriptions, administrations },
  }));
}

async function openBarcodeDialog() {
  render(<MedicationAdministrationPane encounterId={2} />);
  fireEvent.click(await screen.findByRole('button', { name: /إعطاء بمطابقة الباركود/ }));
  return within(screen.getByRole('dialog', { name: 'مطابقة باركود المريض والدواء' }));
}

describe('review remediation in staff interfaces', () => {
  beforeEach(() => { mocks.allowed = []; mocks.get.mockReset(); mocks.post.mockReset(); });
  afterEach(cleanup);
  it('disables financial writes for a billing reader', async () => {
    mocks.get.mockResolvedValue({ data: { availableBalance: '0.000', totalDeposited: '0.000', totalApplied: '0.000', totalRefunded: '0.000', deposits: [], refunds: [], appliedPayments: [] } });
    render(<PatientDepositPanel patientId={2} />);
    expect(await screen.findByRole('button', { name: /إيداع دفعة/ })).toBeDisabled();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('retains an exact deposit amount and request identity after a lost response', async () => {
    mocks.allowed = ['billing:manage'];
    mocks.get.mockResolvedValue({ data: { availableBalance: '0.000', totalDeposited: '0.000', totalApplied: '0.000', totalRefunded: '0.000', deposits: [], refunds: [], appliedPayments: [] } });
    mocks.post.mockRejectedValueOnce(new Error('lost reply')).mockResolvedValue({ data: {} });
    render(<PatientDepositPanel patientId={2} />);
    fireEvent.click(await screen.findByRole('button', { name: /إيداع دفعة/ }));
    fireEvent.change(screen.getByPlaceholderText('0.000'), { target: { value: '99999999999999.999' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الإيداع' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const original = mocks.post.mock.calls[0][1];
    expect(original.amount).toBe('99999999999999.999');
    fireEvent.click(await screen.findByRole('button', { name: 'إعادة المحاولة بالطلب نفسه' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[1][1]).toEqual(original);
  });
  it('does not grant drug administration to a nursing reader', async () => {
    mocks.allowed = ['nursing:view'];
    mocks.get.mockImplementation((url: string) => Promise.resolve({ data: url.endsWith('mar-schedule') ? [] : { administrations: [], prescriptions: [{ id: 1, status: 'ACTIVE', doctor: { fullName: 'Test' }, createdAt: '2026-11-09', items: [{ id: 3, product: { name: 'TestDrug', strength: '', form: '' }, dose: '1', route: 'PO', frequency: 'daily', notes: null }] }] } }));
    render(<MedicationAdministrationPane encounterId={2} />);
    expect(await screen.findByRole('button', { name: /إعطاء بمطابقة الباركود/ })).toBeDisabled();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('does not treat matching barcodes as pharmacist approval or permit an unauthorized override', async () => {
    mocks.allowed = ['nursing:medications:administer'];
    mocks.get.mockImplementation((url: string) => Promise.resolve({ data: url.endsWith('mar-schedule') ? [] : { administrations: [], prescriptions: [{ id: 1, status: 'ACTIVE', doctor: { fullName: 'Test' }, createdAt: '2026-11-09', items: [{ id: 3, product: { name: 'TestDrug', strength: '', form: '' }, dose: '1', route: 'PO', frequency: 'daily', notes: null }] }] } }));
    mocks.post.mockResolvedValue({ data: { isBarcodeMatch: true, isPatientMatch: true, isDrugMatch: true, pharmacistVerificationStatus: 'PENDING' } });
    render(<MedicationAdministrationPane encounterId={2} />);
    fireEvent.click(await screen.findByRole('button', { name: /إعطاء بمطابقة الباركود/ }));
    fireEvent.change(screen.getByPlaceholderText('امسح باركود المريض أو اكتب الرقم...'), { target: { value: 'PATIENT' } });
    fireEvent.change(screen.getByPlaceholderText('امسح باركود الدواء...'), { target: { value: 'DRUG' } });
    fireEvent.click(screen.getByRole('button', { name: /فحص مطابقة الباركود/ }));
    expect(await screen.findByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /توثيق الإعطاء بالباركود/ })).toBeDisabled();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0][0]).toContain('verify-five-rights');
  });

  it('uses the scanner Enter suffix to focus and then verify without recording administration', async () => {
    mocks.allowed = ['nursing:medications:administer'];
    mockMAR();
    mocks.post
      .mockResolvedValueOnce({ data: { isBarcodeMatch: true, isPatientMatch: true, isDrugMatch: true, pharmacistVerificationStatus: 'VERIFIED' } })
      .mockResolvedValueOnce({ data: { isBarcodeMatch: false, isPatientMatch: true, isDrugMatch: false, pharmacistVerificationStatus: 'VERIFIED' } });
    const dialog = await openBarcodeDialog();
    const patient = dialog.getByRole('textbox', { name: /باركود إسوارة المريض/ });
    const drug = dialog.getByRole('textbox', { name: /باركود عبوة/ });
    expect(patient).toHaveFocus();
    fireEvent.change(patient, { target: { value: 'SYN-PATIENT' } });
    fireEvent.keyDown(patient, { key: 'Enter' });
    expect(drug).toHaveFocus();
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.change(drug, { target: { value: 'SYN-DRUG' } });
    fireEvent.keyDown(drug, { key: 'Enter' });
    expect(await dialog.findByText(/مطابقة المريض والدواء ناجحة/)).toBeVisible();
    fireEvent.change(drug, { target: { value: 'SYN-WRONG' } });
    expect(dialog.queryByText(/مطابقة المريض والدواء ناجحة/)).toBeNull();
    fireEvent.keyDown(drug, { key: 'Enter' });
    expect(await dialog.findByText(/تعارض في الباركود/)).toBeVisible();
    expect(dialog.getByRole('button', { name: /توثيق الإعطاء/ })).toBeDisabled();
    expect(mocks.post.mock.calls.map(([url]) => url)).toEqual(Array(2).fill('/nursing/encounters/2/verify-five-rights'));
  });

  it('shows the original barcode retry inside the open dialog after a lost reply', async () => {
    mocks.allowed = ['nursing:medications:administer'];
    mockMAR();
    mocks.post.mockRejectedValueOnce(new Error('lost reply')).mockImplementationOnce(async () => {
      mockMAR([{
        id: 81, prescriptionItemId: 3, status: 'GIVEN', administeredAt: '2026-11-19T09:30:00Z',
        performer: { fullName: 'Synthetic nurse' }, isBarcodeMatch: true,
      }]);
      return { data: { id: 81 } };
    });
    const dialog = await openBarcodeDialog();
    fireEvent.change(dialog.getByRole('textbox', { name: /باركود إسوارة المريض/ }), { target: { value: 'SYN-PATIENT' } });
    fireEvent.change(dialog.getByRole('textbox', { name: /باركود عبوة/ }), { target: { value: 'SYN-DRUG' } });
    fireEvent.click(dialog.getByRole('button', { name: /توثيق الإعطاء/ }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('لا تكرر إعطاء الجرعة');
    expect(dialog.getByRole('button', { name: 'إلغاء' })).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'إغلاق مطابقة الباركود' })).toBeDisabled();
    expect(dialog.getByRole('textbox', { name: /باركود عبوة/ })).toBeDisabled();
    const retry = dialog.getByRole('button', { name: 'إعادة المحاولة بالطلب نفسه' });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    expect(await screen.findByText(/Synthetic nurse.*GIVEN/)).toBeVisible();
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.post.mock.calls[1]).toEqual(mocks.post.mock.calls[0]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps manual withholding distinct from a confirmed dose during recovery', async () => {
    mocks.allowed = ['nursing:medications:administer'];
    mockMAR();
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Synthetic documented hold');
    try {
      mocks.post.mockRejectedValueOnce(new Error('lost reply')).mockImplementationOnce(async () => {
        mockMAR([{
          id: 82, prescriptionItemId: 3, status: 'HELD', administeredAt: '2026-11-19T09:30:00Z',
          performer: { fullName: 'Synthetic nurse' },
        }]);
        return { data: { id: 82 } };
      });
      render(<MedicationAdministrationPane encounterId={2} />);
      fireEvent.click(await screen.findByRole('button', { name: 'تأجيل' }));
      const retry = await screen.findByRole('button', { name: 'إعادة المحاولة بالطلب نفسه' });
      await waitFor(() => expect(retry).toBeEnabled());
      fireEvent.click(retry);
      expect(await screen.findByText(/Synthetic nurse.*HELD/)).toBeVisible();
      expect(mocks.post.mock.calls[1]).toEqual(mocks.post.mock.calls[0]);
      expect(mocks.post.mock.calls[0][1]).toMatchObject({ status: 'HELD', notes: 'Synthetic documented hold' });
      expect(prompt).toHaveBeenCalledTimes(1);
    } finally {
      prompt.mockRestore();
    }
  });

  it('requires a choice of scheduled dose and replays that exact choice after a lost reply', async () => {
    mocks.allowed = ['nursing:medications:administer'];
    const scheduledSlot = '2026-11-19T20:00';
    mocks.get.mockImplementation((url: string) => Promise.resolve({
      data: url.endsWith('mar-schedule')
        ? [{ prescriptionItemId: 3, scheduledSlot, status: 'PENDING', drugName: medication.product.name }]
        : {
            administrations: [],
            prescriptions: [{ ...prescriptions[0], items: [{ ...medication, frequency: 'BID' }] }],
          },
    }));
    mocks.post.mockRejectedValueOnce(new Error('lost reply')).mockResolvedValueOnce({ data: { id: 85 } });
    render(<MedicationAdministrationPane encounterId={2} />);
    const manual = await screen.findByRole('button', { name: 'يدوي' });
    expect(manual).toBeDisabled();
    const choice = screen.getByRole('combobox', { name: /موعد جرعة/ });
    fireEvent.change(choice, { target: { value: scheduledSlot } });
    fireEvent.click(manual);
    const retry = await screen.findByRole('button', { name: 'إعادة المحاولة بالطلب نفسه' });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[1]).toEqual(mocks.post.mock.calls[0]);
    expect(mocks.post.mock.calls[0][1]).toMatchObject({ prescriptionItemId: 3, scheduledSlot, status: 'GIVEN' });
  });

  it('accepts a respiratory rate alone and retains the same reading after a lost reply', async () => {
    mocks.get.mockResolvedValue({ data: [] });
    mocks.post.mockRejectedValueOnce(new Error('lost reply')).mockResolvedValueOnce({ data: { id: 60 } });
    render(<VitalsPane encounterId={2} />);
    fireEvent.click(await screen.findByRole('button', { name: /قراءة جديدة/ }));
    const respiratoryRate = screen.getByRole('spinbutton', { name: /التنفس/ });
    fireEvent.change(respiratoryRate, { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ العلامات الحيوية' }));
    const retry = await screen.findByRole('button', { name: 'إعادة إرسال القراءة نفسها' });
    expect(respiratoryRate).toBeDisabled();
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole('spinbutton', { name: /التنفس/ })).toBeNull());
    expect(mocks.post.mock.calls[1]).toEqual(mocks.post.mock.calls[0]);
    expect(mocks.post.mock.calls[0][1]).toMatchObject({ respRate: 18 });
  });

  it('keeps the nursing encounter tab and back action locked while a clinical write is unresolved', async () => {
    mocks.allowed = ['nursing:medications:administer'];
    mocks.get.mockImplementation((url: string) => Promise.resolve({
      data: url === '/encounters/2'
        ? { id: 2, patient: { fullName: 'Synthetic patient', mrn: 'SYN-PATIENT' }, doctor: { fullName: 'Synthetic prescriber' } }
        : url.endsWith('/mar') ? { prescriptions, administrations: [] } : [],
    }));
    mocks.post.mockRejectedValueOnce(new Error('lost reply')).mockResolvedValueOnce({ data: { id: 90 } });
    render(
      <MemoryRouter initialEntries={['/nursing/2']}>
        <Routes><Route path="/nursing/:id" element={<NursingPatientDetailsPage />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'يدوي' }));
    const retry = await screen.findByRole('button', { name: 'إعادة المحاولة بالطلب نفسه' });
    const vitalsTab = screen.getByRole('button', { name: /العلامات الحيوية/ });
    const back = screen.getByRole('button', { name: /رجوع/ });
    expect(vitalsTab).toBeDisabled();
    expect(back).toBeDisabled();
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    await waitFor(() => expect(vitalsTab).toBeEnabled());
    expect(back).toBeEnabled();
    expect(mocks.post.mock.calls[1]).toEqual(mocks.post.mock.calls[0]);
  });
});
