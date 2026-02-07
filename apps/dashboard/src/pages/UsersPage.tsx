import type { LitemetricsClient } from '@litemetrics/client';
import { UsersExplorer } from '../components/UsersExplorer';

interface UsersPageProps {
  siteId: string;
  client: LitemetricsClient;
  initialVisitorId: string | null;
  onBack: () => void;
}

export function UsersPage({ siteId, client, initialVisitorId, onBack }: UsersPageProps) {
  return (
    <UsersExplorer
      siteId={siteId}
      client={client}
      initialVisitorId={initialVisitorId}
      onBack={onBack}
    />
  );
}
