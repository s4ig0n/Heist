import 'dotenv/config';
import { assertSandbox } from './client';

async function main() {
  const { clientId, clientSecret } = assertSandbox();
  const res = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body: any = await res.json();
  if (!res.ok) { console.error('Token error', res.status, body); process.exit(1); }
  const scopes: string[] = String(body.scope).split(' ');
  // Only scope names are printed, never the token itself.
  for (const want of ['invoicing', 'subscriptions', 'disputes', 'payments/refund', 'payments/payment']) {
    console.log(`${scopes.some((s) => s.includes(want)) ? 'YES' : 'no '}  ${want}`);
  }
  console.log(`\n${scopes.length} scopes total; token expires in ${body.expires_in}s`);
}

main().catch((err) => { console.error(err); process.exit(1); });