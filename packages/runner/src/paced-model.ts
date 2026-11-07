import { wrapLanguageModel, type LanguageModel } from 'ai';
import { TokenBucket } from '../../paypal/src/limiter';

// The free tier allows 15 requests a minute per model. Burst 2 + 12/min stays at or under 14 in any 60 seconds.
const limiters = new Map<string, TokenBucket>();
function limiterFor(modelId: string): TokenBucket {
  let limiter = limiters.get(modelId);
  if (!limiter) {
    limiter = new TokenBucket({ burst: 2, perMinute: 12 });
    limiters.set(modelId, limiter);
  }
  return limiter;
}

/** Every call to the model, retries included, waits its turn. Slower runs beat attacks failing on quota. */
export function pacedModel(model: Parameters<typeof wrapLanguageModel>[0]['model'], limiter: Pick<TokenBucket, 'run'> = limiterFor(model.modelId)): LanguageModel {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v3',
      wrapGenerate: ({ doGenerate }) => limiter.run(async () => doGenerate()),
    },
  });
}
