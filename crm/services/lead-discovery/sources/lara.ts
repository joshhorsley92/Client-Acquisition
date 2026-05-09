// Michigan LARA (Department of Licensing and Regulatory Affairs) business
// search. The legacy Python pipeline scraped the public business search
// portal at https://cofs.lara.state.mi.us/. The portal is server-rendered
// HTML — no JS required — so a plain fetch + cheerio parse works.
//
// LIMITATION: LARA's portal doesn't expose a stable, easily-scraped JSON
// endpoint. The HTML structure is a classic ASP.NET form (POST __VIEWSTATE
// + filters → result table). Implementing a robust port is multi-day work
// and outside the scope of v1 of the rewrite. This stub returns an empty
// result with a clear log message so the pipeline still wires end-to-end.
// Replace `discover` with the real implementation when LARA support is
// prioritised.

import type { Source, DiscoverParams, CandidateInput } from '../registry';

export const laraSource: Source = {
  key: 'lara',
  label: 'Michigan LARA (coming soon)',
  isAvailable() {
    return true;
  },
  async discover(_params: DiscoverParams): Promise<CandidateInput[]> {
    // Stub. Returning an empty array surfaces in the UI as "0 leads found",
    // which is the right signal that this source isn't wired yet without
    // throwing a noisy error. Implementation tracked in v1.x.
    return [];
  },
};
