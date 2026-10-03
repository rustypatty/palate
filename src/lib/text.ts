/** Lowercase and strip accents so "rose" finds "Rosé" and "cotes" finds "Côtes". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function tokens(s: string): string[] {
  return fold(s).split(/[^a-z0-9]+/).filter(Boolean);
}
