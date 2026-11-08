import { createHash } from 'node:crypto';
/** Same as @covers/integrations hashImage: same photo → same hash. */
export const hashImage = (base64: string) => createHash('sha256').update(base64.replace(/\s/g, '')).digest('hex');
