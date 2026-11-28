// server/src/hr/dto/employee.dto.spec.ts
import { BadRequestException } from '@nestjs/common';
import { createAppValidationPipe } from '../../common/http/validation-pipe.config';
import {
  BulkImportEmployeeRowDto,
  BulkImportEmployeesDto,
} from './employee.dto';

describe('BulkImportEmployeesDto under production ValidationPipe', () => {
  const pipe = createAppValidationPipe(true);

  it('transforms nested employee rows as BulkImportEmployeeRowDto instances (never Array) even with numeric strings/numbers', async () => {
    const payload = {
      employees: [
        {
          altamamEmployeeNo: 'TAM-101',
          fullName: 'ابتسام احمد عبدالله',
          departmentName: 'الإدارة العامة ومكتب المدير',
          staffCategory: 'إداري',
          jobTitle: 'موظف',
          qualification: 'بكالوريوس',
          basicSalary: 2200,
          phone: 912345678,
          nationalId: 119850123456,
          hireDate: 45672,
        },
        {
          employeeNo: 'EMP-0306',
          fullName: 'ابتسام ضو',
          departmentName: 'الإدارة العامة ومكتب المدير',
          basicSalary: 0,
        },
      ],
    };

    const result = (await pipe.transform(payload, {
      type: 'body',
      metatype: BulkImportEmployeesDto,
    })) as BulkImportEmployeesDto;

    expect(result).toBeInstanceOf(BulkImportEmployeesDto);
    expect(result.employees).toHaveLength(2);
    expect(Array.isArray(result.employees[0])).toBe(false);
    expect(result.employees[0]).toBeInstanceOf(BulkImportEmployeeRowDto);
    expect(result.employees[0].nationalId).toBe('119850123456');
    expect(result.employees[0].phone).toBe('912345678');
    expect(result.employees[0].hireDate).toBe('45672');
    expect(result.employees[0].basicSalary).toBe(2200);
  });

  it('rejects unknown properties inside employee rows under production forbidNonWhitelisted', async () => {
    const payload = {
      employees: [
        {
          fullName: 'موظف اختبار',
          foo: 'x',
        },
      ],
    };

    await expect(
      pipe.transform(payload, {
        type: 'body',
        metatype: BulkImportEmployeesDto,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
