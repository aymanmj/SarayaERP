// server/src/hr/employees.service.spec.ts
import { ConflictException } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('EmployeesService (Batch 45 Wave 1/2)', () => {
  it('returns default LYD currency and Altamam disabled config when no rows exist', async () => {
    const prisma = {
      systemSetting: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const svc = new EmployeesService(prisma);
    const cfg = await svc.getHrConfig(1);
    expect(cfg).toEqual({
      altamamIntegrationEnabled: false,
      defaultCurrency: 'LYD',
    });
  });

  it('reads enabled Altamam toggle and computes next EMP-XXXX serial per hospital', async () => {
    const prisma = {
      systemSetting: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'hr.altamamIntegrationEnabled', value: 'true' },
          { key: 'hr.defaultCurrency', value: 'LYD' },
        ]),
      },
      employee: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { employeeNo: 'EMP-0002' },
            { employeeNo: 'EMP-0009' },
            { employeeNo: 'CUSTOM-7' },
          ]),
      },
    } as unknown as PrismaService;

    const svc = new EmployeesService(prisma);
    expect(await svc.getHrConfig(1)).toEqual({
      altamamIntegrationEnabled: true,
      defaultCurrency: 'LYD',
    });
    expect(await svc.getNextEmployeeNumber(1)).toEqual({
      nextEmployeeNo: 'EMP-0010',
    });
  });

  it('creates a non-login employee (userId: null) and rejects duplicate biometricId within same hospital', async () => {
    const txEmployeeCreate = jest.fn().mockResolvedValue({ id: 42 });
    const prisma = {
      systemSetting: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(1),
          department: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
          section: { findFirst: jest.fn().mockResolvedValue(null) },
          jobTitle: { findFirst: jest.fn().mockResolvedValue(null) },
          employee: {
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest
              .fn()
              .mockResolvedValueOnce(null) // employeeNo check
              .mockResolvedValueOnce(null) // altamam check
              .mockResolvedValueOnce(null), // biometricId check
            create: txEmployeeCreate,
          },
          auditLog: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 1 }),
          },
        };
        return cb(tx);
      }),
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 42,
          hospitalId: 1,
          employeeNo: 'EMP-0001',
          userId: null,
          fullName: 'خالد عمران مفتاح المصراتي',
          currency: 'LYD',
        }),
      },
    } as unknown as PrismaService;

    const svc = new EmployeesService(prisma);
    const created = await svc.create(1, 7, {
      firstNameAr: 'خالد',
      secondNameAr: 'عمران',
      thirdNameAr: 'مفتاح',
      lastNameAr: 'المصراتي',
      biometricId: 'BIO-77',
      departmentId: 1,
      basicSalary: 1850,
    });

    expect(txEmployeeCreate).toHaveBeenCalled();
    const calls = txEmployeeCreate.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    const createPayload = calls[0][0];
    expect(createPayload.data).toMatchObject({
      hospitalId: 1,
      employeeNo: 'EMP-0001',
      fullName: 'خالد عمران مفتاح المصراتي',
      basicSalary: '1850.000',
      currency: 'LYD',
    });
    expect(created?.userId).toBeNull();

    // Verify duplicate biometric check throws ConflictException
    const dupPrisma = {
      systemSetting: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          employee: {
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest
              .fn()
              .mockResolvedValueOnce(null) // employeeNo
              .mockResolvedValueOnce({
                id: 9,
                employeeNo: 'EMP-0001',
                fullName: 'موظف حالي',
              }), // biometric conflict
          },
        };
        return cb(tx);
      }),
    } as unknown as PrismaService;

    await expect(
      new EmployeesService(dupPrisma).create(1, 7, {
        firstNameAr: 'سالم',
        biometricId: 'BIO-77',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
