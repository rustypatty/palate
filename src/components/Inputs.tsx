import { Minus, Plus, X } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { fold } from '../lib/text';

export function TagInput({
  value,
  onChange,
  suggestions,
  placeholder,
  id,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  id?: string;
}) {
  const [text, setText] = useState('');
  const listId = useId();

  const add = (raw: string) => {
    const parts = raw.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) {
      // Reuse the canonical spelling if it's a known grape ("grenache" → "Grenache").
      const canonical = suggestions.find((s) => fold(s) === fold(p)) ?? p;
      if (!next.some((v) => fold(v) === fold(canonical))) next.push(canonical);
    }
    onChange(next);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="tags">
      {value.map((t) => (
        <span key={t} className="tag">
          {t}
          <button type="button" onClick={() => onChange(value.filter((v) => v !== t))} aria-label={`Remove ${t}`}>
            <X size={14} />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={listId}
        value={text}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          // Picking from the datalist fires an input event without a typing inputType.
          const kind = (e.nativeEvent as InputEvent).inputType;
          if ((!kind || kind === 'insertReplacementText') && suggestions.includes(v)) add(v);
          else setText(v);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => add(text)}
        enterKeyHint="enter"
        autoComplete="off"
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

export function Stepper({ value, onChange, label, min = 0 }: { value: number; onChange: (n: number) => void; label: string; min?: number }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label}`}>
        <Minus size={18} />
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`}>
        <Plus size={18} />
      </button>
    </div>
  );
}
