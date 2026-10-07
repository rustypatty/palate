import { describe, expect, it } from 'vitest';
import vectors from '../../docs/catalog/match_key_test_vectors.csv?raw';
import { matchKey, norm } from './catalogNorm';

/** Minimal CSV parsing (quoted fields, doubled quotes) for the catalog's test vectors. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n') row.push(field), rows.push(row), (row = []), (field = '');
    else if (c !== '\r') field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows;
}

describe('catalog normalization', () => {
  it('reproduces every match_key in the catalog’s test vectors', () => {
    const [, ...rows] = parseCsv(vectors);
    expect(rows).toHaveLength(100);
    const wrong = rows
      .map(([producer, cuvee, type, expected]) => ({ producer, cuvee, expected, got: matchKey(producer, cuvee, type === '?' ? null : type) }))
      .filter((r) => r.got !== r.expected);
    expect(wrong).toEqual([]);
  });

  it('cleans label text the way aliases are stored', () => {
    expect(norm('Château d’Yquem — Sauternes')).toBe('chateau dyquem sauternes');
    expect(norm('Xarel·lo & Co.')).toBe('xarel lo and co');
    expect(norm('Κτήμα Γεροβασιλείου')).toBe('ktima gerovasileiou');
  });
});
