import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QualityAndSafetyPage from './QualityAndSafetyPage';
import { apiClient } from '../api/apiClient';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const renderComponent = (initialEntries = ['/quality']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/quality" element={<QualityAndSafetyPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('QualityAndSafetyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashboard tab by default and loads stats', async () => {
     
    (apiClient.get as any).mockResolvedValueOnce({
      data: {
        byStatus: { REPORTED: 5, CLOSED: 10 },
        bySeverity: { MINOR: 8, MAJOR: 2 },
        openCapas: 3,
        overdueCapas: 1,
        recentIncidents: [],
      }
    });

    renderComponent();

    // Loading state initially
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/quality/dashboard');
    });

    // Check stats are rendered
    expect(screen.getByText('15')).toBeInTheDocument(); // 5 + 10 = 15 total incidents
    expect(screen.getByText('5')).toBeInTheDocument();  // 5 reported
    expect(screen.getByText('3')).toBeInTheDocument();  // 3 open capas
    expect(screen.getByText('1')).toBeInTheDocument();  // 1 overdue capa
  });

  it('switches to the incidents tab when clicked and fetches data', async () => {
     
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url.includes('/quality/dashboard')) return Promise.resolve({
        data: {
          byStatus: {},
          bySeverity: {},
          openCapas: 0,
          overdueCapas: 0,
          recentIncidents: [],
        }
      });
      if (url.includes('/quality/incidents')) {
        return Promise.resolve({
          data: {
            items: [
              {
                id: 1,
                incidentNumber: 'INC-2026-0001',
                incidentType: 'OTHER',
                severity: 'MINOR',
                status: 'REPORTED',
                description: 'Patient slipped but did not fall.',
                location: 'Ward A',
                isAnonymous: false,
                reportedAt: '2026-05-17T10:00:00Z',
                incidentDate: '2026-05-17T10:00:00Z',
                reporter: { id: 1, fullName: 'John Doe' },
                patient: null,
                _count: { capaActions: 0 },
              },
            ],
          }
        });
      }
      return Promise.resolve({});
    });

    renderComponent();

    const incidentsTab = await screen.findByRole('button', { name: /الحوادث/i });
    fireEvent.click(incidentsTab);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('/quality/incidents'));
    });

    expect(await screen.findByText('INC-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Patient slipped but did not fall.')).toBeInTheDocument();
  });

  it('can submit a new incident report', async () => {
     
    (apiClient.get as any).mockResolvedValue({
      data: {
        byStatus: {},
        bySeverity: {},
        openCapas: 0,
        overdueCapas: 0,
        recentIncidents: [],
      }
    });
     
    (apiClient.post as any).mockResolvedValue({ data: { id: 2, incidentNumber: 'INC-2026-0002' } });

    renderComponent(['/quality?tab=report']);

    const descriptionInput = await screen.findByPlaceholderText(/اشرح ما حدث بدقة/i);
    fireEvent.change(descriptionInput, { target: { value: 'This is a test description that is longer than 20 characters.' } });

    const submitBtn = screen.getByRole('button', { name: /إرسال البلاغ/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/quality/incidents', expect.objectContaining({
        description: 'This is a test description that is longer than 20 characters.',
        severity: 'MINOR',
      }));
    });
  });
});
