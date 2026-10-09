import { ArrowRight } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllWines } from '../hooks';
import { hasApiKey } from '../lib/labelReader';
import { cellarLinks, needsLesson, writeLesson } from '../lib/learn';
import type { Wine } from '../types';

// Loaded when first opened: most visits to a wine page never open the lesson.
const LessonSheet = lazy(() => import('./LessonSheet').then((m) => ({ default: m.LessonSheet })));

/**
 * The "Learn" tile inside Palate's take: one stacked tile that opens the lesson sheet (the grape,
 * the place, how it's made, what to taste for). The lesson is written once by Claude the first
 * time the wine is opened, then kept; tapping before it's written writes it, then opens it.
 */
export function WineLearn({ wine }: { wine: Wine }) {
  const all = useAllWines();
  const navigate = useNavigate();
  const links = useMemo(() => (all ? cellarLinks(wine, all) : []), [wine, all]);
  const [state, setState] = useState<{ status: 'idle' | 'busy' } | { status: 'error'; reason: string }>({ status: 'idle' });
  const [open, setOpen] = useState(false);
  const canWrite = hasApiKey();

  const write = (thenOpen: boolean) => {
    if (!all) return;
    setState({ status: 'busy' });
    void writeLesson(wine, all).then((out) => {
      setState(out.ok ? { status: 'idle' } : { status: 'error', reason: out.reason });
      if (out.ok && thenOpen) setOpen(true);
    });
  };

  useEffect(() => {
    if (all && canWrite && navigator.onLine && needsLesson(wine)) write(false);
  }, [wine.id, Boolean(all)]);

  if (wine.list === 'passed') return null;
  const lesson = wine.lesson;

  const tap = () => {
    if (lesson) setOpen(true);
    else if (!canWrite) navigate('/profile', { state: { focusKey: Date.now() } });
    else if (state.status !== 'busy') write(true);
  };

  const sub = lesson
    ? 'The grape · The place · How it’s made · Taste for it'
    : state.status === 'busy'
      ? 'Writing the four cards…'
      : state.status === 'error'
        ? `Couldn’t write it (${state.reason}). Tap to try again.`
        : !canWrite
          ? 'Add your Anthropic key in My palate to unlock it'
          : 'Written once · ~2¢';

  return (
    <>
      <button type="button" className="learn-tile" onClick={tap} aria-busy={state.status === 'busy'}>
        <span className="learn-edge back" aria-hidden="true" />
        <span className="learn-edge mid" aria-hidden="true" />
        <span className="learn-face">
          <span className="learn-text">
            <span className="learn-eyebrow">Learn · 4 short cards</span>
            <span className="learn-title">
              Why it tastes <em>like this</em>
            </span>
            <span className="learn-sub">{sub}</span>
          </span>
          <span className="learn-arrow" aria-hidden="true">
            <ArrowRight size={18} strokeWidth={1.9} />
          </span>
        </span>
      </button>
      {open && lesson && (
        <Suspense fallback={null}>
          <LessonSheet wine={wine} lesson={lesson} links={links} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
