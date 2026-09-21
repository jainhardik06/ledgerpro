/**
 * Agency Vertical — Project smart defaults (Module 3, spec §49/§72)
 *
 * When a project wizard picks a client, the client's commercialDefaults
 * pre-fill the project's still-unchosen commercial fields. Two rules:
 *
 *   1. A default is a PRE-FILL, never a constraint — an explicit user
 *      choice always wins (§49 "defaults, not constraints").
 *   2. Only NEW projects inherit — never retroactive (§12/§72).
 *
 * Pure and framework-free so the wizard and the tests share one
 * implementation; the domain server re-validates everything anyway.
 */
import type { AgencyClient } from '../types/client';
import type { BillingModel } from '../types/client';

/** The wizard's commercial draft fields that can receive a default. */
export interface ProjectCommercialDraft {
  currency: string;
  billingModel: string;
}

/**
 * Apply a client's commercial defaults to a project draft: every empty
 * field picks up the client's value (commercialDefaults first, then the
 * billing profile's currency); every filled field is left untouched.
 */
export function applyClientCommercialDefaults(
  draft: ProjectCommercialDraft,
  client: Pick<AgencyClient, 'commercialDefaults' | 'billingProfile'> | null | undefined
): ProjectCommercialDraft {
  if (!client) return draft;
  return {
    currency:
      draft.currency ||
      client.commercialDefaults?.currency ||
      client.billingProfile?.currency ||
      '',
    billingModel:
      draft.billingModel ||
      (client.commercialDefaults?.billingModel as BillingModel | undefined) ||
      '',
  };
}
