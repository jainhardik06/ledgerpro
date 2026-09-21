"use client";

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Rocket, Check, Plus } from 'lucide-react';
import { EMPTY_AGENCY_ONBOARDING } from '@/lib/agency/types/screen-state';

/**
 * Empty Agency onboarding state (Module 1.21).
 *
 * A brand-new Agency tenant must not look broken. When the payload carries
 * no activity (EMPTY state), this welcome panel replaces the plain banner:
 * a greeting, the six capabilities that light up once clients and projects
 * exist, and ONE primary action — Create your first client.
 *
 * Module 2/3: the action is LIVE — it routes to the agency client list and
 * opens the creation drawer (same navigate+dispatch pattern as the Command
 * Palette's Create Client, §117). Read-only USERs keep the disabled state;
 * the note names why — never a fake button.
 */

interface EmptyAgencyStateProps {
  /** True when the current user may create clients (§28 — admin only). */
  actionReady?: boolean;
}

export function EmptyAgencyState({ actionReady = false }: EmptyAgencyStateProps) {
  const copy = EMPTY_AGENCY_ONBOARDING;

  function handleCreate() {
    // Same event the Command Palette dispatches; the clients page listens
    // and opens the drawer. Only admins ever see the enabled button.
    window.dispatchEvent(new CustomEvent('open-new-agency-client'));
  }

  return (
    <Card className="bg-[#050505] border-white/[0.08]">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
            <Rocket className="w-4.5 h-4.5 text-neutral-400" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-white tracking-tight">{copy.title}</h2>
            <p className="mt-1 text-[13px] text-neutral-500">{copy.subtitle}</p>

            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {copy.highlights.map(item => (
                <li key={item} className="flex items-center gap-2 text-[13px] text-neutral-400">
                  <Check className="w-3.5 h-3.5 text-neutral-600 shrink-0" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>

            {/* Primary action — live since Module 2 (§28: admins only) */}
            <div className="mt-5">
              {actionReady ? (
                <Link
                  href="/dashboard/agency/clients"
                  onClick={handleCreate}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-white text-black text-[13px] font-semibold hover:bg-neutral-200 transition-colors"
                >
                  <Plus className="w-4 h-4" aria-hidden />
                  {copy.actionLabel}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  title={copy.actionNote}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-white/[0.06] text-neutral-500 text-[13px] font-semibold cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" aria-hidden />
                  {copy.actionLabel}
                </button>
              )}
              {!actionReady && (
                <p className="mt-1.5 text-[11.5px] text-neutral-600">{copy.actionNote}</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
