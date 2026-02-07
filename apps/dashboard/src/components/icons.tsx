import { FaChrome, FaFirefoxBrowser, FaSafari, FaEdge, FaOpera, FaInternetExplorer, FaGlobe } from 'react-icons/fa6';
import { FaWindows, FaApple, FaLinux, FaAndroid } from 'react-icons/fa6';
import { HiOutlineDesktopComputer, HiOutlineDeviceMobile, HiOutlineDeviceTablet } from 'react-icons/hi';

const iconClass = 'w-4 h-4 flex-shrink-0';

export function getBrowserIcon(browser: string): React.ReactNode {
  const b = browser.toLowerCase();
  if (b.includes('chrome') && !b.includes('edge')) return <FaChrome className={`${iconClass} text-yellow-500`} />;
  if (b.includes('firefox')) return <FaFirefoxBrowser className={`${iconClass} text-orange-500`} />;
  if (b.includes('safari') && !b.includes('chrome')) return <FaSafari className={`${iconClass} text-blue-500`} />;
  if (b.includes('edge')) return <FaEdge className={`${iconClass} text-blue-600`} />;
  if (b.includes('opera')) return <FaOpera className={`${iconClass} text-red-500`} />;
  if (b.includes('ie') || b.includes('internet explorer')) return <FaInternetExplorer className={`${iconClass} text-blue-400`} />;
  return <FaGlobe className={`${iconClass} text-zinc-400`} />;
}

export function getOSIcon(os: string): React.ReactNode {
  const o = os.toLowerCase();
  if (o.includes('windows')) return <FaWindows className={`${iconClass} text-blue-500`} />;
  if (o.includes('mac') || o.includes('ios')) return <FaApple className={`${iconClass} text-zinc-700`} />;
  if (o.includes('linux')) return <FaLinux className={`${iconClass} text-amber-600`} />;
  if (o.includes('android')) return <FaAndroid className={`${iconClass} text-green-500`} />;
  return <HiOutlineDesktopComputer className={`${iconClass} text-zinc-400`} />;
}

export function getDeviceIcon(type: string): React.ReactNode {
  const t = type.toLowerCase();
  if (t.includes('mobile')) return <HiOutlineDeviceMobile className={`${iconClass} text-zinc-500`} />;
  if (t.includes('tablet')) return <HiOutlineDeviceTablet className={`${iconClass} text-zinc-500`} />;
  return <HiOutlineDesktopComputer className={`${iconClass} text-zinc-500`} />;
}
