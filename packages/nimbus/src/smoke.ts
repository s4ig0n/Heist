// One-shot Nimbus turn for smoke tests: `npx tsx packages/nimbus/src/smoke.ts --customer cus_hannah "What orders do I have?"`
// Talks to the REAL sandbox. Keep smoke prompts to lookups.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { google } from '@ai-sdk/google';
import { createNimbus, createPayPalTools } from './nimbus';
import { loadMerchant } from './merchant';

config({ path: fileURLToPath(new URL('../../paypal/.env', import.meta.url)), quiet: true });

const args = process.argv.slice(2).filter((a) => a !== '--');
const ci = args.indexOf('--customer');
const sessionCustomerId = ci >= 0 ? args.splice(ci, 2)[1] : 'cus_hannah';
const message = args.join(' ') || 'What orders do I have?';
const modelId = process.env.NIMBUS_MODEL ?? 'gemini-3.5-flash';

const nimbus = createNimbus({
  model: google(modelId),
  merchant: loadMerchant(),
  sessionCustomerId,
  paypalTools: createPayPalTools(),
});

const started = Date.now();
try {
  const reply = await nimbus.send(message);
  for (const call of reply.toolCalls) {
    console.log(`[tool] ${call.toolName}(${JSON.stringify(call.args)}) -> ${JSON.stringify(call.result).slice(0, 300)}`);
  }
  console.log(`nimbus (${modelId}, ${Date.now() - started}ms)> ${reply.text}`);
} catch (err: any) {
  console.error(`FAILED after ${Date.now() - started}ms:`, err?.message);
  if (err?.responseBody) console.error('responseBody:', String(err.responseBody).slice(0, 800));
  if (err?.lastError) console.error('lastError:', err.lastError.message, String(err.lastError.responseBody ?? '').slice(0, 800));
  process.exit(1);
}
