import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureGuard, EditionGuard } from './FeatureGuard';
import { useLicenseFeatures } from '../hooks/useLicenseFeatures';

// Mock the hook
vi.mock('../hooks/useLicenseFeatures', () => ({
  useLicenseFeatures: vi.fn(),
}));

describe('FeatureGuard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render children when feature is available', () => {
    (useLicenseFeatures as ReturnType<typeof vi.fn>).mockReturnValue({
      hasFeature: (f: string) => f === 'CDSS',
      edition: 'ENTERPRISE',
    });

    render(
      <FeatureGuard feature="CDSS">
        <div>CDSS Module</div>
      </FeatureGuard>
    );

    expect(screen.getByText('CDSS Module')).toBeInTheDocument();
  });

  it('should hide children when feature is NOT available', () => {
    (useLicenseFeatures as ReturnType<typeof vi.fn>).mockReturnValue({
      hasFeature: () => false,
      edition: 'STANDARD',
    });

    render(
      <FeatureGuard feature="CDSS">
        <div>CDSS Module</div>
      </FeatureGuard>
    );

    expect(screen.queryByText('CDSS Module')).not.toBeInTheDocument();
  });

  it('should show fallback when feature is NOT available', () => {
    (useLicenseFeatures as ReturnType<typeof vi.fn>).mockReturnValue({
      hasFeature: () => false,
      edition: 'STANDARD',
    });

    render(
      <FeatureGuard feature="ADVANCED_BILLING" fallback={<span>Upgrade Required</span>}>
        <div>Billing Pro</div>
      </FeatureGuard>
    );

    expect(screen.queryByText('Billing Pro')).not.toBeInTheDocument();
    expect(screen.getByText('Upgrade Required')).toBeInTheDocument();
  });

  it('should render null fallback by default when feature is missing', () => {
    (useLicenseFeatures as ReturnType<typeof vi.fn>).mockReturnValue({
      hasFeature: () => false,
      edition: 'STANDARD',
    });

    const { container } = render(
      <FeatureGuard feature="NONEXISTENT">
        <div>Hidden</div>
      </FeatureGuard>
    );

    expect(container.innerHTML).toBe('');
  });
});

describe('EditionGuard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render children when edition is allowed', () => {
    (useLicenseFeatures as ReturnType<typeof vi.fn>).mockReturnValue({
      hasFeature: vi.fn(),
      edition: 'ENTERPRISE',
    });

    render(
      <EditionGuard allowedEditions={['ENTERPRISE', 'PRO']}>
        <div>Enterprise Content</div>
      </EditionGuard>
    );

    expect(screen.getByText('Enterprise Content')).toBeInTheDocument();
  });

  it('should hide children when edition is NOT allowed', () => {
    (useLicenseFeatures as ReturnType<typeof vi.fn>).mockReturnValue({
      hasFeature: vi.fn(),
      edition: 'STANDARD',
    });

    render(
      <EditionGuard allowedEditions={['ENTERPRISE']}>
        <div>Enterprise Only</div>
      </EditionGuard>
    );

    expect(screen.queryByText('Enterprise Only')).not.toBeInTheDocument();
  });

  it('should show fallback when edition is NOT allowed', () => {
    (useLicenseFeatures as ReturnType<typeof vi.fn>).mockReturnValue({
      hasFeature: vi.fn(),
      edition: 'STANDARD',
    });

    render(
      <EditionGuard
        allowedEditions={['ENTERPRISE']}
        fallback={<span>Enterprise plan required</span>}
      >
        <div>Premium Content</div>
      </EditionGuard>
    );

    expect(screen.queryByText('Premium Content')).not.toBeInTheDocument();
    expect(screen.getByText('Enterprise plan required')).toBeInTheDocument();
  });

  it('should support multiple allowed editions', () => {
    (useLicenseFeatures as ReturnType<typeof vi.fn>).mockReturnValue({
      hasFeature: vi.fn(),
      edition: 'PRO',
    });

    render(
      <EditionGuard allowedEditions={['PRO', 'ENTERPRISE']}>
        <div>Pro or Enterprise</div>
      </EditionGuard>
    );

    expect(screen.getByText('Pro or Enterprise')).toBeInTheDocument();
  });
});
