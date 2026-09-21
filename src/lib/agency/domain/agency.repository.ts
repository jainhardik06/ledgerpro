/**
 * Agency Vertical — Domain: tenant-scoped repository base (Step 0.6)
 *
 * The structural enforcement of the tenant-isolation audit
 * (docs/agency/phase-1/03-tenant-isolation-audit.md):
 *
 *   Authenticated User → Authenticated Tenant → Agency Resource
 *   Every query: resource.tenantId === session.tenantId
 *
 * All agency entity repositories extend this class. It wraps TenantDAL, which
 * force-injects tenantId into every filter and stamps it on every insert —
 * making cross-tenant access impossible by construction.
 *
 * Construction rule: tenantId must be the session-resolved value from
 * permissions/vertical.ts — NEVER a client-supplied value.
 */
import { TenantDAL } from '@/lib/dal';
import { Document, Filter, ObjectId, WithId } from 'mongodb';

export abstract class AgencyTenantRepository<T extends Document> {
  protected dal: TenantDAL;
  protected abstract readonly collectionName: string;

  constructor(tenantId: string) {
    if (!tenantId) {
      throw new Error('[Agency] Repository requires a session-resolved tenantId.');
    }
    this.dal = new TenantDAL(tenantId);
  }

  /**
   * Tenant-scoped find. The caller-provided filter must never include
   * tenantId — the DAL enforces it.
   */
  protected async findWhere(filter: Filter<T> = {}, options = {}) {
    return this.dal.find<T>(this.collectionName, filter, options);
  }

  /**
   * Fetch one tenant-owned entity by id. Cross-tenant ids simply miss —
   * the tenantId filter is always applied alongside _id.
   */
  protected async findById(id: string): Promise<WithId<T> | null> {
    if (!ObjectId.isValid(id)) return null;
    return this.dal.findOne<T>(this.collectionName, { _id: new ObjectId(id) } as Filter<T>);
  }

  /**
   * Insert a new agency entity. tenantId is stamped by the DAL; the payload
   * must not (and cannot) set it.
   */
  protected async insertEntity(doc: Omit<T, 'tenantId'>) {
    return this.dal.insertOne<T>(this.collectionName, doc);
  }

  /**
   * Update one tenant-owned entity by id. Scoped to { _id, tenantId }.
   */
  protected async updateById(id: string, update: object) {
    if (!ObjectId.isValid(id)) return { acknowledged: false, matchedCount: 0 };
    return this.dal.updateOne<T>(this.collectionName, { _id: new ObjectId(id) } as Filter<T>, update);
  }

  /**
   * Delete one tenant-owned entity by id (only for entities where deletion is
   * allowed — financial records must use void/reverse instead, PRD §62).
   */
  protected async deleteById(id: string) {
    if (!ObjectId.isValid(id)) return { acknowledged: false, deletedCount: 0 };
    return this.dal.deleteOne<T>(this.collectionName, { _id: new ObjectId(id) } as Filter<T>);
  }
}
