import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSystemSettingDto } from './dto/update-system-setting.dto';
import { SystemSetting } from '@prisma/client';

@Injectable()
export class SystemSettingsService {
  constructor(private prisma: PrismaService) {}

  async findAll(hospitalId: number) {
    const settings = await this.prisma.systemSetting.findMany({
      where: { hospitalId },
      orderBy: { group: 'asc' },
    });

    // Grouping logic can be done here or frontend. Let's return flat list for now.
    return settings;
  }

  async findOne(hospitalId: number, key: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { hospitalId_key: { hospitalId, key } },
    });
    if (!setting) {
      throw new NotFoundException(`Setting with key ${key} not found`);
    }
    return setting;
  }

  async update(hospitalId: number, key: string, updateDto: UpdateSystemSettingDto) {
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

  async getString(hospitalId: number, key: string, defaultValue: string): Promise<string> {
    const val = await this.getValue(hospitalId, key);
    return val ?? defaultValue;
  }

  async getNumber(hospitalId: number, key: string, defaultValue: number): Promise<number> {
    const val = await this.getValue(hospitalId, key);
    return val ? parseFloat(val) : defaultValue;
  }

  async getBoolean(hospitalId: number, key: string, defaultValue: boolean): Promise<boolean> {
    const val = await this.getValue(hospitalId, key);
    if (!val) return defaultValue;
    return val.toLowerCase() === 'true';
  }
}
