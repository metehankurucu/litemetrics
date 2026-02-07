import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { StatsBar } from './components/StatsBar';
import { EmbedShowcase } from './components/EmbedShowcase';
import { Features } from './components/Features';
import { CodeExample } from './components/CodeExample';
import { DashboardPreview } from './components/DashboardPreview';
import { OpenSource } from './components/OpenSource';
import { Footer } from './components/Footer';

export function App() {
  return (
    <div className="min-h-screen bg-zinc-950 font-body">
      <Navbar />
      <Hero />
      <StatsBar />
      <EmbedShowcase />
      <Features />
      <CodeExample />
      <DashboardPreview />
      <OpenSource />
      <Footer />
    </div>
  );
}
