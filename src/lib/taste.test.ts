import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { makeAdvisor } from './insights';
import { buyAgain, fromCellar, moreLikeThis, rankCandidates, reasonFor } from './recommend';
import { buildTaste, MIN_RATED, noteWords } from './taste';

// Shaped like Rusty's real list.
const mine = [
  wine({ producer: 'Château Haut-Bages Libéral', name: 'Pauillac', region: 'Pauillac', country: 'France', grapes: ['Cabernet Sauvignon', 'Merlot'], style: 'red', rating: 'loved' }),
  wine({ producer: 'Renato Ratti', name: 'Barolo Marcenasco', region: 'Barolo', country: 'Italy', grapes: ['Nebbiolo'], style: 'red', rating: 'loved' }),
  wine({ producer: 'Vega Sicilia', name: 'Macán Clásico', region: 'Rioja', country: 'Spain', grapes: ['Tempranillo'], style: 'red', rating: 'loved', price: 45 }),
  wine({ producer: 'R. López de Heredia', name: 'Viña Bosconia Reserva', region: 'Rioja', country: 'Spain', grapes: ['Tempranillo', 'Garnacha'], style: 'red', rating: 'liked', price: 50 }),
  wine({ producer: 'Château Puy d’Amour', name: 'Côtes de Bourg', region: 'Côtes de Bourg', country: 'France', grapes: ['Merlot', 'Cabernet Franc'], style: 'red', rating: 'wouldnt', notes: 'Decent, but no gripping tannins; not one I would pick again.' }),
  wine({ producer: '', name: 'Very dry red', style: 'red', rating: 'wouldnt', notes: 'Disliked: very dry, very dark, little fruit.' }),
  wine({ producer: 'Domaine La Millière', name: 'Châteauneuf-du-Pape Vieilles Vignes', region: 'Châteauneuf-du-Pape', country: 'France', grapes: ['Grenache', 'Syrah'], style: 'red', rating: 'liked', price: 40 }),
  wine({ producer: 'Clos Saint Michel (Mousset)', name: 'Châteauneuf-du-Pape Cuvée Réservée', region: 'Châteauneuf-du-Pape', country: 'France', grapes: ['Grenache', 'Syrah'], style: 'red', rating: 'loved', notes: 'Earthy and peppery, really good.' }),
  wine({ producer: 'Marchesi di Barolo', name: 'Barolo', region: 'Barolo', country: 'Italy', grapes: ['Nebbiolo'], style: 'red', owned: 1, createdAt: Date.parse('2026-01-01') }),
  wine({ producer: 'Barone Ricasoli', name: 'Castello di Brolio', region: 'Chianti Classico', country: 'Italy', style: 'red', owned: 1, createdAt: Date.parse('2026-09-01') }),
];

describe('taste profile', () => {
  const t = buildTaste(mine);

  it('counts rated wines and knows when there are enough', () => {
    expect(t.rated).toBe(8);
    expect(t.enough).toBe(true);
    expect(buildTaste(mine.slice(0, MIN_RATED - 1)).enough).toBe(false);
  });

  it('describes what you lean toward in plain language', () => {
    expect(t.style).toBe('red');
    expect(t.summary[0]).toMatch(/^You lean toward reds from /);
    expect(t.summary[0]).toMatch(/Rioja/);
    expect(t.summary[0]).toMatch(/Châteauneuf-du-Pape/);
    expect(t.summary[0]).toMatch(/Tempranillo/);
    expect(t.summary[0]).toMatch(/usually \$40–50/);
  });

  it('names what you pass on, from "wouldn’t buy again" only', () => {
    expect(t.dislikes.map((d) => d.value)).toContain('Côtes de Bourg');
    expect(t.summary.join(' ')).toMatch(/pass on .*Côtes de Bourg/);
    // Merlot: loved in the Pauillac, disliked in the Côtes de Bourg — not a clear dislike.
    expect(t.dislikes.map((d) => d.value)).not.toContain('Merlot');
    // One disliked bottle doesn't make a whole grape a dislike.
    expect(t.dislikes.map((d) => d.value)).not.toContain('Cabernet Franc');
  });

  it('picks tasting words out of your own notes', () => {
    expect(noteWords('Disliked: very dry, very dark, little fruit.')).toEqual(['little fruit', 'very dry']);
    expect(t.notesLiked).toEqual(['earthy', 'peppery']);
    expect(t.notesDisliked).toEqual(expect.arrayContaining(['no tannin grip', 'very dry', 'little fruit']));
  });

  it('leaves the price out until enough wines have one', () => {
    expect(buildTaste(mine.map((w) => ({ ...w, price: null }))).price).toBeNull();
  });
});

describe('rows from your collection', () => {
  it('buy again: loved with none at home', () => {
    expect(buyAgain(mine).map((w) => w.producer)).toEqual(expect.arrayContaining(['Renato Ratti', 'Vega Sicilia']));
    expect(buyAgain(mine).every((w) => w.rating === 'loved' && w.owned === 0)).toBe(true);
  });

  it('from your cellar: owned and untouched for six months', () => {
    expect(fromCellar(mine, Date.parse('2026-10-04')).map((w) => w.producer)).toEqual(['Marchesi di Barolo']);
  });

  it('more like this: same region and grape first, never a different colour', () => {
    const white = wine({ producer: 'Somebody', name: 'Barolo Bianco?', region: 'Barolo', grapes: ['Nebbiolo'], style: 'white' });
    const like = moreLikeThis(mine[1], [...mine, white]);
    expect(like[0].producer).toBe('Marchesi di Barolo');
    expect(like).not.toContain(white);
  });
});

describe('ranking store bottles', () => {
  const advisor = makeAdvisor(mine);
  const shelf = [
    { key: '1', title: 'Domaine Santa Duc Gigondas Les Hauts Garrigues 2020 (750ml)', style: 'red' as const, price: 38 },
    { key: '2', title: 'La Rioja Alta Viña Ardanza Reserva 2016 (750ml)', style: 'red' as const, price: 42 },
    { key: '3', title: 'Château Puy d’Amour Côtes de Bourg 2022', style: 'red' as const, price: 18 },
    { key: '4', title: 'Kim Crawford Sauvignon Blanc Marlborough 2024', style: 'white' as const, price: 15 },
    { key: '5', title: 'Clos Saint Michel Chateauneuf-du-Pape Cuvée Réservée 2021', style: 'red' as const, price: 65 },
    { key: '6', title: 'Random Red Blend California', style: 'red' as const, price: 12 },
  ];

  it('puts a bottle you loved first and drops ones you’d skip', () => {
    const picks = rankCandidates(advisor, shelf);
    expect(picks[0].item.key).toBe('5');
    expect(picks[0].reason).toBe('You loved this one');
    const keys = picks.map((p) => p.item.key);
    expect(keys).toEqual(expect.arrayContaining(['1', '2']));
    expect(keys).not.toContain('3'); // wouldn't buy again
    expect(keys).not.toContain('4'); // no evidence either way
    expect(keys).not.toContain('6'); // only "it's red"
  });

  it('explains each pick from your history', () => {
    const gig = rankCandidates(advisor, shelf).find((p) => p.item.key === '1')!;
    expect(gig.reason).toMatch(/Southern Rhône — you’ve 1 loved, 1 liked|Usually Grenache — you’ve/);
    expect(reasonFor(advisor.advise({ query: 'Viña Ardanza Rioja' }))).toMatch(/^Rioja — you’ve 1 loved, 1 liked/);
  });

  it('respects a budget and hides "Not for me" wines', () => {
    expect(rankCandidates(advisor, shelf, { budget: 40 }).map((p) => p.item.key)).toEqual(['1']);
    const passed = [wine({ name: 'Domaine Santa Duc Gigondas', list: 'passed', suggestion: { key: '1', reason: '', source: 'Pogo’s', at: 1 } })];
    expect(rankCandidates(advisor, shelf, { passed }).map((p) => p.item.key)).not.toContain('1');
  });

  it('keeps the list varied: at most N per region', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ key: `r${i}`, title: `Bodega ${i} Rioja Crianza`, style: 'red' as const, price: 20 }));
    expect(rankCandidates(advisor, many, {}, 12, 2)).toHaveLength(2);
  });
});

describe('lessons from the real list', () => {
  it('never treats a wine without a producer as "this exact bottle"', () => {
    const advisor = makeAdvisor([wine({ name: 'Riesling (label not confirmed)', grapes: ['Riesling'], style: 'white', rating: 'liked' })]);
    const a = advisor.advise({ query: 'Donnhoff Estate Riesling Nahe 2023', style: 'white', partial: false });
    expect(a.exact).toEqual([]);
  });

  it('does not let your reds recommend a white from the same place', () => {
    const advisor = makeAdvisor(mine);
    expect(rankCandidates(advisor, [{ key: 'b', title: 'Bodega Bideona Viura Rioja Blanco 2024', style: 'white', price: 25 }])).toEqual([]);
  });

  it('matches whole words in store listings ("Rio Sordo" is not Rioja)', () => {
    const advisor = makeAdvisor(mine);
    const p = rankCandidates(advisor, [{ key: 'x', title: 'Produttori Del Barbaresco Rio Sordo Barbaresco 2020', style: 'red', price: 99 }]);
    expect(p[0]?.reason ?? '').not.toMatch(/Rioja/);
  });

  it('keeps wishes out of the dislike words and quotes them instead', () => {
    const t = buildTaste([...mine, wine({ name: 'x', producer: 'y', style: 'red', rating: 'wouldnt', notes: 'Very dry. Want a hint of fruit without being super fruity or sweet.' })]);
    expect(t.notesDisliked).not.toContain('fruity');
    expect(t.wishes).toEqual(['Want a hint of fruit without being super fruity or sweet.']);
    expect(t.summary.at(-1)).toBe('In your words: “Want a hint of fruit without being super fruity or sweet.”');
  });
});
