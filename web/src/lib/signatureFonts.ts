import { Caveat, Dancing_Script, Great_Vibes } from 'next/font/google';

// Self-hosted at build time by next/font (no runtime request to Google).
const dancing = Dancing_Script({ subsets: ['latin'], weight: '400' });
const vibes = Great_Vibes({ subsets: ['latin'], weight: '400' });
const caveat = Caveat({ subsets: ['latin'], weight: '400' });

export const SIGNATURE_FONTS = [
  { name: 'Dancing Script', family: dancing.style.fontFamily },
  { name: 'Great Vibes', family: vibes.style.fontFamily },
  { name: 'Caveat', family: caveat.style.fontFamily },
];
