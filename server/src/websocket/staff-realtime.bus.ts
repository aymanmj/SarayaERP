import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import type { NursingRecordNotice } from '../nursing/nursing-notification-journal';

const names = [
  'auth.device_session_invalidated',
  'auth.device_branch_changed',
  'auth.branch_access_revoked',
  'auth.session_invalidated',
  'user.deactivated',
  'user.roles_updated',
] as const;
type EventName = (typeof names)[number];
type Invalidation = { event: EventName; payload: Record<string, unknown> };

export const NURSING_RECORD_RECEIVED = 'nursing.notification_record_received';

function isDatabaseId(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 2147483647
  );
}

function isNursingRecordNotice(value: unknown): value is NursingRecordNotice {
  if (!value || typeof value !== 'object') return false;
  const notice = value as Partial<NursingRecordNotice>;
  return (
    (notice.kind === 'medication' || notice.kind === 'vital') &&
    isDatabaseId(notice.hospitalId) &&
    isDatabaseId(notice.encounterId) &&
    isDatabaseId(notice.recordId)
  );
}

function isInvalidation(data: unknown): data is Invalidation {
  if (!data || typeof data !== 'object') return false;
  const { event, payload } = data as Partial<Invalidation>;
  if (
    !event ||
    !names.includes(event) ||
    !payload ||
    typeof payload !== 'object'
  )
    return false;
  if (
    event === 'auth.device_session_invalidated' ||
    event === 'auth.device_branch_changed'
  ) {
    return (
      typeof payload.sessionId === 'string' &&
      /^[0-9a-f-]{36}$/.test(payload.sessionId) &&
      (event !== 'auth.device_branch_changed' ||
        (Number.isSafeInteger(payload.branchVersion) &&
          Number(payload.branchVersion) >= 0))
    );
  }
  return (
    Number.isSafeInteger(payload.userId) &&
    Number(payload.userId) > 0 &&
    Number.isSafeInteger(payload.hospitalId) &&
    Number(payload.hospitalId) > 0
  );
}

@Injectable()
export class StaffRealtimeBus
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(StaffRealtimeBus.name);
  private readonly nodeId = randomUUID();
  private publisher?: Redis;
  private subscriber?: Redis;
  private invalidationChannel?: string;
  private nursingChannel?: string;
  private subscribed = false;

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  onApplicationBootstrap() {
    if (
      this.config.get('REDIS_MOCK') === 'true' &&
      process.env.NODE_ENV !== 'production'
    )
      return;
    const database = this.config.get<string>('DATABASE_URL');
    if (!database) return;
    const url = new URL(database);
    const scope =
      this.config.get<string>('STAFF_INVALIDATION_NAMESPACE') ||
      `${url.host}${url.pathname}`;
    const digest = (value: string) =>
      createHash('sha256').update(value).digest('hex').slice(0, 24);
    const invalidationChannel = `saraya:staff-invalidation:v1:${digest(scope)}`;
    const schema = url.searchParams.get('schema') || 'public';
    const nursingChannel = `saraya:nursing-record:v1:${digest(JSON.stringify([scope, schema]))}`;
    this.invalidationChannel = invalidationChannel;
    this.nursingChannel = nursingChannel;
    const options = {
      host: this.config.get<string>('REDIS_HOST') || 'localhost',
      port: Number(this.config.get('REDIS_PORT') || 6379),
      password: this.config.get<string>('REDIS_PASSWORD'),
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    };
    this.publisher = new Redis({
      ...options,
      autoResendUnfulfilledCommands: false,
    });
    this.subscriber = new Redis(options);
    for (const client of [this.publisher, this.subscriber]) {
      client.on('error', () =>
        this.logger.warn('Staff realtime Redis connection unavailable'),
      );
    }
    this.subscriber.on('close', () => {
      this.subscribed = false;
    });
    this.subscriber.on('ready', () => {
      const subscriber = this.subscriber;
      if (!subscriber) return;
      void subscriber
        .subscribe(invalidationChannel, nursingChannel)
        .then(() => {
          this.subscribed = true;
        })
        .catch(() =>
          this.logger.warn('Staff realtime subscription unavailable'),
        );
    });
    this.subscriber.on('message', (channel: string, message: string) => {
      if (message.length > 1000) return;
      try {
        const envelope = JSON.parse(message) as {
          nodeId?: string;
          event?: unknown;
          payload?: unknown;
        };
        if (
          !envelope ||
          typeof envelope.nodeId !== 'string' ||
          envelope.nodeId === this.nodeId
        )
          return;
        if (
          channel === nursingChannel &&
          isNursingRecordNotice(envelope.payload)
        ) {
          this.events.emit(NURSING_RECORD_RECEIVED, envelope.payload);
        } else if (
          channel === invalidationChannel &&
          isInvalidation(envelope)
        ) {
          this.events.emit(envelope.event, envelope.payload, 'remote');
        }
      } catch {
        this.logger.warn('Rejected malformed staff realtime message');
      }
    });
  }

  isReady() {
    return this.subscribed && this.publisher?.status === 'ready';
  }

  @OnEvent('auth.device_session_invalidated')
  device(payload: unknown, source?: string) {
    return this.forward('auth.device_session_invalidated', payload, source);
  }
  @OnEvent('auth.device_branch_changed')
  deviceBranch(payload: unknown, source?: string) {
    return this.forward('auth.device_branch_changed', payload, source);
  }
  @OnEvent('auth.branch_access_revoked')
  branch(payload: unknown, source?: string) {
    return this.forward('auth.branch_access_revoked', payload, source);
  }
  @OnEvent('auth.session_invalidated')
  account(payload: unknown, source?: string) {
    return this.forward('auth.session_invalidated', payload, source);
  }
  @OnEvent('user.deactivated')
  deactivated(payload: unknown, source?: string) {
    return this.forward('user.deactivated', payload, source);
  }
  @OnEvent('user.roles_updated')
  roles(payload: unknown, source?: string) {
    return this.forward('user.roles_updated', payload, source);
  }

  @OnEvent('nursing.medication_administered')
  medication(event: {
    hospitalId: number;
    encounterId: number;
    administrationId: number;
  }) {
    return this.forwardNursingRecord({
      kind: 'medication',
      hospitalId: event.hospitalId,
      encounterId: event.encounterId,
      recordId: event.administrationId,
    });
  }

  @OnEvent('vitals.recorded')
  vitals(event: {
    hospitalId: number;
    encounterId: number;
    vitalSignId: number;
  }) {
    return this.forwardNursingRecord({
      kind: 'vital',
      hospitalId: event.hospitalId,
      encounterId: event.encounterId,
      recordId: event.vitalSignId,
    });
  }

  private async forwardNursingRecord(notice: NursingRecordNotice) {
    if (
      !this.nursingChannel ||
      !this.publisher ||
      !isNursingRecordNotice(notice)
    )
      return;
    try {
      await this.publisher.publish(
        this.nursingChannel,
        JSON.stringify({ nodeId: this.nodeId, payload: notice }),
      );
    } catch {
      this.logger.warn(
        'Nursing notification was not distributed to other servers',
      );
    }
  }

  private async forward(event: EventName, payload: unknown, source?: string) {
    if (
      source === 'remote' ||
      !this.invalidationChannel ||
      !this.publisher ||
      !isInvalidation({ event, payload })
    )
      return;
    try {
      await this.publisher.publish(
        this.invalidationChannel,
        JSON.stringify({ nodeId: this.nodeId, event, payload }),
      );
    } catch {
      this.logger.warn(
        'Staff invalidation was not distributed; socket revalidation will check the database',
      );
    }
  }

  onModuleDestroy() {
    this.subscriber?.disconnect();
    this.publisher?.disconnect();
  }
}
