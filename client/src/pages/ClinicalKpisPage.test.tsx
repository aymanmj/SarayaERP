import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClinicalKpisPage from './ClinicalKpisPage';
import { apiClient } from '../api/apiClient';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

vi.mock('recharts', async () => {
  const OriginalRechartsModule = await vi.importActual('recharts');
  return {
    ...OriginalRechartsModule,
    ResponsiveContainer: ({ children }: any) => (
      <div style={{ width: '100%', height: '100%' }}>{children}</div>
    ),
  };
});

const renderComponent = () => {
  return render(
    <MemoryRouter>
      <ClinicalKpisPage />
    </MemoryRouter>
  );
};

describe('ClinicalKpisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    (apiClient.get as any).mockResolvedValue(new Promise(() => {})); // Never resolves
    renderComponent();
    expect(screen.getByText(/جاري تجميع المؤشرات السريرية/i)).toBeInTheDocument();
  });

  it('fetches and displays HIMSS KPIs successfully', async () => {
    (apiClient.get as any).mockResolvedValueOnce({
      data: {
        readmissionRate: 12.5,
        averageLengthOfStay: 4.2,
        medicationOverrideRate: 8.1,
        alertFatigueRate: 15.3,
        careGapClosureRate: 85.0,
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/analytics/clinical-kpis');
    });

    expect(screen.queryByText(/جاري تجميع المؤشرات/i)).not.toBeInTheDocument();
    
    // Check values
    expect(screen.getByText('12.5')).toBeInTheDocument();
    expect(screen.getByText('4.2')).toBeInTheDocument();
    expect(screen.getByText('8.1')).toBeInTheDocument();
    expect(screen.getByText('15.3')).toBeInTheDocument();
    expect(screen.getByText('85.0')).toBeInTheDocument();
  });

  it('handles API failure gracefully', async () => {
    (apiClient.get as any).mockRejectedValueOnce(new Error('Network Error'));

    renderComponent();

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/analytics/clinical-kpis');
    });

    // The page should still render but with 0 values
    expect(screen.queryByText(/جاري تجميع المؤشرات/i)).not.toBeInTheDocument();
    
    // It should render 0 for values when kpis is null/undefined
    const zeroElements = screen.getAllByText('0');
    expect(zeroElements.length).toBeGreaterThan(0);
  });
});
