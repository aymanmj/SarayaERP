import type { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Socket, Server } from 'socket.io';
import { EventsGateway } from './events.gateway';
import { randomUUID } from 'node:crypto';

describe('hospital-isolated event gateway', () => {
  const sid = randomUUID();
  const prisma = {
    staffSession: { findFirst: jest.fn().mockResolvedValue({ id: sid }) },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: 7,
        hospitalId: 2,
        authVersion: 0,
        hospital: { isActive: true },
        userRoles: [{ role: { name: 'DOCTOR' } }],
      }),
    },
  } as unknown as PrismaService;
  const secret = 'isolated-event-test-signing-secret';
  const jwt = new JwtService();

  it('joins hospital-specific staff rooms', async () => {
    const join = jest.fn();
    const disconnect = jest.fn();
    const token = jwt.sign(
      { sub: 7, hospitalId: 2, sid, branchVersion: 0, roles: ['DOCTOR'] },
      { secret, issuer: 'saraya-staff' },
    );
    const client = {
      id: 'test',
      handshake: { auth: { token }, headers: {} },
      join,
      disconnect,
    } as unknown as Socket;
    await new EventsGateway(
      jwt,
      new ConfigService({ JWT_SECRET: secret }),
      prisma,
    ).handleConnection(client);
    expect(join).toHaveBeenCalledWith('HOSPITAL_2:ROLE_DOCTOR');
    expect(join).toHaveBeenCalledWith('HOSPITAL_2:USER_7');
    expect(join).not.toHaveBeenCalledWith('ROLE_DOCTOR');
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('rejects a correctly signed token from a patient issuer', async () => {
    const join = jest.fn();
    const disconnect = jest.fn();
    const token = jwt.sign(
      { sub: 7, hospitalId: 2, roles: ['DOCTOR'] },
      { secret, issuer: 'saraya-patient' },
    );
    const client = {
      id: 'test',
      handshake: { auth: { token }, headers: {} },
      join,
      disconnect,
    } as unknown as Socket;
    await new EventsGateway(
      jwt,
      new ConfigService({ JWT_SECRET: secret }),
      prisma,
    ).handleConnection(client);
    expect(disconnect).toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
  });

  it('targets only the event hospital and drops events without a hospital', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const gateway = new EventsGateway(
      jwt,
      new ConfigService({ JWT_SECRET: secret }),
      prisma,
    );
    gateway.server = { to } as unknown as Server;
    gateway.handleLabOrder({
      hospitalId: 2,
      orderId: 9,
      patientName: 'Synthetic',
      testsCount: 1,
    });
    expect(to).toHaveBeenCalledWith([
      'HOSPITAL_2:ROLE_LAB_TECH',
      'HOSPITAL_2:ROLE_ADMIN',
      'HOSPITAL_2:ROLE_DOCTOR',
    ]);
    to.mockClear();
    gateway.handleLabOrder({ orderId: 9 });
    expect(to).not.toHaveBeenCalled();
  });
});
