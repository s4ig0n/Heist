import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { pacedModel } from './paced-model';

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const reply = { content: [{ type: 'text', text: 'hi' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] } as any;

function countingLimiter() {
  const limiter = { runs: 0, run: <T>(fn: () => Promise<T>) => { limiter.runs++; return fn(); } };
  return limiter;
}

describe('pacedModel', () => {
  it('sends every model call through the limiter and returns its answer', async () => {
    const limiter = countingLimiter();
    const model = new MockLanguageModelV3({ doGenerate: async () => reply });
    const { text } = await generateText({ model: pacedModel(model, limiter), prompt: 'x' });
    expect(text).toBe('hi');
    expect(limiter.runs).toBe(1);
  });

  it('retries wait their turn too', async () => {
    const limiter = countingLimiter();
    let calls = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        if (calls++ === 0) throw Object.assign(new Error('busy'), { isRetryable: true, name: 'AI_APICallError' });
        return reply;
      },
    });
    await generateText({ model: pacedModel(model, limiter), prompt: 'x', maxRetries: 1 }).catch(() => {});
    expect(limiter.runs).toBe(calls);
  });

  it('keeps the model id', () => {
    const model = new MockLanguageModelV3({ modelId: 'gemini-test', doGenerate: async () => reply });
    expect((pacedModel(model, countingLimiter()) as any).modelId).toBe('gemini-test');
  });
});
