import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Sheet', () => {
  it('keeps a form inside it from submitting the form the page opened it from', async () => {
    const page = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const inside = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <form onSubmit={page}>
          <Sheet title="Find a bottle photo" onClose={() => {}}>
            <form onSubmit={inside}>
              <button type="submit">Search</button>
            </form>
          </Sheet>
        </form>,
      );
    });
    const search = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Search')!;
    await act(async () => {
      search.click();
    });
    expect(inside).toHaveBeenCalledTimes(1);
    expect(page).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    host.remove();
  });
});
