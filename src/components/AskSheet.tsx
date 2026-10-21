import { ArrowUp, ArrowUpRight, ChevronRight, Heart } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

/** Bottles shown with an answer before "Show more". */
const FIRST = 3;
import { Link, useNavigate } from 'react-router-dom';
import { useAllWines } from '../hooks';
import { askable, askWines, loadTurns, saveTurns, suggestions, type AskAnswer, type AskTurn } from '../lib/ask';
import type { ShopRow } from '../lib/askStores';
import { formatPrice } from '../lib/format';
import { hasApiKey } from '../lib/labelReader';
import { storeById, type StoreId } from '../lib/stores';
import type { Wine } from '../types';
import { BottleImage } from './BottleImage';
import { Sheet } from './Sheet';

/** Where "Find at …" takes you: In store, that store's list, filtered to the answer's colour. */
export interface StorePicksPrefill {
  picks: true;
}

function ratingLine(w: Wine) {
  if (w.list === 'want') return 'Want to try';
  if (w.rating === 'loved')
    return (
      <>
        <Heart size={12} fill="currentColor" strokeWidth={0} /> Loved
      </>
    );
  if (w.rating === 'liked') return 'Liked';
  if (w.rating === 'wouldnt') return 'Wouldn’t buy again';
  return w.owned > 0 ? `${w.owned} at home · not tasted` : 'Not tasted yet';
}

function WineRow({ wine }: { wine: Wine }) {
  return (
    <Link to={`/wine/${wine.id}`} className="ask-wine">
      <span className="tile ask-wine-stage">
        <BottleImage photo={wine.photo} alt="" />
      </span>
      <span className="ask-wine-text">
        {wine.producer && wine.name && <span className="ask-wine-producer">{wine.producer}</span>}
        <span className="ask-wine-name">{[wine.name || wine.producer, wine.vintage ?? ''].filter(Boolean).join(' ')}</span>
        <span className={`ask-wine-rating${wine.rating === 'loved' && wine.list !== 'want' ? ' loved' : ''}`}>{ratingLine(wine)}</span>
      </span>
      <ChevronRight size={18} strokeWidth={1.7} className="ask-wine-chev" />
    </Link>
  );
}

/** A bottle from a store's saved list: opens its page on the store's site. */
function ShopBottle({ row }: { row: ShopRow }) {
  return (
    <a href={row.url} target="_blank" rel="noreferrer" className="ask-wine">
      <span className="tile ask-wine-stage">
        {row.image && <BottleImage photo={{ kind: 'remote', url: row.image, source: { name: row.storeName, pageUrl: row.url, title: '' } }} alt="" />}
      </span>
      <span className="ask-wine-text">
        <span className="ask-wine-producer">{row.storeName}</span>
        <span className="ask-wine-name">{row.title}</span>
        <span className="ask-wine-rating">{[row.price !== null ? formatPrice(row.price) : '', row.deal, row.score].filter(Boolean).join(' · ')}</span>
      </span>
      <ArrowUpRight size={18} strokeWidth={1.7} className="ask-wine-chev" />
    </a>
  );
}

function Answer({ a, wines, count, onStore }: { a: Partial<AskAnswer>; wines: Map<string, Wine>; count: number; onStore: (id: StoreId, colour: AskAnswer['colour']) => void }) {
  const [all, setAll] = useState(false);
  const rows = (a.wineIds ?? []).flatMap((id) => (wines.has(id) ? [wines.get(id)!] : []));
  const shop = a.shop ?? [];
  // Store picks come first when there are any; your own wines follow under their own label.
  const cards = [...shop.map((r) => ({ key: r.url, el: <ShopBottle key={r.url} row={r} /> })), ...rows.map((w) => ({ key: w.id, el: <WineRow key={w.id} wine={w} /> }))];
  const shown = all ? cards : cards.slice(0, FIRST);
  const firstOwn = shop.length;
  return (
    <div className="ask-answer">
      {a.fromList && !shop.length && <div className="eyebrow ask-from">From your {count} wines</div>}
      {(a.headline || a.italic) && (
        <h3 className="ask-headline">
          {a.headline} {a.italic && <em>{a.italic}</em>}
        </h3>
      )}
      {a.body && <p className="ask-body">{a.body}</p>}
      {shown.length > 0 && (
        <div className="ask-wines">
          {shown.map((c, i) => (
            <div key={c.key} className="ask-card">
              {shop.length > 0 && rows.length > 0 && i === firstOwn && <div className="eyebrow ask-own">From your wines</div>}
              {c.el}
            </div>
          ))}
          {cards.length > FIRST && (
            <button type="button" className="ask-more" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show ${cards.length - FIRST} more`}
            </button>
          )}
        </div>
      )}
      {(a.stores ?? []).length > 0 && (
        <div className="ask-stores">
          {a.stores!.map((id) => (
            <button key={id} type="button" className="chip outline" onClick={() => onStore(id, a.colour ?? 'any')}>
              Find at {storeById(id).name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Ask your wines": a chat about your own wines, opened from My wines. Read-only. */
export function AskSheet({ onClose }: { onClose: () => void }) {
  const all = useAllWines();
  const navigate = useNavigate();
  const [turns, setTurns] = useState<AskTurn[]>(loadTurns);
  const [text, setText] = useState('');
  const [live, setLive] = useState<{ q: string; a: Partial<AskAnswer> } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const hasKey = hasApiKey();

  const list = useMemo(() => askable(all ?? []), [all]);
  const byId = useMemo(() => new Map(list.map((w) => [w.id, w])), [list]);
  const examples = useMemo(() => suggestions(all ?? []), [all]);

  useEffect(() => saveTurns(turns), [turns]);
  // The tab bar would sit on top of the input: hidden while the chat is open.
  useEffect(() => {
    document.body.classList.add('ask-open');
    return () => {
      document.body.classList.remove('ask-open');
      abort.current?.abort();
    };
  }, []);
  useEffect(() => end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), [turns.length, live?.a.body, live?.q]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || live || !all) return;
    setText('');
    const ctl = new AbortController();
    abort.current = ctl;
    setLive({ q, a: {} });
    const out = await askWines(q, turns, all, ctl.signal, (a) => setLive({ q, a }));
    if (ctl.signal.aborted) return;
    setLive(null);
    setTurns((t) => [...t, out.ok ? { q, a: out.answer } : { q, a: null, error: out.reason }]);
  };

  const newChat = () => {
    abort.current?.abort();
    setLive(null);
    setTurns([]);
  };

  const toStore = (id: StoreId, colour: AskAnswer['colour']) => {
    try {
      localStorage.setItem('palate.store', JSON.stringify(id));
      localStorage.setItem('palate.storeMode', JSON.stringify('shop'));
      localStorage.setItem('palate.listStyle', JSON.stringify(colour));
    } catch {
      /* storage unavailable: In store opens on its last store */
    }
    navigate('/store', { state: { picks: true } satisfies StorePicksPrefill });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };
  const talking = turns.length > 0 || live !== null;

  return (
    <Sheet
      title="Ask your wines"
      onClose={onClose}
      tall
      swipeToClose
      className="ask-sheet"
      heading={
        talking ? (
          <h2 className="ask-title">
            Ask <em>your wines</em>
          </h2>
        ) : (
          <span />
        )
      }
      headerAction={
        talking ? (
          <button type="button" className="btn btn-tone btn-sm" onClick={newChat}>
            New chat
          </button>
        ) : undefined
      }
      footer={
        <form className="ask-input" onSubmit={onSubmit}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={talking ? 'Ask a follow-up…' : 'Ask about your wines…'}
            aria-label="Your question"
            enterKeyHint="send"
            disabled={!hasKey}
          />
          <button type="submit" className={`ask-send${text.trim() ? ' ready' : ''}`} disabled={!text.trim() || live !== null || !hasKey} aria-label="Send">
            <ArrowUp size={22} strokeWidth={2} />
          </button>
        </form>
      }
    >
      {!talking ? (
        <div className="ask-empty">
          <div className="eyebrow">Ask · {list.length} wines</div>
          <h3 className="ask-hello">
            What do you want to <em>know?</em>
          </h3>
          <p className="ask-lede">Ask about your bottles, what to open or try next, what Pogo’s or Total Wine has, or anything about wine.</p>
          {hasKey ? (
            <div className="ask-examples">
              {examples.map((q) => (
                <button key={q} type="button" className="ask-example" onClick={() => void send(q)}>
                  {q}
                </button>
              ))}
            </div>
          ) : (
            <p className="ask-lede">
              To ask, add your Anthropic API key in{' '}
              <Link to="/profile" className="text-link">
                My palate → Label reading with Claude
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <div className="ask-thread" aria-live="polite">
          {turns.map((t, i) => (
            <div key={i} className="ask-turn">
              <div className="ask-q">{t.q}</div>
              {t.a ? (
                <Answer a={t.a} wines={byId} count={list.length} onStore={toStore} />
              ) : (
                <p className="ask-error">Couldn’t answer that ({t.error}).</p>
              )}
            </div>
          ))}
          {live && (
            <div className="ask-turn">
              <div className="ask-q">{live.q}</div>
              {live.a.headline || live.a.body ? <Answer a={live.a} wines={byId} count={list.length} onStore={toStore} /> : <p className="ask-thinking">Looking through your wines…</p>}
            </div>
          )}
          <div ref={end} />
        </div>
      )}
    </Sheet>
  );
}
