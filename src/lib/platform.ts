// Key names as the keyboard in front of the user prints them (section 1.2): macOS calls Alt "option" (⌥).

/** Whether a browser's platform string is Apple's (macOS, iPadOS, iOS). */
export const isApple = (platform: string) => /mac|iphone|ipad|ipod/i.test(platform);

/** The Alt key's name on this platform. On macOS, Option sets the same altKey flag, so Alt+click is Option+click there. */
export const altName = (platform: string) => (isApple(platform) ? 'option' : 'alt');

/** The browser's platform string, wherever the browser keeps it. */
export const browserPlatform = () =>
  typeof navigator === 'undefined' ? '' : ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || '');

/** The modifier that adds (to a selection, a plot): ⌘ on Apple's systems, Ctrl elsewhere. */
export const modName = (platform: string = browserPlatform()) => (isApple(platform) ? '⌘' : 'Ctrl');
