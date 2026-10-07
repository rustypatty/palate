import { FileUp } from 'lucide-react';
import { useRef, useState, useSyncExternalStore } from 'react';
import { useWines } from '../hooks';
import { loadProfile, planImport, saveProfile, subscribeProfile, type ImportPlan } from '../lib/profile';
import { existingFor, runImport } from '../lib/profileImport';
import { useToast } from './Toast';

const KIND_LABEL = { rated: 'Rated', owned: 'Bought', want: 'Want to try' } as const;
const RATING_LABEL = { loved: 'Loved', liked: 'Liked', wouldnt: 'Wouldn’t buy again' } as const;

/**
 * "Your wine profile" on My palate: import a history file (from earlier wine conversations),
 * check what will be added, then add it. The profile is what every Claude answer reads.
 */
export function ProfileImport() {
  const profile = useSyncExternalStore(subscribeProfile, loadProfile);
  const wines = useWines();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPlan(planImport(await file.text()));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t read that file');
    }
  };

  const run = async () => {
    if (!plan) return;
    setProgress({ done: 0, total: plan.items.length });
    try {
      const out = await runImport(plan, (done, total) => setProgress({ done, total }));
      toast(`Added ${out.added} ${out.added === 1 ? 'wine' : 'wines'} and your profile${out.alreadyThere.length ? ` · ${out.alreadyThere.length} already in Palate` : ''}`);
      setPlan(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The import didn’t finish. Try again.');
    } finally {
      setProgress(null);
    }
  };

  if (plan) {
    const fresh = plan.items.filter((it) => !existingFor(it, wines ?? []));
    const there = plan.items.length - fresh.length;
    const p = plan.profile;
    return (
      <div className="profile-import">
        <p className="lede" style={{ margin: 0 }}>
          {fresh.length} {fresh.length === 1 ? 'wine' : 'wines'} to add{there ? ` (${there} already in Palate, left as they are)` : ''}, plus your profile:{' '}
          {p.preferences.length} preferences, {p.feedback.length} notes on unidentified bottles, {p.suggestedBefore.length} past suggestions (kept as history, not
          ratings).
        </p>
        <ul className="import-list">
          {fresh.map((it) => (
            <li key={it.sourceId}>
              <span className="import-name">{[it.name, it.vintage].filter(Boolean).join(' ')}</span>
              <span className="import-tag">{it.rating ? RATING_LABEL[it.rating] : KIND_LABEL[it.kind]}</span>
            </li>
          ))}
        </ul>
        {progress ? (
          <div className="picks-status busy">
            Adding {progress.done} of {progress.total}… looking each up in Palate’s catalog
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-wine" onClick={run}>
              Import
            </button>
            <button type="button" className="btn btn-white" onClick={() => setPlan(null)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="profile-import">
      {profile ? (
        <>
          {profile.summary && <p className="reason" style={{ margin: 0 }}>{profile.summary}</p>}
          <ul className="bullets small">
            {profile.preferences.slice(0, 6).map((x) => (
              <li key={x.dimension}>
                <strong>{x.dimension[0].toUpperCase() + x.dimension.slice(1)}:</strong> {x.value}
              </li>
            ))}
          </ul>
          <p className="footnote" style={{ margin: 0 }}>
            Imported {new Date(profile.importedAt).toLocaleDateString()} (as of {profile.asOf}). Every recommendation, shelf and wine-list answer reads it.
          </p>
        </>
      ) : (
        <p className="small" style={{ margin: 0, color: 'var(--ink-2)' }}>
          Have a wine history file from earlier conversations (a profile .json)? Import it: your rated and bought bottles join your collection, and your
          preferences, rules and notes guide every recommendation.
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-dark" onClick={() => fileRef.current?.click()}>
          <FileUp size={18} /> {profile ? 'Import again' : 'Import history file'}
        </button>
        {profile && (
          <button type="button" className="btn btn-white" onClick={() => (saveProfile(null), toast('Profile removed (your wines stay)'))}>
            Remove profile
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
    </div>
  );
}
