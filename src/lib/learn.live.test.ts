// @vitest-environment node
import { describe, expect, it } from 'vitest';

/**
 * One real lesson from the Anthropic API, to check its shape and read it. Opt-in only:
 *   PALATE_LIVE_LEARN=1 NODE_USE_ENV_PROXY=1 npx vitest run src/lib/learn.live.test.ts --silent=false
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const key = env.PALATE_LIVE_LEARN ? env.PALATE_TEST_KEY : undefined;

describe.skipIf(!key)('Learn (live)', () => {
  it('explains the grape, the place, the making and what to taste for', { timeout: 180_000 }, async () => {
    const { lessonWithClaude } = await import('./learnClient');
    const out = await lessonWithClaude(key!, {
      producer: 'E. Guigal',
      name: 'Côtes du Rhône Rouge',
      vintage: '2020',
      region: 'Côtes du Rhône',
      country: 'France',
      style: 'red',
      grapes: ['Grenache', 'Syrah', 'Mourvèdre'],
      related: ['Domaine du Vieux Télégraphe Châteauneuf-du-Pape (I loved it)', 'Alain Graillot Crozes-Hermitage'],
    });
    console.log(JSON.stringify(out, null, 2));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (const part of [out.lesson.grape, out.lesson.place, out.lesson.making, out.lesson.tasteFor]) expect(part.trim().length).toBeGreaterThan(40);
    expect(out.lesson.cards).toHaveLength(4);
    for (const c of out.lesson.cards!) {
      expect(c.big.trim().split(/\s+/).length).toBeLessThanOrEqual(2);
      expect(c.title.trim().split(/\s+/).length).toBeLessThanOrEqual(8);
    }
  });
});
