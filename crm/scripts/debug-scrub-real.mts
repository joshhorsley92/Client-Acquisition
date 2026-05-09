// Run the REAL scrubWebsite (not the simplified debug version) against
// foundationstreeexperts.com so we see exactly what shape it returns.

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { scrubWebsite } = await import('../services/website-scrub.js' as string) as {
  scrubWebsite: (url: string) => Promise<unknown>;
};

const result = await scrubWebsite('https://foundationstreeexperts.com/');
console.log(JSON.stringify(result, null, 2));
