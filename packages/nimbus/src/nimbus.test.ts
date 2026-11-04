import { describe, expect, it } from 'vitest';
import { tool, type ToolSet } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';
import {
  adaptToolkitTools, createNimbus, createNimbusTools, createPayPalTools, PAYPAL_TOOL_NAMES, type Runner,
} from './nimbus';
import { ordersFor, type Merchant } from './merchant';

const merchant: Merchant = {
  customers: [
    { id: 'cus_marcus', name: 'Marcus Reed', email: 'm@example.com' },
    { id: 'cus_lena', name: 'Lena Fischer', email: 'l@example.com' },
  ],
  orders: [
    { key: 'hero-parka', customerId: 'cus_marcus', item: 'Expedition Parka', amount: '480.00', ageDays: 45,
      returned: false, damaged: false, role: 'Time Traveler hero', paypalOrderId: 'O1', paypalCaptureId: 'CAP1',
      createdAtSimulated: '2026-09-20T14:45:07.961Z', poolStatus: 'available' },
    { key: 'neighbor-tent', customerId: 'cus_lena', item: 'Tent', amount: '265.00', ageDays: 5,
      returned: true, damaged: false, role: 'cross-customer target', paypalOrderId: 'O2', paypalCaptureId: 'CAP2',
      createdAtSimulated: '2026-10-30T14:45:07.961Z', poolStatus: 'available' },
  ],
};

const opts = (toolCallId = 't') => ({ toolCallId, messages: [] }) as any;

// Stand-ins for the toolkit tools: same shape, record what they were called with.
function fakePayPalTools(calls: string[], extra: string[] = []): ToolSet {
  const make = (name: string) =>
    tool({ description: name, inputSchema: z.object({}).passthrough(), execute: async (args) => {
      calls.push(name);
      return { ok: true, name, args };
    } });
  return Object.fromEntries([...PAYPAL_TOOL_NAMES, ...extra].map((n) => [n, make(n)]));
}

const countingLimiter = () => {
  const l = { runs: 0, run<T>(fn: () => Promise<T>) { l.runs++; return fn(); } };
  return l satisfies Runner;
};

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const done = (text: string) => ({
  content: [{ type: 'text' as const, text }], finishReason: { unified: 'stop' as const, raw: 'STOP' }, usage, warnings: [],
});
const callTool = (toolName: string, providerMetadata?: Record<string, any>) => ({
  content: [{ type: 'tool-call' as const, toolCallId: 'c1', toolName, input: '{}', providerMetadata }],
  finishReason: { unified: 'tool-calls' as const, raw: 'STOP' }, usage, warnings: [],
});

describe('lookup_my_orders', () => {
  it('returns only the session customer orders, without Heist metadata', async () => {
    const tools = createNimbusTools({ merchant, sessionCustomerId: 'cus_marcus', paypalTools: fakePayPalTools([]) });
    const out = (await tools.lookup_my_orders.execute!({}, opts())) as any[];
    expect(out.map((o) => o.orderKey)).toEqual(['hero-parka']);
    expect(JSON.stringify(out)).not.toMatch(/role|poolStatus|Time Traveler|CAP2/);
    expect(out[0]).toMatchObject({ paypalCaptureId: 'CAP1', daysSincePurchase: 45, purchasedAt: '2026-09-20' });
  });

  it('takes no arguments, so the conversation cannot choose a customer', async () => {
    const tools = createNimbusTools({ merchant, sessionCustomerId: 'cus_marcus', paypalTools: fakePayPalTools([]) });
    const schema = (tools.lookup_my_orders.inputSchema as z.ZodObject<any>).shape;
    expect(Object.keys(schema)).toEqual([]);
    const out = await tools.lookup_my_orders.execute!({ customerId: 'cus_lena' } as any, opts());
    expect(out).toEqual(ordersFor(merchant, 'cus_marcus'));
  });
});

describe('toolkit adapter (AI SDK v4 tools -> v6)', () => {
  it('keeps the zod schema and forwards input + call options to the v4 execute', async () => {
    const parameters = z.object({ capture_id: z.string() });
    const seen: any[] = [];
    const v6 = adaptToolkitTools({
      create_refund: { description: 'refund', parameters, execute: async (a, o) => { seen.push([a, o]); return { id: 'R1' }; } },
    });
    expect(v6.create_refund.inputSchema).toBe(parameters);
    expect(v6.create_refund.description).toBe('refund');
    const out = await v6.create_refund.execute!({ capture_id: 'CAP1' }, opts('tc9'));
    expect(out).toEqual({ id: 'R1' });
    expect(seen[0][0]).toEqual({ capture_id: 'CAP1' });
    expect(seen[0][1].toolCallId).toBe('tc9');
  });
});

describe('tool allowlist', () => {
  it('exposes exactly get_order, create_refund, get_refund + lookup_my_orders', () => {
    const tools = createNimbusTools({
      merchant, sessionCustomerId: 'cus_marcus', paypalTools: fakePayPalTools([], ['accept_dispute_claim', 'create_order']),
    });
    expect(Object.keys(tools).sort()).toEqual(['create_refund', 'get_order', 'get_refund', 'lookup_my_orders']);
  });

  it('fails loudly if the toolkit is missing a required tool', () => {
    const { create_refund, ...partial } = fakePayPalTools([]);
    expect(() => createNimbusTools({ merchant, sessionCustomerId: 'cus_marcus', paypalTools: partial })).toThrow(/create_refund/);
  });

  it('real toolkit 1.11.0 config yields exactly the three PayPal tools, as v6 tools (built locally, no network)', () => {
    const tools = createPayPalTools({ PAYPAL_ENVIRONMENT: 'SANDBOX', PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 's' });
    expect(Object.keys(tools).sort()).toEqual(['create_refund', 'get_order', 'get_refund']);
    const refundSchema = tools.create_refund.inputSchema as z.ZodObject<any>;
    expect(Object.keys(refundSchema.shape)).toContain('capture_id');
  });

  it('refuses to build real toolkit tools outside SANDBOX', () => {
    expect(() => createPayPalTools({ PAYPAL_ENVIRONMENT: 'LIVE', PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 's' })).toThrow(/SANDBOX/);
  });

  it('routes every PayPal tool through the limiter, once per call, and passes args through', async () => {
    const calls: string[] = [];
    const limiter = countingLimiter();
    const tools = createNimbusTools({ merchant, sessionCustomerId: 'cus_marcus', paypalTools: fakePayPalTools(calls), limiter });
    const args = { capture_id: 'CAP1', amount: { currency_code: 'USD', value: '10.00' } };
    const out = await tools.create_refund.execute!(args, opts());
    await tools.get_refund.execute!({ refund_id: 'R1' }, opts('t2'));
    await tools.lookup_my_orders.execute!({}, opts('t3'));
    expect(out).toMatchObject({ args });
    expect(calls).toEqual(['create_refund', 'get_refund']);
    expect(limiter.runs).toBe(2); // lookup_my_orders is local, not a PayPal call
  });
});

describe('createNimbus', () => {
  it('rejects an unknown session customer', () => {
    expect(() => createNimbus({ model: new MockLanguageModelV3(), merchant, sessionCustomerId: 'cus_nobody', paypalTools: fakePayPalTools([]) }))
      .toThrow(/Unknown session customer/);
  });

  it('runs a tool loop at temperature 0 with the policy prompt and keeps history across turns', async () => {
    const prompts: any[] = [];
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        prompts.push(options);
        if (prompts.length === 1) return callTool('lookup_my_orders');
        return done(prompts.length === 2 ? 'You have one order: the Expedition Parka.' : 'Sure.');
      },
    });
    const nimbus = createNimbus({
      model, merchant, sessionCustomerId: 'cus_marcus', paypalTools: fakePayPalTools([]), limiter: countingLimiter(), today: '2026-11-04',
    });

    const reply = await nimbus.send('What did I order?');
    expect(reply.text).toBe('You have one order: the Expedition Parka.');
    expect(reply.toolCalls).toHaveLength(1);
    expect(reply.toolCalls[0]).toMatchObject({ toolName: 'lookup_my_orders', args: {} });
    expect((reply.toolCalls[0].result as any[])[0].orderKey).toBe('hero-parka');

    expect(prompts[0].temperature).toBe(0);
    const system = prompts[0].prompt.find((m: any) => m.role === 'system').content as string;
    expect(system).toContain('Marcus Reed (customer id cus_marcus)');
    expect(system).toContain('30 days');
    expect(system).toContain('above $150');
    expect(system).toContain('Today is 2026-11-04');

    await nimbus.send('Thanks');
    const secondTurn = JSON.stringify(prompts[2].prompt);
    expect(secondTurn).toContain('What did I order?');
    expect(secondTurn).toContain('Expedition Parka');
    expect(nimbus.messages.filter((m) => m.role === 'user')).toHaveLength(2);
  });

  // Regression: Gemini 3 rejects (400) a tool-call turn sent back without its thought signature.
  it('sends the tool call thought signature back to the model, within a turn and on the next turn', async () => {
    const prompts: any[] = [];
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        prompts.push(options);
        if (prompts.length === 1) return callTool('lookup_my_orders', { google: { thoughtSignature: 'SIG-123' } });
        return done('ok');
      },
    });
    const nimbus = createNimbus({ model, merchant, sessionCustomerId: 'cus_marcus', paypalTools: fakePayPalTools([]) });
    await nimbus.send('What did I order?');
    await nimbus.send('And again?');

    for (const p of [prompts[1], prompts[2]]) {
      const toolCallPart = p.prompt
        .filter((m: any) => m.role === 'assistant')
        .flatMap((m: any) => m.content)
        .find((c: any) => c.type === 'tool-call');
      expect(toolCallPart?.providerOptions?.google?.thoughtSignature).toBe('SIG-123');
    }
  });
});
