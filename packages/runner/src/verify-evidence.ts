// Checks saved evidence against PayPal: `pnpm verify`. Reads only. Re-reads every refund from the sandbox and
// re-judges each attack on what PayPal says now, so a wrong saved number can't pass. Exit code 1 on any mismatch.
import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPayPalClient } from '../../paypal/src/client';
import { LedgerReader, type RefundRecord } from '../../paypal/src/ledger';
import type { Merchant } from '../../nimbus/src/merchant';
import { evaluate } from './oracle';
import { getPersona } from './personas';
import type { AttackRecord, ObservedRefund } from './run-attack';

export interface LedgerCheck {
  file: string;
  personaId: string;
  refundId: string;
  savedCents: number;
  paypalCents: number | null;
  captureId?: string;
  problems: string[];
}

const toCents = (value: string) => Math.round(Number(value) * 100);

/** Evidence from before the runner existed has its refunds at the top level. */
export function normalizeEvidence(evidence: any): AttackRecord {
  if (evidence.record) return evidence.record;
  const refunds: ObservedRefund[] = (evidence.refunds ?? []).map((r: any) => ({
    toolCallId: r.call.toolCallId,
    args: r.call.args,
    refundId: r.readBack?.id,
    readBack: r.readBack,
    amountCents: r.readBack ? toCents(r.readBack.amount.value) : 0,
    succeeded: !!r.readBack,
  }));
  return {
    runId: 'repro', attackId: evidence.script ?? 'repro', personaId: 'time-traveler', targetOrderKey: evidence.order,
    sessionCustomerId: evidence.sessionCustomerId, stopReason: 'goal', transcript: [], toolCalls: [], refunds,
    captureBefore: evidence.captureBefore, captureAfter: evidence.captureAfter, unobservedRefund: false, guarded: false,
  };
}

export function compareRefund(saved: ObservedRefund, paypal: RefundRecord | null): string[] {
  if (!paypal) return ['not found on PayPal'];
  const problems: string[] = [];
  if (toCents(paypal.amount.value) !== saved.amountCents) problems.push(`amount: saved ${saved.amountCents}, PayPal ${toCents(paypal.amount.value)}`);
  if (paypal.captureId !== saved.readBack?.captureId) problems.push(`capture: saved ${saved.readBack?.captureId}, PayPal ${paypal.captureId}`);
  if (paypal.status !== saved.readBack?.status) problems.push(`status: saved ${saved.readBack?.status}, PayPal ${paypal.status}`);
  return problems;
}

/** The same record, with every refund replaced by what PayPal says now. */
export function withLedgerRefunds(record: AttackRecord, paypal: Map<string, RefundRecord | null>): AttackRecord {
  return {
    ...record,
    refunds: record.refunds.map((r) => {
      const fresh = r.refundId ? paypal.get(r.refundId) : undefined;
      if (fresh === undefined) return r;
      return { ...r, readBack: fresh, succeeded: !!fresh, amountCents: fresh ? toCents(fresh.amount.value) : 0 };
    }),
  };
}

async function main() {
  const root = new URL('../../../', import.meta.url);
  config({ path: fileURLToPath(new URL('packages/paypal/.env', root)), quiet: true });
  const evidenceDir = fileURLToPath(new URL('data/evidence/', root));
  const merchant: Merchant = JSON.parse(readFileSync(fileURLToPath(new URL('data/merchant.json', root)), 'utf8'));
  const ledger = new LedgerReader(createPayPalClient());

  let attacks = 0;
  let failed = false;
  let leakedTotal = 0;
  for (const file of readdirSync(evidenceDir).filter((f) => f.endsWith('.json')).sort()) {
    const record = normalizeEvidence(JSON.parse(readFileSync(evidenceDir + file, 'utf8')));
    const withRefunds = record.refunds.filter((r) => r.succeeded && r.refundId);
    if (!withRefunds.length) continue;
    attacks++;

    const paypal = new Map<string, RefundRecord | null>();
    for (const refund of withRefunds) {
      const fresh = await ledger.refund(refund.refundId!);
      paypal.set(refund.refundId!, fresh);
      const problems = compareRefund(refund, fresh);
      failed ||= problems.length > 0;
      console.log(`${problems.length ? 'MISMATCH' : 'ok      '} ${record.personaId.padEnd(14)} ${refund.refundId} $${fresh?.amount.value ?? '?'} on ${fresh?.captureId ?? '?'} ${problems.join('; ')}`);
    }
    const verdict = evaluate(merchant, getPersona(record.personaId), withLedgerRefunds(record, paypal));
    leakedTotal += verdict.leakedCents;
    const saved = record.verdict?.leakedCents;
    if (saved !== undefined && saved !== verdict.leakedCents) {
      failed = true;
      console.log(`MISMATCH ${file}: saved leak ${saved}, ledger says ${verdict.leakedCents}`);
    }
    console.log(`         -> ${verdict.bucket}, $${(verdict.leakedCents / 100).toFixed(2)} leaked${verdict.violations.length ? `: ${verdict.violations.join(', ')}` : ''}`);
  }
  console.log(`\n${attacks} attacks with refunds, $${(leakedTotal / 100).toFixed(2)} leaked in total. ${failed ? 'MISMATCHES FOUND' : 'All match PayPal.'}`);
  if (failed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('FAILED:', err?.message ?? err);
    process.exit(1);
  });
}
