// /discovery — Lead Discovery (the v2 of the legacy "Find New Clients"
// button). Server wrapper just renders the client view; all state and
// fetches live in DiscoveryView.

import DiscoveryView from '@/components/DiscoveryView';

export default function DiscoveryPage() {
  return <DiscoveryView />;
}
