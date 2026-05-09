import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { StatsBar } from '../components/StatsBar';
import { EmbedShowcase } from '../components/EmbedShowcase';
import { Features } from '../components/Features';
import { CodeExample } from '../components/CodeExample';
import { DashboardPreview } from '../components/DashboardPreview';
import { OpenSource } from '../components/OpenSource';
import { FAQ, homeFaqItems } from '../components/FAQ';
import { Footer } from '../components/Footer';
import {
  SEO,
  faqSchema,
  organizationSchema,
  softwareApplicationSchema,
} from '../components/SEO';

const TITLE =
  'Litemetrics - White-label embedded analytics for your SaaS';
const DESCRIPTION =
  'Open-source analytics dashboard you embed into your SaaS. White-label, multi-tenant, self-hosted on ClickHouse or Postgres. Five lines of code.';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 font-body">
      <SEO
        title={TITLE}
        description={DESCRIPTION}
        path="/"
        jsonLd={[
          organizationSchema(),
          softwareApplicationSchema(DESCRIPTION),
          faqSchema(homeFaqItems),
        ]}
      />
      <Navbar />
      <main>
        <Hero />
        <StatsBar />
        <EmbedShowcase />
        <Features />
        <CodeExample />
        <DashboardPreview />
        <OpenSource />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
