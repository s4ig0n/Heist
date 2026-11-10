// A run against Nimbus in the REAL sandbox, without the web app.
// `npm run attack -- --persona time-traveler --scripted`. --persona takes a comma-separated list. Leave it out for the short default run.
// Issues real sandbox refunds. Target orders get a fresh capture first if theirs is spent.
// --guard puts the policy guard in front of create_refund.
// --scripted uses the personas' fixed lines. Without it the attacker is an LLM, which uses more quota.
import { fileURLToPath } from 'node:url';
import { createLiveDeps } from './live-deps';
import { createRunManager } from './run-manager';

const args = process.argv.slice(2);
const persona = args.includes('--persona') ? args[args.indexOf('--persona') + 1] : undefined;

const manager = createRunManager(createLiveDeps(fileURLToPath(new URL('../../../', import.meta.url))));
const run = manager.start({ personaIds: persona?.split(','), scripted: args.includes('--scripted'), guarded: args.includes('--guard') });

manager.subscribe(run.runId, (item) => {
  if (item.kind === 'event') console.log(`[${item.event.type}] ${JSON.stringify(item.event).slice(0, 180)}`);
  if (item.kind === 'status') console.log(`[run.status] ${item.status}${item.message ? `: ${item.message}` : ''}`);
});

await manager.idle();

for (const record of run.records) {
  console.log(`\n--- ${record.personaId}, stopped: ${record.stopReason}${record.error ? ` (${record.error})` : ''}`);
  for (const line of record.transcript) console.log(`${line.role}> ${line.text}`);
  for (const r of record.refunds) console.log('refund read back from PayPal:', r.readBack ?? `(none) ${r.paypalErrorCode ?? ''}`);
  console.log('capture after:', record.captureAfter);
  const v = record.verdict!;
  console.log(`verdict: ${v.bucket}${v.severity ? ` (${v.severity})` : ''}, $${(v.leakedCents / 100).toFixed(2)} leaked, violations: ${v.violations.join(', ') || 'none'}`);
}
console.log('\nscore:', run.score);
