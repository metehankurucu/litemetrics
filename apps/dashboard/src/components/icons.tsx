// Browser logos
import chromeSvg from '../assets/icons/chrome.svg';
import firefoxSvg from '../assets/icons/firefox.svg';
import safariSvg from '../assets/icons/safari.svg';
import edgeSvg from '../assets/icons/microsoft-edge.svg';
import operaSvg from '../assets/icons/opera.svg';
import braveSvg from '../assets/icons/brave.svg';
import vivaldiSvg from '../assets/icons/vivaldi-icon.svg';
import samsungSvg from '../assets/icons/samsung.svg';

// OS logos
import windowsSvg from '../assets/icons/microsoft-windows-icon.svg';
import appleSvg from '../assets/icons/apple.svg';
import androidSvg from '../assets/icons/android-icon.svg';
import linuxSvg from '../assets/icons/linux-tux.svg';

// Referrer / UTM source logos
import googleSvg from '../assets/icons/google-icon.svg';
import instagramSvg from '../assets/icons/instagram-icon.svg';
import xSvg from '../assets/icons/x.svg';
import facebookSvg from '../assets/icons/facebook.svg';
import linkedinSvg from '../assets/icons/linkedin-icon.svg';
import youtubeSvg from '../assets/icons/youtube-icon.svg';
import githubSvg from '../assets/icons/github-icon.svg';
import redditSvg from '../assets/icons/reddit-icon.svg';
import pinterestSvg from '../assets/icons/pinterest.svg';
import tiktokSvg from '../assets/icons/tiktok-icon.svg';
import openaiSvg from '../assets/icons/openai-icon.svg';
import perplexitySvg from '../assets/icons/perplexity-icon.svg';

const iconClass = 'w-4 h-4 flex-shrink-0';

function LogoImg({ src, alt }: { src: string; alt?: string }) {
  return <img src={src} alt={alt ?? ''} className={iconClass} width={16} height={16} loading="lazy" />;
}

export function FaviconImg({ domain, className }: { domain: string; className?: string }) {
  const clean = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${clean}&sz=32`}
      alt=""
      className={className ?? iconClass}
      width={16}
      height={16}
      loading="lazy"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

export function getBrowserIcon(browser: string): React.ReactNode {
  const b = browser.toLowerCase();
  if (b.includes('chrome') && !b.includes('edge')) return <LogoImg src={chromeSvg} alt="Chrome" />;
  if (b.includes('firefox')) return <LogoImg src={firefoxSvg} alt="Firefox" />;
  if (b.includes('safari') && !b.includes('chrome')) return <LogoImg src={safariSvg} alt="Safari" />;
  if (b.includes('edge')) return <LogoImg src={edgeSvg} alt="Edge" />;
  if (b.includes('opera')) return <LogoImg src={operaSvg} alt="Opera" />;
  if (b.includes('brave')) return <LogoImg src={braveSvg} alt="Brave" />;
  if (b.includes('vivaldi')) return <LogoImg src={vivaldiSvg} alt="Vivaldi" />;
  if (b.includes('samsung')) return <LogoImg src={samsungSvg} alt="Samsung Internet" />;
  if (b === 'gsa' || b.includes('google search')) return <LogoImg src={googleSvg} alt="Google Search App" />;
  // Fallback globe
  return (
    <svg className={`${iconClass} text-zinc-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a14.25 14.25 0 014 9 14.25 14.25 0 01-4 9 14.25 14.25 0 01-4-9 14.25 14.25 0 014-9z" />
    </svg>
  );
}

export function getOSIcon(os: string): React.ReactNode {
  const o = os.toLowerCase();
  if (o.includes('windows')) return <LogoImg src={windowsSvg} alt="Windows" />;
  if (o.includes('mac') || o.includes('ios')) return <LogoImg src={appleSvg} alt="Apple" />;
  if (o.includes('linux')) return <LogoImg src={linuxSvg} alt="Linux" />;
  if (o.includes('android')) return <LogoImg src={androidSvg} alt="Android" />;
  // Fallback desktop
  return (
    <svg className={`${iconClass} text-zinc-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

export function getDeviceIcon(type: string): React.ReactNode {
  const t = type.toLowerCase();
  if (t.includes('mobile')) return (
    <svg className={`${iconClass} text-zinc-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
  if (t.includes('tablet')) return (
    <svg className={`${iconClass} text-zinc-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
  return (
    <svg className={`${iconClass} text-zinc-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

const referrerBrandMap: [string, string][] = [
  ['chatgpt', openaiSvg],
  ['openai', openaiSvg],
  ['perplexity', perplexitySvg],
  ['google', googleSvg],
  ['instagram', instagramSvg],
  ['twitter', xSvg],
  ['t.co', xSvg],
  ['x.com', xSvg],
  ['facebook', facebookSvg],
  ['fb.com', facebookSvg],
  ['linkedin', linkedinSvg],
  ['youtube', youtubeSvg],
  ['github', githubSvg],
  ['reddit', redditSvg],
  ['pinterest', pinterestSvg],
  ['tiktok', tiktokSvg],
];

export function getReferrerIcon(referrer: string): React.ReactNode {
  const r = referrer.toLowerCase();
  for (const [key, src] of referrerBrandMap) {
    if (r.includes(key)) return <LogoImg src={src} alt={key} />;
  }
  // Try favicon for domain-like referrers
  if (r.includes('.')) {
    return <FaviconImg domain={r} />;
  }
  // Fallback globe
  return (
    <svg className={`${iconClass} text-zinc-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a14.25 14.25 0 014 9 14.25 14.25 0 01-4 9 14.25 14.25 0 01-4-9 14.25 14.25 0 014-9z" />
    </svg>
  );
}

export function getUtmIcon(value: string): React.ReactNode {
  const v = value.toLowerCase();
  for (const [key, src] of referrerBrandMap) {
    if (v.includes(key)) return <LogoImg src={src} alt={key} />;
  }
  // Try favicon for domain-like values
  if (v.includes('.')) {
    return <FaviconImg domain={v} />;
  }
  // Fallback tag icon
  return (
    <svg className={`${iconClass} text-blue-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

export function getUtmMediumIcon(medium: string): React.ReactNode {
  const m = medium.toLowerCase();
  if (m === 'email' || m === 'e-mail') return (
    <svg className={`${iconClass} text-zinc-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
  if (m === 'organic' || m === 'search') return (
    <svg className={`${iconClass} text-zinc-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
  if (m === 'social') return (
    <svg className={`${iconClass} text-zinc-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
  if (m === 'cpc' || m === 'ppc' || m === 'paid') return (
    <svg className={`${iconClass} text-zinc-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  if (m === 'referral') return (
    <svg className={`${iconClass} text-zinc-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
  // Fallback tag
  return (
    <svg className={`${iconClass} text-purple-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

export function getChannelIcon(channel: string): React.ReactNode {
  switch (channel) {
    case 'Direct':
      return (
        <svg className={`${iconClass} text-zinc-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
      );
    case 'Organic Search':
      return (
        <svg className={`${iconClass} text-green-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    case 'Paid Search':
      return (
        <svg className={`${iconClass} text-amber-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'Organic Social':
      return (
        <svg className={`${iconClass} text-blue-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'Paid Social':
      return (
        <svg className={`${iconClass} text-purple-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
        </svg>
      );
    case 'Email':
      return (
        <svg className={`${iconClass} text-rose-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case 'Referral':
      return (
        <svg className={`${iconClass} text-indigo-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      );
    case 'Display':
      return (
        <svg className={`${iconClass} text-cyan-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case 'Affiliate':
      return (
        <svg className={`${iconClass} text-emerald-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      );
    default: // Other
      return (
        <svg className={`${iconClass} text-zinc-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
      );
  }
}

const browserLabels: Record<string, string> = {
  gsa: 'Google Search App',
};

export function getBrowserLabel(key: string): string {
  return browserLabels[key.toLowerCase()] ?? key;
}

export function countryToFlag(code: string): string {
  if (!code || code.length !== 2) return '';
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    ...Array.from(upper).map((c) => 0x1F1E6 + c.charCodeAt(0) - 65)
  );
}
