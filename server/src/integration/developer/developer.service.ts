import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class DeveloperService {
  constructor(private prisma: PrismaService) {}

  private generateRandomString(length: number): string {
    return crypto.randomBytes(length).toString('hex');
  }

  async registerApp(hospitalId: number, name: string, redirectUris: string[]) {
    const clientId = 'client_' + this.generateRandomString(12);
    const clientSecret = 'secret_' + this.generateRandomString(24);

    return this.prisma.developerApp.create({
      data: {
        hospitalId,
        name,
        clientId,
        clientSecret,
        redirectUris,
        isActive: true,
      },
      include: {
        scopes: true,
        apiKeys: true,
      },
    });
  }

  async listApps(hospitalId: number) {
    return this.prisma.developerApp.findMany({
      where: { hospitalId },
      include: {
        scopes: true,
        apiKeys: {
          select: {
            id: true,
            name: true,
            key: true,
            isActive: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async findAppOrThrow(appId: number, hospitalId: number) {
    const app = await this.prisma.developerApp.findUnique({
      where: { id: appId },
      include: { scopes: true, apiKeys: true },
    });

    if (!app) {
      throw new NotFoundException(`Developer App with ID ${appId} not found.`);
    }

    if (app.hospitalId !== hospitalId) {
      throw new ForbiddenException(`Access denied. App does not belong to your hospital.`);
    }

    return app;
  }

  async updateApp(
    appId: number,
    hospitalId: number,
    data: { name?: string; redirectUris?: string[]; isActive?: boolean },
  ) {
    await this.findAppOrThrow(appId, hospitalId);

    return this.prisma.developerApp.update({
      where: { id: appId },
      data: {
        name: data.name,
        redirectUris: data.redirectUris,
        isActive: data.isActive,
      },
      include: {
        scopes: true,
        apiKeys: true,
      },
    });
  }

  async deleteApp(appId: number, hospitalId: number) {
    await this.findAppOrThrow(appId, hospitalId);
    return this.prisma.developerApp.delete({
      where: { id: appId },
    });
  }

  async addScope(appId: number, hospitalId: number, scope: string) {
    await this.findAppOrThrow(appId, hospitalId);

    return this.prisma.developerAppScope.create({
      data: {
        appId,
        scope,
      },
    });
  }

  async removeScope(appId: number, hospitalId: number, scopeId: number) {
    const app = await this.findAppOrThrow(appId, hospitalId);
    const scopeExists = app.scopes.some((s) => s.id === scopeId);

    if (!scopeExists) {
      throw new NotFoundException(`Scope with ID ${scopeId} not found on this app.`);
    }

    return this.prisma.developerAppScope.delete({
      where: { id: scopeId },
    });
  }

  async generateApiKey(appId: number, hospitalId: number, name?: string, expiresDays?: number) {
    await this.findAppOrThrow(appId, hospitalId);

    const rawKey = 'sk_' + this.generateRandomString(32);
    let expiresAt: Date | null = null;
    if (expiresDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresDays);
    }

    return this.prisma.apiKey.create({
      data: {
        appId,
        key: rawKey,
        name: name || 'API Key',
        isActive: true,
        expiresAt,
      },
    });
  }

  async revokeApiKey(appId: number, hospitalId: number, keyId: number) {
    const app = await this.findAppOrThrow(appId, hospitalId);
    const keyExists = app.apiKeys.some((k) => k.id === keyId);

    if (!keyExists) {
      throw new NotFoundException(`API Key with ID ${keyId} not found on this app.`);
    }

    return this.prisma.apiKey.delete({
      where: { id: keyId },
    });
  }
}
