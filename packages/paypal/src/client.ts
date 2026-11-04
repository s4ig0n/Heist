import { Client, Environment } from '@paypal/paypal-server-sdk';

type Env = Record<string, string | undefined>;

/** Hard safety guard: Heist never runs against live PayPal. */
export function assertSandbox(env: Env = process.env): { clientId: string; clientSecret: string } {
  if (env.PAYPAL_ENVIRONMENT !== 'SANDBOX') {
    throw new Error(
      `Refusing to run: PAYPAL_ENVIRONMENT must be SANDBOX (got "${env.PAYPAL_ENVIRONMENT ?? 'unset'}")`,
    );
  }
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET');
  return { clientId, clientSecret };
}

export function createPayPalClient(env: Env = process.env): Client {
  const { clientId, clientSecret } = assertSandbox(env);
  return new Client({
    clientCredentialsAuthCredentials: { oAuthClientId: clientId, oAuthClientSecret: clientSecret },
    environment: Environment.Sandbox, // hardcoded: there is no code path to production
  });
}