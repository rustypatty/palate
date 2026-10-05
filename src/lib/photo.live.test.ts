import { it } from 'vitest';
import { findBottlePhotosWithClaude } from './bottlePhotoClient';

// Live: needs PALATE_TEST_KEY. Costs a few cents.
const key = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PALATE_TEST_KEY;
it.runIf(key)('finds a bottle photo for a wine', async () => {
  const out = await findBottlePhotosWithClaude(key!, 'Domaine de la Bressande En Sazenay 2022 (Mercurey, France)', null);
  console.log(JSON.stringify(out, null, 1));
}, 600_000);
