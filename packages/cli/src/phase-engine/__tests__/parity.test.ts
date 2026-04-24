/**
 * Tier 1 parity harness — byte-identical output between chat rail and skill rail.
 *
 * Per the v0.9.0 test plan (IRON RULE): for each canonical intent, running the
 * chat rail and the skill rail against the same MockProvider fixture must
 * produce identical project trees modulo normalized timestamps/UUIDs. Without
 * this, drift between the two rails is undetectable until a user reports
 * "chat produced X but skill produced Y" — too late.
 *
 * Status (v0.9.0 Lane D Tier 1 kickoff):
 *  - Infrastructure: `parity-harness.ts` (tree snapshot, normalize, diff,
 *    rail drivers).
 *  - Fixture directory + README: `fixtures/parity/README.md`.
 *  - Tests below: all `.todo` until (a) fixtures are recorded and (b) the
 *    chat.ts facade refactor lands so Rail A has a drivable entry point.
 *
 * Unblocking order:
 *  1. Lane D Task 2 (chat.ts facade) — unblocks `runRailA`.
 *  2. Record `marketing-saas-landing` fixture against live API.
 *  3. Flip the first `test.todo` to a real `test`, watch it fail, fix until green.
 *  4. Repeat for the remaining two intents.
 */

import { describe, test } from 'vitest'

const INTENTS = [
  {
    slug: 'marketing-saas-landing',
    description: 'marketing: a SaaS landing page with hero, features, pricing, testimonials',
  },
  {
    slug: 'app-crm-dashboard',
    description: 'app: a CRM dashboard with tasks, customers, pipeline charts',
  },
  {
    slug: 'auth-login-register-forgot',
    description: 'auth: login, register, and forgot-password flow',
  },
] as const

describe('parity harness — chat rail vs skill rail', () => {
  for (const intent of INTENTS) {
    describe(intent.slug, () => {
      test.todo(`Rail A (chat) matches expected tree — blocked on chat.ts facade`)
      test.todo(`Rail B (skill) matches expected tree — blocked on fixture recording`)
      test.todo(`diff(Rail A, Rail B) is empty — blocked on both above`)
    })
  }
})
