import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RadiologyViewerService } from './radiology-viewer.service';

describe('RadiologyViewerService', () => {
  it('emits white-labeled Saraya PACS OHIF configuration without investigational banner', () => {
    const service = new RadiologyViewerService(
      {} as PrismaService,
      new JwtService({ secret: 'unit-test-secret' }),
    );

    const jsConfig = service.configuration(42);

    expect(jsConfig).toContain('/api/radiology/viewer/42/dicom-web');
    expect(jsConfig).toContain('"investigationalUseDialog":{"option":"never"}');
    expect(jsConfig).toContain('whiteLabeling');
    expect(jsConfig).toContain('createLogoComponentFn');
    expect(jsConfig).toContain('Saraya PACS');
  });
});
