import type { ComponentType } from 'react';
import { FaEnvelope, FaGithub, FaInstagram, FaTiktok, FaWhatsapp } from 'react-icons/fa6';
import { CONTACTS } from '../app/links';

const ICONS: Record<string, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = { email: FaEnvelope, github: FaGithub, instagram: FaInstagram, tiktok: FaTiktok, whatsapp: FaWhatsapp };

/** Doodle-notebook icon bar. Each icon is a real link; the tooltip repeats the name and handle for sighted users. */
export function SocialLinks() {
  return (
    <>
      <svg className="doodle-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <filter id="pencil-texture" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <ul className="doodle-container" aria-label="Contact and social links">
        {CONTACTS.map((c) => {
          const Icon = ICONS[c.id];
          return (
            <li className="doodle-icon-content" key={c.id}>
              <a className={`doodle-link link-${c.id}`} href={c.href} aria-label={`${c.label}: ${c.handle}`} {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {Icon ? <Icon size={26} aria-hidden /> : null}
              </a>
              <div className={`doodle-tooltip tooltip-${c.id}`} aria-hidden="true">{c.label}</div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
