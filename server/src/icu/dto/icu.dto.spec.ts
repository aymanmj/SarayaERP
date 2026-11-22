import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DailyAssessmentDto } from './icu-assessment.dto';
import { RecordVitalsDto } from './icu.dto';

describe('ICU DTO safety bounds (UI10)', () => {
  describe('RecordVitalsDto', () => {
    it('accepts physiologically valid FiO2, PEEP, SpO2, and GCS values', async () => {
      const dto = plainToInstance(RecordVitalsDto, {
        encounterId: 10,
        shiftName: 'MORNING',
        ventFio2: 40,
        ventPeep: 5,
        o2Sat: 98,
        gcsScore: 15,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects out-of-range ventFio2 (< 21 or > 100), ventPeep (< 0 or > 30), o2Sat (> 100), and gcsScore (< 3 or > 15)', async () => {
      const lowBounds = plainToInstance(RecordVitalsDto, {
        encounterId: 10,
        shiftName: 'MORNING',
        ventFio2: 15,
        ventPeep: -1,
        o2Sat: -2,
        gcsScore: 2,
      });
      const lowErrors = await validate(lowBounds);
      expect(lowErrors.map((e) => e.property).sort()).toEqual([
        'gcsScore',
        'o2Sat',
        'ventFio2',
        'ventPeep',
      ]);

      const highBounds = plainToInstance(RecordVitalsDto, {
        encounterId: 10,
        shiftName: 'MORNING',
        ventFio2: 105,
        ventPeep: 35,
        o2Sat: 105,
        gcsScore: 16,
      });
      const highErrors = await validate(highBounds);
      expect(highErrors.map((e) => e.property).sort()).toEqual([
        'gcsScore',
        'o2Sat',
        'ventFio2',
        'ventPeep',
      ]);
    });
  });

  describe('DailyAssessmentDto', () => {
    it('accepts valid fio2 (21-100) and gcsTotal (3-15)', async () => {
      const dto = plainToInstance(DailyAssessmentDto, {
        encounterId: 10,
        assessmentDate: '2026-11-22',
        fio2: 21,
        gcsTotal: 15,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects fio2 below 21 or above 100', async () => {
      const below = plainToInstance(DailyAssessmentDto, {
        encounterId: 10,
        assessmentDate: '2026-11-22',
        fio2: 10,
      });
      expect((await validate(below)).map((e) => e.property)).toContain('fio2');

      const above = plainToInstance(DailyAssessmentDto, {
        encounterId: 10,
        assessmentDate: '2026-11-22',
        fio2: 120,
      });
      expect((await validate(above)).map((e) => e.property)).toContain('fio2');
    });
  });
});
