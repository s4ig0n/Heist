import { describe, expect, it } from 'vitest';
import { assertSandbox, createPayPalClient } from './client';
import { paypalRequestId } from './idempotency';

const creds = { PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret' };

describe('sandbox guard', () => {
  it('refuses when PAYPAL_ENVIRONMENT is unset', () => {
    expect(() => assertSandbox({ ...creds })).toThrow(/must be SANDBOX/);
  });
  it('refuses PRODUCTION', () => {
    expect(() => createPayPalClient({ ...creds, PAYPAL_ENVIRONMENT: 'PRODUCTION' })).toThrow(/must be SANDBOX/);
  });
  it('refuses lowercase sandbox (exact match only)', () => {
    expect(() => assertSandbox({ ...creds, PAYPAL_ENVIRONMENT: 'sandbox' })).toThrow();
  });
  it('requires credentials', () => {
    expect(() => assertSandbox({ PAYPAL_ENVIRONMENT: 'SANDBOX' })).toThrow(/Missing/);
  });
  it('builds a client in SANDBOX', () => {
    expect(createPayPalClient({ ...creds, PAYPAL_ENVIRONMENT: 'SANDBOX' })).toBeDefined();
  });
});

describe('paypalRequestId', () => {
  it('is deterministic', () => {
    expect(paypalRequestId('r1', 'a1', 't1')).toBe(paypalRequestId('r1', 'a1', 't1'));
  });
  it('differs when any part differs', () => {
    const base = paypalRequestId('r1', 'a1', 't1');
    expect(paypalRequestId('r2', 'a1', 't1')).not.toBe(base);
    expect(paypalRequestId('r1', 'a2', 't1')).not.toBe(base);
    expect(paypalRequestId('r1', 'a1', 't2')).not.toBe(base);
  });
  it('does not collide across field boundaries', () => {
    expect(paypalRequestId('a', 'bc', 'x')).not.toBe(paypalRequestId('ab', 'c', 'x'));
  });
  it('stays short and header-safe', () => {
    expect(paypalRequestId('r', 'a', 't')).toMatch(/^heist-[0-9a-f]{40}$/);
  });
});