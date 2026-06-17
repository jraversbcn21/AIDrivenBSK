import type { Classifier } from './Classifier';
import type { ExplorerConfig } from '../config';
import { RuleClassifier } from './RuleClassifier';
import { LlmClassifier } from './LlmClassifier';
import { AutoClassifier } from './AutoClassifier';
import { makeAnthropicComplete } from './anthropic';

export function makeClassifier(cfg: ExplorerConfig): Classifier {
  const rules = new RuleClassifier();
  if (cfg.mode === 'rules') return rules;

  const llm = new LlmClassifier(makeAnthropicComplete(cfg.llm), rules);
  if (cfg.mode === 'llm') return llm;

  return new AutoClassifier(rules, llm, cfg.autoThreshold);
}
