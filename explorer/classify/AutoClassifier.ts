import type { Classifier, PageContext, Classification } from './Classifier';

export class AutoClassifier implements Classifier {
  constructor(
    private readonly rules: Classifier,
    private readonly llm: Classifier,
    private readonly threshold: number,
  ) {}

  async classifyPage(ctx: PageContext): Promise<Classification> {
    const r = await this.rules.classifyPage(ctx);
    if (r.confidence >= this.threshold) return r;
    return this.llm.classifyPage(ctx);
  }
}
