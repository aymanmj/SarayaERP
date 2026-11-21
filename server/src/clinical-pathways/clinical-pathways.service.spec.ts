import type { Prisma } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { VarianceType } from '@prisma/client';
import { ClinicalPathwaysService } from './clinical-pathways.service';

type Enrollment = Awaited<ReturnType<ClinicalPathwaysService['getEnrollment']>>;

describe('pathway lifecycle boundaries', () => {
  const enrollment = (day: number): Enrollment =>
    ({
      id: 1,
      pathwayId: 3,
      encounterId: 7,
      status: 'ACTIVE',
      currentDay: day,
      pathway: {
        steps: [
          { id: 11, dayNumber: 1, title: 'Day one' },
          {
            id: 12,
            dayNumber: 2,
            title: 'Final day',
            milestones: 'Assess\nReview',
          },
        ],
      },
    }) as unknown as Enrollment;

  it('keeps the final day active and creates separate tasks for real newline milestones', async () => {
    const create = jest.fn(() => Promise.resolve({}));
    const update = jest
      .fn<Promise<{ ok: boolean }>, [Prisma.PathwayEnrollmentUpdateArgs]>()
      .mockResolvedValue({ ok: true });
    const service = Object.create(
      ClinicalPathwaysService.prototype,
    ) as ClinicalPathwaysService;
    Object.defineProperty(service, 'prisma', {
      value: {
        careTask: { count: () => Promise.resolve(0), create },
        pathwayEnrollment: { update },
      },
    });
    const lookup = jest
      .spyOn(service, 'getEnrollment')
      .mockResolvedValue(enrollment(1));
    await service.advanceDay(1, 2, 8);
    expect(create).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0][0].data).toMatchObject({
      status: 'ACTIVE',
      currentDay: 2,
    });
    expect(lookup).toHaveBeenCalledWith(1, 8);
  });

  it('prevents advancement while current tasks remain pending', async () => {
    const update = jest.fn();
    const service = Object.create(
      ClinicalPathwaysService.prototype,
    ) as ClinicalPathwaysService;
    Object.defineProperty(service, 'prisma', {
      value: {
        careTask: { count: () => Promise.resolve(1) },
        pathwayEnrollment: { update },
      },
    });
    jest.spyOn(service, 'getEnrollment').mockResolvedValue(enrollment(1));
    await expect(service.advanceDay(1, 2, 8)).rejects.toThrow(
      ForbiddenException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a step from a different day when reporting a variance', async () => {
    const service = Object.create(
      ClinicalPathwaysService.prototype,
    ) as ClinicalPathwaysService;
    jest.spyOn(service, 'getEnrollment').mockResolvedValue(enrollment(1));
    await expect(
      service.reportVariance(
        1,
        2,
        {
          stepId: 12,
          reason: 'Synthetic reason',
          varianceType: Object.values(VarianceType)[0],
        },
        8,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('filters enrollment reads by the owning hospital', async () => {
    const findUnique = jest.fn(() => Promise.resolve(null));
    const service = Object.create(
      ClinicalPathwaysService.prototype,
    ) as ClinicalPathwaysService;
    Object.defineProperty(service, 'prisma', {
      value: { pathwayEnrollment: { findUnique } },
    });
    await expect(service.getEnrollment(1, 8)).rejects.toThrow(
      NotFoundException,
    );
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, pathway: { hospitalId: 8 } } }),
    );
  });

  it('lists hospital enrollments scoped by tenant and enriched with encounter patient info (UI02)', async () => {
    const findManyEnrollments = jest.fn().mockResolvedValue([
      {
        id: 10,
        pathwayId: 3,
        encounterId: 44,
        patientId: 9,
        status: 'ACTIVE',
        currentDay: 2,
        pathway: {
          id: 3,
          name: 'Sepsis Bundle',
          nameAr: 'مسار الإنتان',
          expectedLOS: 5,
        },
        enrolledBy: { id: 2, fullName: 'Dr. Ali' },
        variances: [],
      },
    ]);
    const findManyEncounters = jest.fn().mockResolvedValue([
      {
        id: 44,
        status: 'OPEN',
        patient: { id: 9, fullName: 'Patient One', mrn: 'MRN-09' },
      },
    ]);
    const service = Object.create(
      ClinicalPathwaysService.prototype,
    ) as ClinicalPathwaysService;
    Object.defineProperty(service, 'prisma', {
      value: {
        pathwayEnrollment: { findMany: findManyEnrollments },
        encounter: { findMany: findManyEncounters },
      },
    });

    const list = await service.listEnrollments(8, 'ACTIVE');
    expect(findManyEnrollments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pathway: { hospitalId: 8 }, status: 'ACTIVE' },
      }),
    );
    expect(findManyEncounters).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hospitalId: 8, id: { in: [44] } },
      }),
    );
    expect(list[0]).toMatchObject({
      id: 10,
      encounterId: 44,
      encounterStatus: 'OPEN',
      patient: { id: 9, fullName: 'Patient One', mrn: 'MRN-09' },
    });
  });
});
