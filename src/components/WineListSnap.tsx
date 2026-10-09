import { Bookmark, Check, ChevronDown, ImagePlus, Plus, Send, X } from 'lucide-react';
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type Ref } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createWine } from '../db';
import { useWines } from '../hooks';
import { isStaleApp, reloadForUpdate } from '../lib/appUpdate';
import { formatPrice } from '../lib/format';
import { getApiKey } from '../lib/labelReader';
import { adoptWant } from '../lib/lists';
import { shelfContext } from '../lib/shelf';
import { useTaste } from '../lib/usePicks';
import {
  askWineList,
  draftFromListWine,
  listWineTitle,
  loadList,
  MAX_LIST_PAGES,
  overviewWineList,
  readWineList,
  saveList,
  sectionTitle,
  withDetails,
  type ListAnswer,
  type ListPick,
  type ListWine,
  type SavedList,
} from '../lib/wineList';
import type { Wine } from '../types';
import type { SnapHandle } from './ShelfSnap';
import { ago } from './StorePicks';
import { cleanReason } from './Shelf';
import { useToast } from './Toast';

const TAG_LABEL = { match: 'Best match for you', value: 'Best value', new: 'Something new', '': '' } as const;

/** Your taste and history, plus what's in your cellar right now (so it can say "you just bought that"), and your budget. */
function listContext(wines: Wine[], taste: Parameters<typeof shelfContext>[1], budget: number | null): string {
  const cellar = wines
    .filter((w) => w.owned > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 30)
    .map((w) => [w.producer, w.name, w.vintage ?? ''].filter(Boolean).join(' '));
  return [
    shelfContext(wines, taste),
    cellar.length ? `In my cellar right now: ${cellar.join('; ')}.` : '',
    budget ? `My budget tonight: under $${budget} a bottle, unless I ask otherwise.` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Snap a wine list: photos of a restaurant's list, then ask about it. Started from the page's
 * snap card (through `ref`); `onIdle` says when there's nothing in progress.
 */
export function WineListSnap({ ref, onIdle, budget = null }: { ref?: Ref<SnapHandle>; onIdle?: (idle: boolean) => void; budget?: number | null }) {
  const wines = useWines();
  const taste = useTaste();
  const toast = useToast();
  const navigate = useNavigate();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<SavedList | null>(loadList);
  const [question, setQuestion] = useState('');
  const [showList, setShowList] = useState(false);
  // The answer while Claude is still writing it, shown as it comes in.
  const [live, setLive] = useState<{ q: string; a: ListAnswer } | null>(null);
  const frame = useRef(0);
  const showLive = (q: string) => (a: ListAnswer) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setLive({ q, a }));
  };
  const endLive = () => {
    cancelAnimationFrame(frame.current);
    setLive(null);
  };

  const thumbs = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  const idle = photos.length === 0 && !busy;
  useEffect(() => onIdle?.(idle), [idle, onIdle]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  const update = (s: SavedList | null) => {
    setList(s);
    saveList(s);
  };

  const needKey = () => {
    if (getApiKey()) return false;
    toast('Add your Anthropic API key to read wine lists');
    navigate('/profile', { state: { focusKey: Date.now() } });
    return true;
  };

  useImperativeHandle(ref, () => ({
    camera: () => !needKey() && camera.current?.click(),
    library: () => !needKey() && library.current?.click(),
  }));

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    // Copy the files now: the input is cleared right after this call, which empties its FileList
    // before React runs the update below (so only the first photo or two used to get through).
    const picked = Array.from(files);
    setPhotos((cur) => [...cur, ...picked].slice(0, MAX_LIST_PAGES));
  };

  const failed = (e: unknown) => {
    if (isStaleApp(e) && reloadForUpdate()) return;
    setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
  };

  const read = async () => {
    if (!photos.length || needKey()) return;
    const ctl = new AbortController();
    abort.current = ctl;
    setError(null);
    const reading = `Reading ${photos.length === 1 ? 'the list' : `${photos.length} pages`}…`;
    setBusy(reading);
    try {
      const out = await readWineList(photos, ctl.signal, (n) => abort.current === ctl && setBusy(`${reading} ${n} ${n === 1 ? 'wine' : 'wines'} so far`));
      if (ctl.signal.aborted) return;
      if (!out.ok) return setError(`Couldn’t read the list: ${out.reason}.`);
      if (!out.wines.length) return setError(out.unreadable || 'No wines could be read. Try straight-on photos without glare.');
      // The photos were only for reading the list: they're let go here, never saved.
      setPhotos([]);
      const fresh: SavedList = { at: Date.now(), pages: photos.length, wines: out.wines, unreadable: out.unreadable, turns: [], done: {} };
      update(fresh);
      // Go straight on to the overview and picks, rather than waiting for a question.
      if (abort.current === ctl) setBusy(null);
      void overview(fresh);
      return;
    } catch (e) {
      if (!ctl.signal.aborted) failed(e);
    } finally {
      if (abort.current === ctl) setBusy(null);
    }
  };

  /** The overview and the picks in every section, in one go. */
  const overview = async (base: SavedList) => {
    if (needKey()) return;
    const ctl = new AbortController();
    abort.current = ctl;
    setError(null);
    setBusy('Picking the best for you…');
    try {
      const out = await overviewWineList(base, listContext(wines ?? [], taste, budget), budget, ctl.signal, showLive(''));
      if (ctl.signal.aborted) return;
      const turn = out.ok ? { q: '', a: out.answer } : { q: '', a: null, error: `Couldn’t pick from the list: ${out.reason}.` };
      update({ ...base, turns: [...base.turns, turn] });
    } catch (e) {
      if (!ctl.signal.aborted) failed(e);
    } finally {
      if (abort.current === ctl) {
        setBusy(null);
        endLive();
      }
    }
  };

  const ask = async (q: string, base: SavedList | null = list, force = base !== list) => {
    const text = q.trim();
    if (!base || !text || (busy && !force) || needKey()) return;
    const ctl = new AbortController();
    abort.current = ctl;
    setError(null);
    setQuestion('');
    setBusy('Thinking it over…');
    try {
      const out = await askWineList(base, text, listContext(wines ?? [], taste, budget), ctl.signal, showLive(text));
      if (ctl.signal.aborted) return;
      const turn = out.ok ? { q: text, a: out.answer } : { q: text, a: null, error: `Couldn’t answer: ${out.reason}.` };
      update({ ...base, turns: [...base.turns, turn] });
    } catch (e) {
      if (!ctl.signal.aborted) failed(e);
    } finally {
      if (abort.current === ctl) {
        setBusy(null);
        endLive();
      }
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };

  const mark = (n: number, what: 'want' | 'ordered') => list && update({ ...list, done: { ...list.done, [n]: what } });

  const act = {
    want: async (w: ListWine, p: ListPick) => {
      if (!list) return;
      await createWine({ ...draftFromListWine(withDetails(w, p), p.why, p.n, list.at), list: 'want' });
      mark(p.n, 'want');
      toast('Saved to Want to try');
    },
    order: async (w: ListWine, p: ListPick) => {
      if (!list) return;
      // Into your collection, ready to rate after dinner. Its photo comes from the web, as always.
      const draft = draftFromListWine(withDetails(w, p), p.why, p.n, list.at);
      const id = (await adoptWant(draft)) ?? (await createWine(draft));
      mark(p.n, 'ordered');
      toast('Added to your wines — rate it after dinner');
      return id;
    },
  };

  // An older list, or one whose overview failed: offer it again.
  const hasOverview = Boolean(list?.turns.some((t) => t.a?.sections));
  const sections = useMemo(() => {
    const out: { name: string; wines: { w: ListWine; n: number }[] }[] = [];
    list?.wines.forEach((w, i) => {
      const last = out[out.length - 1];
      if (last && last.name === w.section) last.wines.push({ w, n: i + 1 });
      else out.push({ name: w.section || 'Wines', wines: [{ w, n: i + 1 }] });
    });
    return out;
  }, [list?.wines]);

  /** An answer: the reply, the picks (in sections for the overview), and what's worth remembering. */
  const answer = (a: ListAnswer, writing = false) =>
    list && (
      <div className="wl-a">
        {a.reply
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((para, j) => (
            <p key={j} className="wl-reply">
              {cleanReason(para)}
            </p>
          ))}
        {a.sections?.map((s) => (
          <div key={s.kind} className="wl-section">
            <h3 className="wl-section-title">{sectionTitle(s.kind, budget)}</h3>
            <div className="pick-list">
              {s.picks.map((p, k) => (
                <ListPickCard key={`${s.kind}-${p.n}`} w={list.wines[p.n - 1]} p={p} rank={k + 1} done={list.done?.[p.n]} act={act} live={writing} />
              ))}
            </div>
          </div>
        ))}
        {a.picks.length > 0 && (
          <div className="pick-list">
            {a.picks.map((p, k) => (
              <ListPickCard key={`${p.n}-${k}`} w={list.wines[p.n - 1]} p={p} rank={k + 1} done={list.done?.[p.n]} act={act} live={writing} />
            ))}
          </div>
        )}
        {a.tip && (
          <div className="tone-card">
            <h3>Worth remembering</h3>
            <p className="reason">{cleanReason(a.tip)}</p>
          </div>
        )}
      </div>
    );

  const status = busy && (
    <div className="picks-status busy">
      <span role="status">{busy}</span>
      <button type="button" className="btn btn-white btn-sm" onClick={() => (abort.current?.abort(), setBusy(null), endLive())}>
        Cancel
      </button>
    </div>
  );

  return (
    <section className="shelf-snap wine-list" aria-label="Wine list">
      {photos.length > 0 && (
        <div className="shelf-tray">
          <div className="shelf-thumbs">
            {thumbs.map((u, i) => (
              <div key={u} className="shelf-thumb">
                <img src={u} alt={`Page ${i + 1}`} />
                {!busy && (
                  <button type="button" aria-label={`Remove page ${i + 1}`} onClick={() => setPhotos((cur) => cur.filter((_, j) => j !== i))}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {!busy && photos.length < MAX_LIST_PAGES && (
              <button type="button" className="shelf-thumb add" onClick={() => camera.current?.click()} aria-label="Photograph another page">
                <Plus size={22} strokeWidth={1.6} />
              </button>
            )}
          </div>
          {live && (
            <div className="wl-turn writing">
              {live.q && <p className="wl-q">{live.q}</p>}
              {answer(live.a, true)}
            </div>
          )}

          {busy ? (
            status
          ) : (
            <div className="shelf-tray-actions">
              <button type="button" className="btn btn-wine btn-lg" onClick={read}>
                Read the list
              </button>
              <button type="button" className="btn btn-tone btn-lg" onClick={() => library.current?.click()}>
                <ImagePlus size={17} /> Add
              </button>
              <button type="button" className="text-link" onClick={() => setPhotos([])}>
                Clear
              </button>
            </div>
          )}
          <p className="footnote">Photos are only read to find the wines and prices — they’re never saved.</p>
        </div>
      )}

      {list && (
        <div className="shelf-results">
          <div className="shelf-results-head">
            <span className="footnote">
              Read {list.wines.length} wines across {list.pages} {list.pages === 1 ? 'page' : 'pages'} · {ago(list.at)}
            </span>
            <span className="wl-head-actions">
              <button type="button" className="text-link" onClick={() => setShowList((s) => !s)} aria-expanded={showList}>
                {showList ? 'Hide' : 'See'} the list <ChevronDown size={14} style={{ transform: showList ? 'rotate(180deg)' : undefined }} />
              </button>
              <button type="button" className="text-link" onClick={() => (update(null), setShowList(false))}>
                New list
              </button>
            </span>
          </div>
          {list.unreadable && <p className="footnote">{list.unreadable}</p>}

          {showList && (
            <div className="wl-list">
              {sections.map((s) => (
                <div key={`${s.name}-${s.wines[0].n}`}>
                  <h3 className="eyebrow list-title">{s.name}</h3>
                  <ul>
                    {s.wines.map(({ w, n }) => (
                      <li key={n}>
                        <span>{listWineTitle(w)}</span>
                        <span className="muted">
                          {w.price > 0 ? formatPrice(w.price) : ''}
                          {w.glass_price > 0 ? ` · ${formatPrice(w.glass_price)} glass` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {list.turns.map((t, i) => (
            <div key={i} className="wl-turn">
              {t.q && <p className="wl-q">{t.q}</p>}
              {t.a ? (
                answer(t.a)
              ) : (
                <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                  {t.error}
                </p>
              )}
            </div>
          ))}

          {busy ? (
            status
          ) : (
            <>
              <div className="wl-quick" aria-label="Quick questions">
                {!hasOverview && (
                  <button type="button" className="chip" onClick={() => list && overview(list)}>
                    Overview &amp; picks
                  </button>
                )}
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    setQuestion('Best for me under $');
                    requestAnimationFrame(() => input.current?.focus());
                  }}
                >
                  Under $___
                </button>
              </div>
              <form className="wl-ask" onSubmit={onSubmit}>
                <label className="sr-only" htmlFor="wl-question">
                  Ask about this list
                </label>
                <input
                  id="wl-question"
                  ref={input}
                  className="input"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={list.turns.length ? 'Ask a follow-up…' : 'Any Pinot you’d recommend?'}
                  enterKeyHint="send"
                />
                <button type="submit" className="btn btn-dark" disabled={!question.trim()} aria-label="Ask">
                  <Send size={17} />
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {!list && busy && !photos.length && status}

      {error && (
        <p className="small" role="alert" style={{ color: 'var(--danger)', margin: 0, padding: '0 var(--text-in)' }}>
          {error}
        </p>
      )}

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
      <input ref={library} type="file" accept="image/*" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
    </section>
  );
}

function ListPickCard({
  w,
  p,
  rank,
  done,
  act,
  live = false,
}: {
  w: ListWine | undefined;
  p: ListPick;
  rank: number;
  done?: 'want' | 'ordered';
  /** Still being written: no buttons yet. */
  live?: boolean;
  act: { want: (w: ListWine, p: ListPick) => Promise<void>; order: (w: ListWine, p: ListPick) => Promise<string | undefined> };
}) {
  const [orderedId, setOrderedId] = useState<string | null>(null);
  if (!w) return null;
  const full = withDetails(w, p);
  const facts = [full.grapes.join(', '), full.region].filter(Boolean).join(' · ');
  return (
    <article className="shelf-card compact wl-pick">
      <div className="sc-head">
        <div className="pr-no">
          No. {String(rank).padStart(2, '0')}
          {p.tag && <span className={`wl-tag ${p.tag}`}>{TAG_LABEL[p.tag]}</span>}
        </div>
        {w.producer && <div className="pr-producer">{w.producer}</div>}
        <h3 className="pr-name">{[w.wine || w.producer, w.vintage].filter(Boolean).join(' ')}</h3>
        <div className="sc-price">
          {w.price > 0 ? <strong>{formatPrice(w.price)}</strong> : <span className="muted">No bottle price</span>}
          {w.glass_price > 0 && <span className="muted"> · {formatPrice(w.glass_price)} a glass</span>}
        </div>
        {facts && <div className="sc-note">{facts}</div>}
      </div>
      <p className="reason">{cleanReason(p.why)}</p>
      {!live && <div className="pr-actions">
        {done === 'ordered' ? (
          orderedId ? (
            <Link to={`/wine/${orderedId}`} className="btn btn-tone">
              <Check size={16} /> Ordered · rate it
            </Link>
          ) : (
            <span className="btn btn-tone is-saved">
              <Check size={16} /> Ordered
            </span>
          )
        ) : (
          <>
            <button type="button" className="btn btn-dark" onClick={async () => setOrderedId((await act.order(w, p)) ?? null)}>
              <Check size={16} /> I’m ordering this
            </button>
            <button type="button" className={`btn btn-tone${done === 'want' ? ' is-saved' : ''}`} disabled={done === 'want'} onClick={() => act.want(w, p)}>
              <Bookmark size={16} strokeWidth={1.7} /> {done === 'want' ? 'Saved' : 'Want to try'}
            </button>
          </>
        )}
      </div>}
    </article>
  );
}
