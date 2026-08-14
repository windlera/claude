import * as openai from './openai.js';
import * as perplexity from './perplexity.js';
import * as gemini from './gemini.js';

export const providers = [openai, perplexity, gemini];

export function configuredProviders() {
  return providers.filter((p) => p.isConfigured());
}
