import { afterEach, describe, expect, it } from 'vitest';
import { checkImport } from '../../supabase/functions/_shared/totalwine';
import source from '../../extension/read.js?raw';

// The extension's page reader (extension/read.js), run against a pretend Total Wine page.
const read = new Function(`${source}; return readTotalWinePage;`)() as () => {
  error?: string;
  stale?: boolean;
  payload?: { store: { id: string; name: string }; products: Record<string, unknown>[]; pagination: { page: number; totalPages: number } };
};

const product = (id: string) => ({
  id,
  name: `Wine ${id}, 2021`,
  brand: { id: 'x', name: 'Producer' },
  productUrl: `/wine/red-wine/sangiovese/wine/p/${id}`,
  packageDescription: '750ml Bottle',
  price: [{ price: 20, type: 'EDLP' }],
  storeId: '535',
  location: 'Aisle 11, Left',
  stockLevel: [{ stock: 12, purchaseLimit: 6 }],
  stockMessages: { messages: [{ shoppingMethod: 'INSTORE_PICKUP', stockMessage: 'In stock' }], storeInStock: false },
  // Things the extension must not copy.
  images: ['https://example.com/a.png'],
  addToCart: { token: 'secret' },
});

function page(ids: string[], onScreen = ids) {
  (window as unknown as { INITIAL_STATE: unknown }).INITIAL_STATE = {
    search: { results: { products: ids.map(product), pagination: { page: 1, pageSize: 24, totalPages: 4, totalResults: 90 } } },
    store: { store: { storeNumber: '535', name: 'Las Colinas (Irving)', city: 'Irving', phone: '000' } },
    user: { email: 'someone@example.com' },
  };
  document.body.innerHTML = onScreen.map((id) => `<a href="/wine/red-wine/sangiovese/wine/p/${id}">x</a>`).join('');
}

afterEach(() => {
  delete (window as unknown as { INITIAL_STATE?: unknown }).INITIAL_STATE;
  document.body.innerHTML = '';
});

describe('the extension reading a Total Wine page', () => {
  it('copies only the fields Palate needs, with the store', () => {
    page(['111111', '222222']);
    const out = read();
    expect(out.stale).toBe(false);
    expect(out.payload!.store).toEqual({ id: '535', name: 'Las Colinas (Irving)', city: 'Irving' });
    expect(out.payload!.pagination).toMatchObject({ page: 1, totalPages: 4 });
    const p = out.payload!.products[0];
    expect(p).toMatchObject({ id: '111111', name: 'Wine 111111, 2021', brand: { name: 'Producer' }, location: 'Aisle 11, Left' });
    expect(JSON.stringify(out.payload)).not.toMatch(/secret|example\.com|someone/);
    // And the server accepts it (jsdom's page address stands in for Total Wine's).
    expect(checkImport({ ...out.payload, pageUrl: 'https://www.totalwine.com/wine/red-wine/c/000009' })).toMatchObject({ ok: true });
  });

  it('notices when the screen no longer matches the loaded data', () => {
    page(['111111', '222222'], ['333333', '444444']);
    expect(read().stale).toBe(true);
  });

  it('says what to do on a page without wines or a store', () => {
    document.body.innerHTML = '';
    expect(read().error).toMatch(/No wines/);
    page(['111111']);
    (window as unknown as { INITIAL_STATE: { store: unknown } }).INITIAL_STATE.store = {};
    expect(read().error).toMatch(/Pick your store/);
  });
});
