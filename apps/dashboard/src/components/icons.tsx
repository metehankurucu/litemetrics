import { SiGooglechrome, SiFirefox, SiSafari, SiOpera, SiApple, SiLinux, SiAndroid } from 'react-icons/si';
import { SiGoogle, SiInstagram, SiX, SiFacebook, SiLinkedin, SiYoutube, SiGithub, SiReddit, SiPinterest, SiTiktok } from 'react-icons/si';
import { FaEdge, FaInternetExplorer, FaGlobe, FaWindows } from 'react-icons/fa6';
import { HiOutlineDesktopComputer, HiOutlineDeviceMobile, HiOutlineDeviceTablet } from 'react-icons/hi';

const iconClass = 'w-4 h-4 flex-shrink-0';

export function getBrowserIcon(browser: string): React.ReactNode {
  const b = browser.toLowerCase();
  if (b.includes('chrome') && !b.includes('edge')) return <SiGooglechrome className={`${iconClass} text-[#4285F4]`} />;
  if (b.includes('firefox')) return <SiFirefox className={`${iconClass} text-[#FF7139]`} />;
  if (b.includes('safari') && !b.includes('chrome')) return <SiSafari className={`${iconClass} text-[#006CFF]`} />;
  if (b.includes('edge')) return <FaEdge className={`${iconClass} text-[#0078D7]`} />;
  if (b.includes('opera')) return <SiOpera className={`${iconClass} text-[#FF1B2D]`} />;
  if (b.includes('ie') || b.includes('internet explorer')) return <FaInternetExplorer className={`${iconClass} text-blue-400`} />;
  return <FaGlobe className={`${iconClass} text-zinc-400`} />;
}

export function getOSIcon(os: string): React.ReactNode {
  const o = os.toLowerCase();
  if (o.includes('windows')) return <FaWindows className={`${iconClass} text-[#0078D4]`} />;
  if (o.includes('mac') || o.includes('ios')) return <SiApple className={`${iconClass} text-zinc-700`} />;
  if (o.includes('linux')) return <SiLinux className={`${iconClass} text-[#FCC624]`} />;
  if (o.includes('android')) return <SiAndroid className={`${iconClass} text-[#34A853]`} />;
  return <HiOutlineDesktopComputer className={`${iconClass} text-zinc-400`} />;
}

export function getDeviceIcon(type: string): React.ReactNode {
  const t = type.toLowerCase();
  if (t.includes('mobile')) return <HiOutlineDeviceMobile className={`${iconClass} text-zinc-500`} />;
  if (t.includes('tablet')) return <HiOutlineDeviceTablet className={`${iconClass} text-zinc-500`} />;
  return <HiOutlineDesktopComputer className={`${iconClass} text-zinc-500`} />;
}

export function getReferrerIcon(referrer: string): React.ReactNode {
  const r = referrer.toLowerCase();
  if (r.includes('google')) return <SiGoogle className={`${iconClass} text-[#4285F4]`} />;
  if (r.includes('instagram')) return <SiInstagram className={`${iconClass} text-[#E4405F]`} />;
  if (r.includes('twitter') || r.includes('t.co') || r.includes('x.com')) return <SiX className={`${iconClass} text-zinc-800`} />;
  if (r.includes('facebook') || r.includes('fb.com')) return <SiFacebook className={`${iconClass} text-[#1877F2]`} />;
  if (r.includes('linkedin')) return <SiLinkedin className={`${iconClass} text-[#0A66C2]`} />;
  if (r.includes('youtube')) return <SiYoutube className={`${iconClass} text-[#FF0000]`} />;
  if (r.includes('github')) return <SiGithub className={`${iconClass} text-zinc-800`} />;
  if (r.includes('reddit')) return <SiReddit className={`${iconClass} text-[#FF4500]`} />;
  if (r.includes('pinterest')) return <SiPinterest className={`${iconClass} text-[#BD081C]`} />;
  if (r.includes('tiktok')) return <SiTiktok className={`${iconClass} text-zinc-800`} />;
  return <FaGlobe className={`${iconClass} text-zinc-400`} />;
}

export function countryToFlag(code: string): string {
  if (!code || code.length !== 2) return '';
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    ...Array.from(upper).map((c) => 0x1F1E6 + c.charCodeAt(0) - 65)
  );
}
