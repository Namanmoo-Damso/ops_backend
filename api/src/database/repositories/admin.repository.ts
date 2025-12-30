/**
 * Admin Repository
 * admins, admin_permissions, admin_refresh_tokens, organizations 테이블 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

type AdminResult = {
  id: string;
  email: string;
  name: string | null;
  provider: string;
  provider_id: string;
  role: string;
  organization_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
};

@Injectable()
export class AdminRepository {
  constructor(private readonly pool: Pool) {}

  async findByProviderId(provider: string, providerId: string): Promise<AdminResult | null> {
    const result = await this.pool.query<AdminResult>(
      `select * from admins where provider = $1 and provider_id = $2`,
      [provider, providerId],
    );
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<AdminResult | null> {
    const result = await this.pool.query<AdminResult>(
      `select * from admins where email = $1`,
      [email],
    );
    return result.rows[0] || null;
  }

  async findById(adminId: string): Promise<AdminResult | null> {
    const result = await this.pool.query<AdminResult>(
      `select * from admins where id = $1`,
      [adminId],
    );
    return result.rows[0] || null;
  }

  async create(params: {
    email: string;
    name?: string;
    provider: string;
    providerId: string;
    role?: string;
    organizationId?: string;
  }): Promise<{ id: string }> {
    const countResult = await this.pool.query<{ count: string }>(
      `select count(*) as count from admins`,
    );
    const isFirstAdmin = parseInt(countResult.rows[0].count, 10) === 0;
    const role = isFirstAdmin ? 'super_admin' : (params.role || 'admin');

    const result = await this.pool.query<{ id: string }>(
      `insert into admins (email, name, provider, provider_id, role, organization_id)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        params.email,
        params.name || null,
        params.provider,
        params.providerId,
        role,
        params.organizationId || null,
      ],
    );
    return result.rows[0];
  }

  async updateLastLogin(adminId: string): Promise<void> {
    await this.pool.query(
      `update admins set last_login_at = now(), updated_at = now() where id = $1`,
      [adminId],
    );
  }

  async getPermissions(adminId: string): Promise<string[]> {
    const result = await this.pool.query<{ permission: string }>(
      `select permission from admin_permissions where admin_id = $1`,
      [adminId],
    );
    return result.rows.map((r) => r.permission);
  }

  async createRefreshToken(adminId: string, tokenHash: string, expiresAt: Date): Promise<{ id: string }> {
    const result = await this.pool.query<{ id: string }>(
      `insert into admin_refresh_tokens (admin_id, token_hash, expires_at)
       values ($1, $2, $3)
       returning id`,
      [adminId, tokenHash, expiresAt],
    );
    return result.rows[0];
  }

  async findRefreshToken(tokenHash: string): Promise<{
    id: string;
    admin_id: string;
    expires_at: string;
  } | null> {
    const result = await this.pool.query<{
      id: string;
      admin_id: string;
      expires_at: string;
    }>(
      `select id, admin_id, expires_at from admin_refresh_tokens
       where token_hash = $1 and expires_at > now()`,
      [tokenHash],
    );
    return result.rows[0] || null;
  }

  async deleteRefreshToken(tokenHash: string): Promise<void> {
    await this.pool.query(
      `delete from admin_refresh_tokens where token_hash = $1`,
      [tokenHash],
    );
  }

  async deleteAllRefreshTokens(adminId: string): Promise<void> {
    await this.pool.query(
      `delete from admin_refresh_tokens where admin_id = $1`,
      [adminId],
    );
  }

  async getAll() {
    const result = await this.pool.query<AdminResult & { organization_name: string | null }>(
      `select a.*, o.name as organization_name
       from admins a
       left join organizations o on a.organization_id = o.id
       order by a.created_at desc`,
    );
    return result.rows;
  }

  async updateRole(adminId: string, role: string, organizationId?: string): Promise<void> {
    await this.pool.query(
      `update admins set role = $1, organization_id = $2, updated_at = now() where id = $3`,
      [role, organizationId || null, adminId],
    );
  }

  async updateActiveStatus(adminId: string, isActive: boolean): Promise<void> {
    await this.pool.query(
      `update admins set is_active = $1, updated_at = now() where id = $2`,
      [isActive, adminId],
    );
  }

  async updateOrganization(adminId: string, organizationId: string): Promise<void> {
    await this.pool.query(
      `update admins set organization_id = $1, updated_at = now() where id = $2`,
      [organizationId, adminId],
    );
  }

  // Organization methods
  async findOrganization(organizationId: string) {
    const result = await this.pool.query<{
      id: string;
      name: string;
      created_at: string;
    }>(
      `select id, name, created_at from organizations where id = $1`,
      [organizationId],
    );
    return result.rows[0];
  }

  async listAllOrganizations() {
    const result = await this.pool.query<{
      id: string;
      name: string;
      created_at: string;
    }>(
      `select id, name, created_at from organizations order by name`,
    );
    return result.rows;
  }

  async findOrCreateOrganization(name: string) {
    const existing = await this.pool.query<{
      id: string;
      name: string;
      created_at: string;
    }>(
      `select id, name, created_at from organizations where name = $1`,
      [name],
    );

    if (existing.rows[0]) {
      return { organization: existing.rows[0], created: false };
    }

    const result = await this.pool.query<{
      id: string;
      name: string;
      created_at: string;
    }>(
      `insert into organizations (name) values ($1) returning id, name, created_at`,
      [name],
    );

    return { organization: result.rows[0], created: true };
  }
}
