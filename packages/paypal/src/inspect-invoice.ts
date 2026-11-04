import 'dotenv/config';
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
import { assertSandbox } from './client';

async function main() {
  const { clientId, clientSecret } = assertSandbox();
  const toolkit = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: { actions: { invoices: { create: true, get: true, list: true } }, context: { sandbox: true } },
  });
  const tools = (await toolkit.getTools()) as Record<string, any>;
  console.log('TOOLS:', Object.keys(tools).join(', '));

  const t = tools.create_invoice;
  console.log('\nDESCRIPTION:\n', t?.description);
  const schema = t?.parameters ?? t?.inputSchema;
  const shape = schema?.shape ?? schema?._def?.shape?.();
  if (shape) {
    for (const [key, field] of Object.entries<any>(shape)) {
      const inner = field?._def?.innerType ?? field;
      const sub = inner?.shape ?? inner?._def?.shape?.() ?? inner?._def?.type?.shape;
      console.log(`- ${key}${sub ? ': { ' + Object.keys(sub).join(', ') + ' }' : ''}`);
    }
  } else {
    console.log('SCHEMA (raw):', JSON.stringify(schema, null, 2)?.slice(0, 3000));
  }
}

main().catch((err) => { console.error(err); process.exit(1); });