/** External link for voluntary support. Opened in a new tab; nothing from the app is sent to it. */
export const SAWERIA_URL = 'https://saweria.co/alzhenjb';

/** Creator contact and profiles. WhatsApp number is written without the leading 0; +62 (Indonesia) is assumed for the wa.me link. */
export const CONTACTS = [
  { id: 'email', label: 'Email', handle: 'alrectofficial@gmail.com', href: 'mailto:alrectofficial@gmail.com', external: false },
  { id: 'github', label: 'GitHub', handle: 'alrxf-dev', href: 'https://github.com/alrxf-dev', external: true },
  { id: 'instagram', label: 'Instagram', handle: '@alrectdev8', href: 'https://www.instagram.com/alrectdev8', external: true },
  { id: 'tiktok', label: 'TikTok', handle: '@xploitalip', href: 'https://www.tiktok.com/@xploitalip', external: true },
  { id: 'whatsapp', label: 'WhatsApp', handle: '+62 821-9240-1340', href: 'https://wa.me/6282192401340', external: true },
] as const;
