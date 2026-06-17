import type { LlmComplete } from './LlmClassifier';
import type { LlmConfig } from '../config';

// Lazily imports the SDK so rules-only/offline runs need neither the package at
// runtime nor an API key. Request shape confirmed against the claude-api reference.
export function makeAnthropicComplete(cfg: LlmConfig): LlmComplete {
  return async ({ system, user }) => {
    const apiKey = process.env[cfg.apiKeyEnv];
    if (!apiKey) throw new Error(`${cfg.apiKeyEnv} is not set`);
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: cfg.model,
      max_tokens: 256,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const block = msg.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  };
}
