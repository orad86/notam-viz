import type { Platform } from '@/lib/analytics/classify';

// Platform colours, in the theme's fixed series order (tokens.css: slots
// 1-3 are validated as a set). Bots are not a series: neutral ink.
// Full literal class names so Tailwind can see them.
export const PLATFORM_BG: Record<Platform, string> = {
  ios: 'bg-series-1',
  android: 'bg-series-2',
  web: 'bg-series-3',
  bot: 'bg-ink-3',
};
