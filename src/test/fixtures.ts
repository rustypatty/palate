import { emptyDraft } from '../db';
import type { Wine } from '../types';

let n = 0;
export function wine(partial: Partial<Wine>): Wine {
  n++;
  return { ...emptyDraft(), id: `w${n}`, createdAt: n, updatedAt: n, ...partial };
}
