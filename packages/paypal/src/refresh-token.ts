import 'dotenv/config';
import { assertSandbox } from './client';

const API = 'https://api-m.sandbox.paypal.com';

async function main() {
  const { clientId, clientSecret } = assertSandbox();
  const basic = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const form = { Authorization: basic, 'Content-Type': 'application/x-www-form-urlencoded' };

  // 1. Get the current (cached) token.
  const cur: any = await (await fetch(`${API}/v1/oauth2/token`, { method: 'POST', headers: form, body: 'grant_type=client_credentials' })).json();

  // 2. Terminate it, so PayPal stops handing it back.
  const term = await fetch(`${API}/v1/oauth2/token/terminate`, {
    method: 'POST',
    headers: form,
    body: `token=${encodeURIComponent(cur.access_token)}&token_type_hint=ACCESS_TOKEN`,
  });
  console.log('terminate:', term.status, term.ok ? 'OK' : await term.text());

  // 3. Ask again and check the new token's scopes.
  const next: any = await (await fetch(`${API}/v1/oauth2/token`, { method: 'POST', headers: form, body: 'grant_type=client_credentials' })).json();
  const hasInvoicing = String(next.scope).includes('invoicing');
  console.log(`new token expires in ${next.expires_in}s; invoicing scope: ${hasInvoicing ? 'YES' : 'no'}`);
}

main().catch((err) => { console.error(err); process.exit(1); });