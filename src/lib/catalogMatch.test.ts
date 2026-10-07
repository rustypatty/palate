import { describe, expect, it } from 'vitest';
import { catalogFallbackText, catalogSearchText, rankCatalog, type CatalogWine } from './catalogMatch';

let n = 0;
function cw(producer: string, cuvee: string | null, more: Partial<CatalogWine> = {}): CatalogWine {
  return {
    wine_id: `wn_${++n}`,
    producer,
    cuvee,
    display_name: `${producer} ${cuvee ?? ''}`.trim(),
    aliases: [],
    country: null,
    region: null,
    appellation: null,
    wine_type: 'red',
    grapes: null,
    identity_tier: 'enriched',
    source_count: 1,
    min_usd_750: null,
    min_usd_750_seen_at: null,
    image_url: `https://img.example/${n}.jpg`,
    image_width: 600,
    image_height: 1600,
    image_source_page_url: null,
    image_source_domain: null,
    similarity: 0.5,
    ...more,
  };
}

const picked = (m: ReturnType<typeof rankCatalog>) => (m.status === 'match' ? `${m.wine.producer} | ${m.wine.cuvee ?? ''}` : m.status);

describe('catalog matching', () => {
  it('needs every distinctive word: Castello di Bossi is not Castello di Brolio', () => {
    const cands = [
      cw('Castello di Bossi', 'Chianti Classico', { appellation: 'Chianti Classico' }),
      cw('Barone Ricasoli', 'Chianti Classico Castello di Brolio', { appellation: 'Chianti Classico' }),
    ];
    expect(picked(rankCatalog({ text: 'Castello di Brolio Chianti Classico 2021' }, cands))).toBe('Barone Ricasoli | Chianti Classico Castello di Brolio');
  });

  it('counts extra words against a candidate: the plain wine beats the single vineyard and the second wine', () => {
    const cands = [
      cw('Produttori del Barbaresco', 'Pora', { appellation: 'Barbaresco' }),
      cw('Produttori del Barbaresco', 'Barbaresco', { appellation: 'Barbaresco' }),
      cw('Chateau Mouton Rothschild', 'Petit Mouton de Mouton Rothschild'),
      cw('Chateau Mouton Rothschild', null),
    ];
    expect(picked(rankCatalog({ text: 'Produttori del Barbaresco Barbaresco 2020' }, cands))).toBe('Produttori del Barbaresco | Barbaresco');
    expect(picked(rankCatalog({ text: 'Chateau Mouton Rothschild 2015' }, cands))).toBe('Chateau Mouton Rothschild | ');
  });

  it('allows menu typos and abbreviations', () => {
    const cands = [cw('Mazzei', 'Zisola', { grapes: ["Nero d'Avola"] }), cw('Domaine de Beaurenard', 'Rasteau'), cw('Santa Julia', 'Organica Malbec')];
    expect(picked(rankCatalog({ text: 'Mazzie Nero di Avola Zisola 2020' }, cands))).toBe('Mazzei | Zisola');
    expect(picked(rankCatalog({ text: 'Dom De Beaurenard Rasteau 2021' }, cands))).toBe('Domaine de Beaurenard | Rasteau');
    expect(picked(rankCatalog({ text: 'Santa Julia Malbec Organic' }, cands))).toBe('Santa Julia | Organica Malbec');
  });

  it("won't guess a colour the label doesn't give, and uses it when it does", () => {
    const cands = [cw('Domaine Faiveley', 'Mercurey Rouge'), cw('Domaine Faiveley', 'Mercurey Blanc', { wine_type: 'white' })];
    expect(rankCatalog({ text: 'Domaine Faiveley Mercurey 2021' }, cands).status).toBe('uncertain');
    expect(picked(rankCatalog({ producer: 'Domaine Faiveley', name: 'Mercurey', style: 'white' }, cands))).toBe('Domaine Faiveley | Mercurey Blanc');
  });

  it('treats the same wine listed twice as one, and prefers the real producer over a shop listing', () => {
    const cands = [
      cw('Marques de Riscal', 'Rioja Reserva', { region: 'Rioja' }),
      cw('Vintus', 'Marques De Riscal Rioja Reserva', { region: 'Rioja' }),
      cw('1.5L', 'Marques de Riscal Rioja Reserva', { region: 'Rioja', source_count: 9 }),
    ];
    expect(picked(rankCatalog({ text: 'Marques de Riscal Rioja Reserva 2019' }, cands))).toBe('Marques de Riscal | Rioja Reserva');
  });

  it("finds nothing for a wine the producer doesn't make, a near-name, or a bare appellation", () => {
    const cands = [
      cw('Ridge Vineyards', 'Monte Bello', { grapes: ['Cabernet Sauvignon', 'Merlot', 'Petit Verdot'] }),
      cw('Revello', 'Barolo', { appellation: 'Barolo' }),
      cw('Kim Crawford', 'Sauvignon Blanc', { wine_type: 'white' }),
      cw('Dom. Billaud Simon', 'Chablis', { wine_type: 'white', appellation: 'Chablis' }),
      cw('Chablis', 'Chablis', { wine_type: 'white', appellation: 'Chablis' }),
    ];
    expect(rankCatalog({ text: 'Ridge Monte Bello Merlot' }, cands).status).toBe('none');
    expect(rankCatalog({ text: 'Cantina Rovello Barolo 2018' }, cands).status).toBe('none');
    expect(rankCatalog({ text: 'Kim Crawford Malbec' }, cands).status).toBe('none');
    expect(rankCatalog({ text: 'Chablis' }, cands).status).toBe('none');
  });

  it('searches with abbreviations spelled out and without years, and narrows a second search to the name', () => {
    expect(catalogSearchText({ text: 'Dom. Leflaive Puligny-Montrachet 2019' })).toBe('domaine leflaive puligny montrachet');
    expect(catalogSearchText({ text: 'Caymus Cab 2021' })).toBe('caymus cabernet sauvignon');
    const first = [cw('Portia', 'Crianza', { region: 'Ribera del Duero' }), cw('Arzuaga', 'Crianza', { region: 'Ribera del Duero' })];
    expect(catalogFallbackText({ producer: 'Bodegas Protos', name: 'Ribera del Duero Crianza' }, first)).toBe('protos crianza');
  });
});
