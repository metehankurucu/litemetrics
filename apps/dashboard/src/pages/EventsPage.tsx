import type { InsaytClient } from '@insayt/client';
import { EventsExplorer } from '../components/EventsExplorer';

interface EventsPageProps {
  siteId: string;
  client: InsaytClient;
  onUserClick: (visitorId: string) => void;
}

export function EventsPage({ siteId, client, onUserClick }: EventsPageProps) {
  return <EventsExplorer siteId={siteId} client={client} onUserClick={onUserClick} />;
}
