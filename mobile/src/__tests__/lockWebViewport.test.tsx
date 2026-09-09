/**
 * @jest-environment jsdom
 */
import { Platform } from 'react-native';
import { lockWebViewport } from '../web/lockWebViewport';

const setPlatform = (os: string) => {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
};

describe('lockWebViewport', () => {
  const realOS = Platform.OS;
  afterEach(() => setPlatform(realOS));

  it('pins the viewport meta and takes the body out of flow on web', () => {
    setPlatform('web');
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">';

    lockWebViewport();

    const content = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';
    expect(content).toContain('user-scalable=no');
    expect(content).toContain('maximum-scale=1');
    expect(document.body.style.position).toBe('fixed');
    expect(document.documentElement.style.overflow).toBe('hidden');
  });

  it('creates a viewport meta when the page has none', () => {
    setPlatform('web');
    document.head.innerHTML = '';

    lockWebViewport();

    expect(document.querySelector('meta[name="viewport"]')).not.toBeNull();
  });

  it('is a no-op on native', () => {
    setPlatform('ios');
    document.head.innerHTML = '';
    document.body.style.position = '';

    lockWebViewport();

    expect(document.querySelector('meta[name="viewport"]')).toBeNull();
    expect(document.body.style.position).toBe('');
  });
});
