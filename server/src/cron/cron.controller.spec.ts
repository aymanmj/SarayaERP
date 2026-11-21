import { CronController } from './cron.controller';
import { NightlyBillingService } from './nightly-billing.service';
import type { JwtPayload } from '../auth/jwt-payload.type';

describe('Manual nightly billing scope', () => {
  it('passes the authenticated hospital explicitly, even without request-context tenant filtering', async () => {
    const runDailyBedCharges = jest.fn().mockResolvedValue({ success: true });
    const controller = new CronController({
      runDailyBedCharges,
    } as unknown as NightlyBillingService);
    await controller.triggerNightlyBilling({ hospitalId: 42 } as JwtPayload);
    expect(runDailyBedCharges).toHaveBeenCalledWith(42);
  });
});
