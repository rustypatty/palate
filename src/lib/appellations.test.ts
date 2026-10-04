import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { canonicalGrape, factsFromText, findAppellation, findGrapes } from './appellations';
import { advise } from './insights';

describe('appellation guide', () => {
  it('finds the most specific appellation in a shop title', () => {
    expect(findAppellation('Alain Graillot Crozes-Hermitage 2022 (750ml)')?.name).toBe('Crozes-Hermitage');
    expect(findAppellation('Castello di Brolio Chianti Classico Gran Selezione')?.name).toBe('Chianti Classico');
    expect(findAppellation('Taylor Fladgate 10 Year Tawny Port')?.name).toBe('Porto');
    expect(findAppellation('Failla Pinot Noir Sonoma Coast 2023')?.area).toBe('Sonoma');
    expect(findAppellation('Some Wine')).toBeNull();
  });

  it('reads grape names and synonyms', () => {
    expect(findGrapes('Bodegas X Garnacha Old Vines')).toEqual(['Grenache']);
    expect(findGrapes('Penfolds Bin 28 Shiraz')).toEqual(['Syrah']);
    expect(findGrapes('Cabernet Franc Chinon')).toEqual(['Cabernet Franc']);
    expect(findGrapes('Avignonesi Vino Nobile di Montepulciano')).toEqual([]);
    expect(canonicalGrape('Garnacha')).toBe('Grenache');
    expect(canonicalGrape('Counoise')).toBe('Counoise');
  });

  it('infers usual grapes only when none are named', () => {
    expect(factsFromText('Domaine X Gigondas 2021')).toMatchObject({ area: 'Southern Rhône', grapes: ['Grenache', 'Syrah'], grapesInferred: true, style: 'red' });
    expect(factsFromText('Domaine Y Gigondas Syrah')).toMatchObject({ grapes: ['Syrah'], grapesInferred: false });
  });
});

describe('advice with the appellation guide', () => {
  const cdp = [
    wine({ producer: 'Domaine La Millière', name: 'Châteauneuf-du-Pape Vieilles Vignes', region: 'Châteauneuf-du-Pape', country: 'France', grapes: ['Grenache', 'Syrah'], style: 'red', rating: 'loved' }),
    wine({ producer: 'Clos Saint Michel (Mousset)', name: 'Châteauneuf-du-Pape', region: 'Châteauneuf-du-Pape', country: 'France', grapes: ['Grenache'], style: 'red', rating: 'liked' }),
    wine({ producer: 'R. López de Heredia', name: 'Viña Bosconia', region: 'Rioja', country: 'Spain', grapes: ['Tempranillo', 'Garnacha'], style: 'red', rating: 'liked' }),
  ];

  it('connects a Gigondas to the Southern Rhône wines you liked', () => {
    const a = advise(cdp, { query: 'Domaine Santa Duc Gigondas 2021', style: 'red' });
    const kinds = a.signals.map((s) => `${s.kind}:${s.value}${s.inferred ? ' (usual)' : ''}`);
    expect(kinds).toContain('area:Southern Rhône');
    expect(kinds).toContain('grape:Grenache (usual)');
    expect(a.verdict.level === 'good' || a.verdict.level === 'strong').toBe(true);
  });

  it('treats Garnacha and Grenache as one grape', () => {
    const a = advise(cdp, { query: 'Garnacha' });
    expect(a.signals.find((s) => s.kind === 'grape')?.wines).toHaveLength(3);
  });

  it('matches a producer without its bracketed note', () => {
    const a = advise(cdp, { query: 'Clos Saint Michel Chateauneuf-du-Pape 2022' });
    expect(a.exact.map((w) => w.producer)).toEqual(['Clos Saint Michel (Mousset)']);
    expect(a.verdict.title).toBe('You liked this one');
  });
});
