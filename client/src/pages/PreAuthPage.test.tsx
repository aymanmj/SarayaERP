/**
 * PreAuthPage — Component Tests
 *
 * Uses Vitest + React Testing Library to verify:
 * - Core table rendering
 * - NPHIES eligibility and submission flows
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PreAuthPage from './PreAuthPage';

// Mock apiClient
vi.mock('../api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock FeatureGuard — always show children in tests
vi.mock('@/components/FeatureGuard', () => ({
  FeatureGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock formatDate
vi.mock('@/lib/utils', () => ({
  formatDate: (d: string) => d?.substring(0, 10) || '',
}));

// Mock lucide-react icons to avoid SVG rendering issues
vi.mock('lucide-react', () => ({
  ShieldCheck: () => <span data-testid="icon-shield" />,
  Upload: () => <span data-testid="icon-upload" />,
  FileCheck: () => <span data-testid="icon-filecheck" />,
  Loader2: () => <span data-testid="icon-loader" />,
}));

const { apiClient } = await import('../api/apiClient');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { toast } = await import('sonner');

const mockPreAuths = [
  {
    id: 1,
    hospitalId: 1,
    patientId: 10,
    policyId: 5,
    serviceItemId: null,
    authCode: null,
    status: 'PENDING',
    requestedAmount: 500,
    approvedAmount: null,
    expiresAt: null,
    notes: null,
    createdAt: '2026-04-25T10:00:00Z',
    patient: { id: 10, fullName: 'أحمد محمد', mrn: 'MRN-001', insuranceMemberId: 'MEM-123' },
    policy: { id: 5, name: 'Gold Plan', policyNumber: 'POL-001', provider: { id: 1, name: 'بوبا العربية' } },
  },
  {
    id: 2,
    hospitalId: 1,
    patientId: 11,
    policyId: 6,
    serviceItemId: null,
    authCode: 'AUTH-999',
    status: 'APPROVED',
    requestedAmount: 1000,
    approvedAmount: 800,
    expiresAt: '2026-05-25T00:00:00Z',
    notes: null,
    createdAt: '2026-04-20T08:00:00Z',
    patient: { id: 11, fullName: 'فاطمة السعيد', mrn: 'MRN-002', insuranceMemberId: 'MEM-456' },
    policy: { id: 6, name: 'Silver Plan', policyNumber: 'POL-002', provider: { id: 2, name: 'التعاونية' } },
  },
];

describe('PreAuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockPreAuths });
  });

  it('should render the page title', async () => {
    render(<PreAuthPage />);
    expect(screen.getByText(/الموافقات المسبقة/)).toBeDefined();
  });

  it('should load and display pre-authorizations', async () => {
    render(<PreAuthPage />);
    await waitFor(() => {
      expect(screen.getByText('أحمد محمد')).toBeDefined();
      expect(screen.getByText('فاطمة السعيد')).toBeDefined();
    });
  });

  it('should show PENDING status badge', async () => {
    render(<PreAuthPage />);
    await waitFor(() => {
      expect(screen.getByText('قيد الانتظار')).toBeDefined();
    });
  });

  it('should show APPROVED status badge with auth code', async () => {
    render(<PreAuthPage />);
    await waitFor(() => {
      expect(screen.getByText('موافق عليه')).toBeDefined();
      expect(screen.getByText('AUTH-999')).toBeDefined();
    });
  });

  it('submits a service-specific request with an exact decimal amount', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url) => {
      if (url === '/insurance/pre-auth/services')
        return { data: [{ id: 25, name: 'أدوية الوصفة', code: 'PHARMACY-DRUGS' }] };
      if (url.startsWith('/patients/search'))
        return { data: [{ id: 10 }] };
      if (url === '/patients/10')
        return { data: { id: 10, fullName: 'Synthetic patient', insurancePolicy: { id: 5 } } };
      if (url === '/insurance/coverage-balance/10')
        return { data: { policyId: 5, cap: '4.000', remainingAmount: '1.334', requiresReconciliation: false } };
      return { data: mockPreAuths };
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    render(<PreAuthPage />);
    fireEvent.click(screen.getByRole('button', { name: /طلب موافقة جديد/ }));
    await screen.findByRole('option', { name: /أدوية الوصفة/ });
    fireEvent.change(screen.getByLabelText('الخدمة المطلوب اعتمادها'), { target: { value: '25' } });
    fireEvent.change(screen.getByPlaceholderText(/MRN-0001/), { target: { value: 'MRN-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'بحث' }));
    await screen.findByText('Synthetic patient');
    expect(await screen.findByText(/1.334/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('مثال: 500'), { target: { value: '2.666' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الطلب' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/insurance/pre-auth',
      expect.objectContaining({ patientId: 10, policyId: 5, serviceItemId: 25, requestedAmount: '2.666' }),
    ));
  });

  it('requires the decision reason when declining a prescription-linked request', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [{
      ...mockPreAuths[0],
      isPrescriptionRequest: true,
      prescription: { id: 42, encounterId: 5, status: 'DRAFT', prepaidInvoiceId: null },
    }] });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    render(<PreAuthPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'رفض' }));
    const submit = screen.getByRole('button', { name: 'تأكيد الرفض' });
    fireEvent.click(submit);
    expect(apiClient.patch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('سبب القرار'), {
      target: { value: 'سبب الرفض الموثق' },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith(
      '/insurance/pre-auth/1',
      expect.objectContaining({ status: 'REJECTED', decisionReason: 'سبب الرفض الموثق' }),
    ));
  });

  it('should show action buttons only for PENDING pre-auths', async () => {
    render(<PreAuthPage />);
    await waitFor(() => {
      // PENDING row should have action buttons
      const confirmButtons = screen.getAllByText('تأكيد');
      expect(confirmButtons.length).toBe(1);
    });
  });

  it('should render the NPHIES button for PENDING pre-auths', async () => {
    render(<PreAuthPage />);
    await waitFor(() => {
      expect(screen.getByText('نفيس')).toBeDefined();
    });
  });

  it('should open NPHIES modal when clicking the NPHIES button', async () => {
    render(<PreAuthPage />);
    await waitFor(() => screen.getByText('نفيس'));

    fireEvent.click(screen.getByText('نفيس'));

    await waitFor(() => {
      expect(screen.getByText(/إرسال إلى منصة نفيس/)).toBeDefined();
      // Patient and provider names appear in table AND modal
      expect(screen.getAllByText(/أحمد محمد/).length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText(/بوبا العربية/).length).toBeGreaterThanOrEqual(2);
    });
  });

  it('should show CPT and ICD-10 input fields in NPHIES modal', async () => {
    render(<PreAuthPage />);
    await waitFor(() => screen.getByText('نفيس'));
    fireEvent.click(screen.getByText('نفيس'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('رمز CPT')).toBeDefined();
      expect(screen.getByPlaceholderText('رمز ICD-10')).toBeDefined();
    });
  });

  it('should render NPHIES eligibility button in Add modal', async () => {
    render(<PreAuthPage />);
    fireEvent.click(screen.getByText('+ طلب موافقة جديد'));

    await waitFor(() => {
      expect(screen.getByText('أهلية NPHIES')).toBeDefined();
    });
  });

  it('should show add service and add diagnosis buttons in NPHIES modal', async () => {
    render(<PreAuthPage />);
    await waitFor(() => screen.getByText('نفيس'));
    fireEvent.click(screen.getByText('نفيس'));

    await waitFor(() => {
      expect(screen.getByText(/إضافة خدمة/i)).toBeDefined();
      expect(screen.getByText(/إضافة تشخيص/i)).toBeDefined();
    });
  });
});
