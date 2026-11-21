import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSystemSettingDto } from './dto/update-system-setting.dto';
import { SystemSetting } from '@prisma/client';
import {
  defaultRoomSettings,
  parseRoomDayPolicy,
  parseRoomTimeZone,
  ROOM_POLICY_KEY,
} from '../admission/room-billing-policy';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';

@Injectable()
export class SystemSettingsService {
  constructor(private prisma: PrismaService) {}

  async findAll(hospitalId: number) {
    const settings = await this.prisma.systemSetting.findMany({
      where: { hospitalId },
      orderBy: { group: 'asc' },
    });

    // Grouping logic can be done here or frontend. Let's return flat list for now.
    return [
      ...settings,
      ...defaultRoomSettings(hospitalId).filter(
        (fallback) => !settings.some((setting) => setting.key === fallback.key),
      ),
    ];
  }

  async findOne(hospitalId: number, key: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { hospitalId_key: { hospitalId, key } },
    });
    if (!setting) {
      const fallback = defaultRoomSettings(hospitalId).find(
        (candidate) => candidate.key === key,
      );
      if (fallback) return fallback;
      throw new NotFoundException(`Setting with key ${key} not found`);
    }
    return setting;
  }

  async update(
    hospitalId: number,
    key: string,
    updateDto: UpdateSystemSettingDto,
    userId?: number,
  ) {
    const fallback = defaultRoomSettings(hospitalId).find(
      (candidate) => candidate.key === key,
    );
    if (fallback) {
      const value =
        key === ROOM_POLICY_KEY
          ? parseRoomDayPolicy(updateDto.value)
          : parseRoomTimeZone(updateDto.value);
      return this.prisma.$transaction(async (tx) => {
        // Separate advisory namespace serializes configuration without locking the
        // Hospital row used by audit foreign keys (which would invert lock order).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(27002::integer, ${hospitalId}::integer)`;
        const previous = await tx.systemSetting.findUnique({
          where: { hospitalId_key: { hospitalId, key } },
        });
        const updated = await tx.systemSetting.upsert({
          where: { hospitalId_key: { hospitalId, key } },
          create: {
            hospitalId,
            key,
            value,
            type: fallback.type,
            group: fallback.group,
            description: fallback.description,
          },
          update: { value },
        });
        await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId: userId ?? null,
          action: 'UPDATE_ROOM_BILLING_CONFIGURATION',
          entity: 'SystemSetting',
          entityId: updated.id,
          oldValues: { key, value: previous?.value ?? fallback.value },
          newValues: { key, value },
        });
        return updated;
      });
    }
    // Check if exists
    await this.findOne(hospitalId, key);

    return this.prisma.systemSetting.update({
      where: { hospitalId_key: { hospitalId, key } },
      data: {
        value: updateDto.value,
        // We typically don't update type or group via API, just value
      },
    });
  }

  // --- Internal Helpers ---

  async getValue(hospitalId: number, key: string): Promise<string | null> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { hospitalId_key: { hospitalId, key } },
    });
    return setting?.value ?? null;
  }

  async getString(
    hospitalId: number,
    key: string,
    defaultValue: string,
  ): Promise<string> {
    const val = await this.getValue(hospitalId, key);
    return val ?? defaultValue;
  }

  async getNumber(
    hospitalId: number,
    key: string,
    defaultValue: number,
  ): Promise<number> {
    const val = await this.getValue(hospitalId, key);
    return val ? parseFloat(val) : defaultValue;
  }

  async getBoolean(
    hospitalId: number,
    key: string,
    defaultValue: boolean,
  ): Promise<boolean> {
    const val = await this.getValue(hospitalId, key);
    if (!val) return defaultValue;
    return val.toLowerCase() === 'true';
  }
}
