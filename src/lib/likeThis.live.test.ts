// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { findLikeThisWithClaude } from './likeThisClient';
import { bottlePhoto, offerLabel } from './likeThis';

/**
 * Real "Bottles like this to buy" search against the Anthropic API (about 30¢ a run).
 * Skipped unless PALATE_TEST_KEY holds an API key:
 *   NODE_USE_ENV_PROXY=1 npx vitest run src/lib/likeThis.live.test.ts --silent=false
 */
const key = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PALATE_TEST_KEY;

describe.skipIf(!key)('Bottles like this (live)', () => {
  it('finds real store bottles like a loved Châteauneuf-du-Pape', { timeout: 600_000 }, async () => {
    const t0 = Date.now();
    const out = await findLikeThisWithClaude(key!, {
      wine: wine({ producer: 'Clos Saint Michel (Mousset)', name: 'Châteauneuf-du-Pape Cuvée Réservée', region: 'Châteauneuf-du-Pape', country: 'France', grapes: ['Grenache', 'Syrah'], style: 'red', rating: 'loved' }),
      taste: ['You lean toward reds from Châteauneuf-du-Pape, Rioja and Pauillac, especially Syrah, Grenache and Tempranillo.'],
      loved: ['Renato Ratti Barolo Marcenasco (Barolo)', 'Vega Sicilia Macán Clásico (Rioja)'],
      disliked: ['Château Puy d’Amour Côtes de Bourg (Côtes de Bourg)'],
      skip: ['Domaine La Millière Châteauneuf-du-Pape Vieilles Vignes'],
    });
    console.log(`took ${Math.round((Date.now() - t0) / 1000)}s`);
    expect(out.ok, out.ok ? '' : out.reason).toBe(true);
    if (!out.ok) return;
    const c = out.cache;
    console.log('checked:', JSON.stringify(c.checked));
    for (const b of c.bottles) console.log(`- ${b.producer} | ${b.wine} ${b.vintage} | ${b.offers.map(offerLabel).join(' / ')} | photo: ${bottlePhoto(b)?.siteName ?? 'none'} | ${b.reason}`);
    console.log('tips:', c.tips);
    // Optional: save the result to look at in the app (PALATE_LIVE_OUT=path).
    const out_ = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PALATE_LIVE_OUT;
    if (out_) await (await import('node:fs/promises' as string)).writeFile(out_, JSON.stringify(c));
    expect(c.bottles.length).toBeGreaterThan(0);
  });
});
