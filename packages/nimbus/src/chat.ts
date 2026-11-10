// Nimbus v0 CLI: `npx tsx packages/nimbus/src/chat.ts --customer cus_marcus`
// Talks to the REAL sandbox: any refund Nimbus issues here is a real sandbox refund.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { google } from '@ai-sdk/google';
import { createNimbus, createPayPalTools } from './nimbus';
import { loadMerchant } from './merchant';

config({ path: fileURLToPath(new URL('../../paypal/.env', import.meta.url)), quiet: true });

const DEFAULT_MODEL = 'gemini-3.5-flash';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY in packages/paypal/.env');
  }
  const sessionCustomerId = arg('customer') ?? 'cus_hannah';
  const modelId = process.env.NIMBUS_MODEL ?? DEFAULT_MODEL;

  const nimbus = createNimbus({
    model: google(modelId),
    merchant: loadMerchant(),
    sessionCustomerId,
    paypalTools: createPayPalTools(),
  });

  console.log(`Nimbus v0 | model ${modelId} | signed in as ${sessionCustomerId} | SANDBOX | Ctrl+C to quit\n`);
  const rl = createInterface({ input: stdin, output: stdout });
  for (;;) {
    const line = (await rl.question('you> ')).trim();
    if (!line) continue;
    const reply = await nimbus.send(line);
    for (const call of reply.toolCalls) {
      console.log(`  [tool] ${call.toolName}(${JSON.stringify(call.args)}) -> ${JSON.stringify(call.result).slice(0, 300)}`);
    }
    console.log(`nimbus> ${reply.text}\n`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
