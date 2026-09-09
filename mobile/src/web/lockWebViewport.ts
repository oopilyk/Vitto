import { Platform } from 'react-native';

/**
 * Vitto is a mobile app that also runs through react-native-web (Expo's `--web`
 * target, used for quick review in a phone browser). Expo's generated web page
 * ships a viewport that still allows pinch- and double-tap-zoom, and mobile
 * Safari ignores `body { overflow: hidden }` unless the body is also taken out
 * of normal flow. Together those let the "app" pan and zoom like an ordinary
 * web page — which is not what a fixed-viewport app should do.
 *
 * This locks the web viewport to a single, non-zoomable, non-scrolling surface
 * so the React Native layout is the only thing that ever moves. It is a no-op
 * on native (there is no `document`), and safe to call more than once.
 */
export function lockWebViewport(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const VIEWPORT_CONTENT =
    'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover';

  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', VIEWPORT_CONTENT);

  const html = document.documentElement;
  html.style.overflow = 'hidden';
  html.style.overscrollBehavior = 'none';

  // `position: fixed` is what actually stops mobile Safari from scrolling the
  // body past a child that briefly overflows; `overflow: hidden` alone does not.
  Object.assign(document.body.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    overflow: 'hidden',
    overscrollBehavior: 'none',
  });
}
