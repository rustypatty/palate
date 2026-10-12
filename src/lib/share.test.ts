import { describe, expect, it } from 'vitest';
import { wine } from '../test/fixtures';
import { changesSince, lovedToShare, sharedWine, shareUrl, type SharedList } from './share';

const take = { whatItIs: 'A Rioja Reserva from a classic house.', taste: 'Red cherry, vanilla, silky.', fit: 'Like the Riojas you loved.', serve: 'Decant 30 minutes.', caveat: '', writtenAt: 1, rating: null };
const muga = wine({ id: 'muga', producer: 'Bodegas Muga', name: 'Rioja Reserva', vintage: 2019, rating: 'loved', price: 28, owned: 3, notes: 'My secret note', tastedOn: '2026-03-01', take, updatedAt: 2 });
const liked = wine({ id: 'liked', producer: 'A', name: 'B', rating: 'liked' });
const wanted = wine({ id: 'want', producer: 'C', name: 'D', rating: 'loved', list: 'want' });
const older = wine({ id: 'older', producer: 'E', name: 'F', rating: 'loved', updatedAt: 1 });

describe('sharing your loved wines', () => {
  it('shares only wines you loved, most recently rated first', () => {
    expect(lovedToShare([older, liked, muga, wanted]).map((w) => w.id)).toEqual(['muga', 'older']);
  });

  it('never includes your notes, prices, bottles at home or tasting dates', () => {
    const s = sharedWine(muga, 'https://example.com/p.jpg');
    const text = JSON.stringify(s);
    for (const secret of ['My secret note', '28', '2026-03-01', 'Like the Riojas you loved']) expect(text).not.toContain(secret);
    expect(Object.keys(s).sort()).toEqual(['about', 'country', 'grapes', 'id', 'name', 'photo', 'producer', 'region', 'style', 'vintage']);
    // Palate's own description is fine to share.
    expect(s.about).toEqual({ whatItIs: take.whatItIs, taste: take.taste });
  });

  it('counts loved wines added or removed since the page was made', () => {
    const list: SharedList = { name: 'Rusty', wines: [sharedWine(older, null), sharedWine(liked, null)], photos: {}, sharedAt: 1 };
    expect(changesSince(list, [older, liked, muga])).toBe(2); // muga added, liked no longer loved
  });

  it('puts the page next to the app', () => {
    expect(shareUrl({ origin: 'https://rustypatty.github.io', pathname: '/palate/' })).toBe('https://rustypatty.github.io/palate/loved/');
    expect(shareUrl({ origin: 'https://rustypatty.github.io', pathname: '/palate/index.html' })).toBe('https://rustypatty.github.io/palate/loved/');
  });
});
