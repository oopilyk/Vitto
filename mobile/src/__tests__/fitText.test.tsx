import fs from 'node:fs';
import path from 'node:path';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { FitText, fitScale } from '../components/FitText';

describe('fitScale', () => {
  it('leaves text that fits at full size', () => {
    expect(fitScale({ avail: 200, natural: 150 })).toEqual({ scale: 1, fits: true });
  });

  it('stays full size until both sides are measured', () => {
    expect(fitScale({ avail: 0, natural: 300 })).toEqual({ scale: 1, fits: true });
    expect(fitScale({ avail: 200, natural: 0 })).toEqual({ scale: 1, fits: true });
  });

  it('shrinks one line just enough to fit', () => {
    const { scale, fits } = fitScale({ avail: 200, natural: 245 });
    expect(fits).toBe(true);
    expect(scale).toBeCloseTo((200 * 0.98) / 245, 5);
  });

  it('never goes below the floor, and says when even that is not enough', () => {
    expect(fitScale({ avail: 100, natural: 1000, minScale: 0.7 })).toEqual({ scale: 0.7, fits: false });
  });

  it('over two lines, keeps the widest word on a line of its own', () => {
    // The whole text would fit over two lines, but one word is wider than a line.
    const { scale } = fitScale({ avail: 100, natural: 150, longest: 120, lines: 2 });
    expect(scale).toBeCloseTo(98 / 120, 5);
  });
});

describe('FitText', () => {
  const render = () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FitText style={{ fontSize: 20, lineHeight: 26 }}>Lose fat & build muscle</FitText>);
    });
    return tree;
  };
  const shown = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text)[0]!;
  const sizeOf = (node: renderer.ReactTestInstance) =>
    [node.props.style].flat(3).reduce((size: number, part: { fontSize?: number } | null) => part?.fontSize ?? size, 0);

  it('shows full size before anything is measured, never smaller', () => {
    expect(sizeOf(shown(render()))).toBe(20);
  });

  it('sizes from the measured width and the measured text, not the platform', () => {
    const tree = render();
    const container = tree.root.findAll((node) => typeof node.props.onLayout === 'function')[0]!;
    const ruler = tree.root.findAll((node) => typeof node.props.onTextLayout === 'function')[0]!;
    act(() => container.props.onLayout({ nativeEvent: { layout: { width: 200, height: 30 } } }));
    act(() => ruler.props.onTextLayout({ nativeEvent: { lines: [{ width: 245 }] } }));
    const size = sizeOf(shown(tree));
    expect(size).toBeGreaterThanOrEqual(20 * 0.7);
    expect(size).toBeLessThan(20);
    expect(shown(tree).props.adjustsFontSizeToFit).toBeUndefined();
  });
});

describe('no native auto-shrink anywhere', () => {
  // iOS's adjustsFontSizeToFit shrank labels with room to spare to 6pt, at
  // random. FitText replaces it; this keeps it from coming back.
  it('is not used in the app', () => {
    const roots = [path.join(__dirname, '..'), path.join(__dirname, '..', '..', 'App.tsx')];
    const offenders: string[] = [];
    const walk = (target: string) => {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(target)) if (entry !== '__tests__') walk(path.join(target, entry));
      } else if (/\.tsx?$/.test(target) && !target.endsWith('FitText.tsx')) {
        const source = fs.readFileSync(target, 'utf8');
        if (/adjustsFontSizeToFit\s*(=|\{|$|\s)/m.test(source.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ''))) offenders.push(target);
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});
