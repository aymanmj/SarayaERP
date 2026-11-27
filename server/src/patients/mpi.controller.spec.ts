import { MpiController } from './mpi.controller';
import type { MpiService } from './mpi.service';

describe('MpiController', () => {
  const triggerConsentOtpMock = jest
    .fn()
    .mockResolvedValue({ message: 'OTP sent' });
  const revokeConsentMock = jest
    .fn()
    .mockResolvedValue({ message: 'Consent revoked' });

  const mpiService = {
    triggerConsentOtp: triggerConsentOtpMock,
    revokeConsent: revokeConsentMock,
  } as unknown as MpiService;

  const controller = new MpiController(mpiService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves requestingUserId from JWT sub when id is absent in triggerConsentOtp', async () => {
    await controller.triggerConsentOtp(42, 'Consultation', {
      user: {
        sub: 77,
        username: 'dr.tariq',
        hospitalId: 1,
        organizationId: 9,
        roles: ['DOCTOR'],
        permissions: ['patients:manage'],
      },
    } as never);

    expect(triggerConsentOtpMock).toHaveBeenCalledWith(
      42,
      'dr.tariq',
      'Saraya General Hospital',
      9,
      1,
      77,
      'Consultation',
    );
  });

  it('resolves revokedByUserId and role cleanly from JwtPayload in revokeConsent', async () => {
    await controller.revokeConsent(
      42,
      { reason: 'Patient request', organizationId: 9 },
      {
        user: {
          sub: 88,
          username: 'admin',
          hospitalId: 1,
          organizationId: 9,
          roles: ['ADMIN'],
          permissions: ['patients:manage'],
        },
      } as never,
    );

    expect(revokeConsentMock).toHaveBeenCalledWith({
      patientId: 42,
      revokedByUserId: 88,
      revokedByRole: 'ADMIN',
      organizationId: 9,
      reason: 'Patient request',
    });
  });
});
