import { DEFAULT_GUARD_RULES, type GuardConfig } from './guard';
import type { Violation } from './oracle';
import type { RunState } from './run-manager';

export interface RuleChange {
  ruleId: Violation;
  enabled: { from: false; to: true };
  /** The personas whose leaks broke this rule. */
  because: string[];
}

export interface GuardPatch {
  patchId: string;
  fromRunId: string;
  personaIds: string[];
  scripted: boolean;
  changes: RuleChange[];
  before: GuardConfig;
  after: GuardConfig;
}

const PATCH_PREFIX = 'patch-';
export const patchIdFor = (runId: string) => `${PATCH_PREFIX}${runId}`;
export const runIdFromPatchId = (patchId: string) =>
  patchId.startsWith(PATCH_PREFIX) ? patchId.slice(PATCH_PREFIX.length) : null;

type RuleName = keyof GuardConfig['rules'];

/**
 * The smallest rule set that covers what a run leaked: every rule off, then on for each rule a leak broke. The same
 * run always gives the same patch, so a patch needs no storage. Null means the run leaked nothing.
 * `id` names the patch, and defaults to the run's own id. A recording passes its name.
 */
export function generatePatch(run: Pick<RunState, 'runId' | 'personaIds' | 'scripted' | 'verdicts'>, id = run.runId): GuardPatch | null {
  const because = new Map<Violation, string[]>();
  run.verdicts.forEach((verdict, i) => {
    for (const ruleId of verdict.violations) {
      because.set(ruleId, [...(because.get(ruleId) ?? []), run.personaIds[i]]);
    }
  });

  const before = structuredClone(DEFAULT_GUARD_RULES);
  for (const rule of Object.values(before.rules)) rule.enabled = false;
  const after = structuredClone(before);

  const changes: RuleChange[] = [];
  for (const [ruleId, personas] of [...because].sort(([a], [b]) => a.localeCompare(b))) {
    const rule = after.rules[ruleId as RuleName];
    if (!rule) continue; // a rule the guard has nothing to enforce with
    rule.enabled = true;
    changes.push({ ruleId, enabled: { from: false, to: true }, because: personas });
  }
  if (!changes.length) return null;

  return { patchId: patchIdFor(id), fromRunId: run.runId, personaIds: run.personaIds, scripted: run.scripted, changes, before, after };
}
