import { ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { WorkoutScreen } from '../screens/WorkoutScreen';

/**
 * Inside a ScrollView a column has no height of its own, so a child told to
 * grow (`flex: 1`) along it has nothing to grow into, and shrinks to nothing:
 * a card squashed to a sliver, its text spilling out. `flex: 1` is only safe
 * along a row (or in a column given a height). This walks a scroll view's
 * content and names every child that breaks that, so the layout bug fails a
 * test instead of reaching a phone.
 */
const collapsingChildren = (tree: renderer.ReactTestRenderer): string[] => {
  const problems: string[] = [];
  const walk = (node: ReactTestInstance, parentStyle: ViewStyle | null) => {
    const own = typeof node.type === 'string' ? ((StyleSheet.flatten(node.props.style) ?? {}) as ViewStyle) : null;
    if (own && parentStyle) {
      const grows = (typeof own.flex === 'number' && own.flex > 0) || (own.flexGrow ?? 0) > 0;
      const column = (parentStyle.flexDirection ?? 'column') === 'column';
      const sized = parentStyle.height !== undefined || parentStyle.minHeight !== undefined;
      const selfSized = own.height !== undefined || own.minHeight !== undefined;
      if (grows && column && !sized && !selfSized) problems.push(node.props.testID ?? node.props.accessibilityLabel ?? String(node.type));
    }
    for (const child of node.children) if (typeof child !== 'string') walk(child, own ?? parentStyle);
  };
  for (const scroll of tree.root.findAllByType(ScrollView)) {
    for (const child of scroll.children) if (typeof child !== 'string') walk(child, { flexDirection: 'column' });
  }
  return problems;
};

const routine = (id: string) => ({ id, name: id, exercises: [], updatedAt: '2026-11-01T00:00:00Z' });
const templates = [routine('Chest'), routine('Back')];

describe('no row collapses inside a scroll view', () => {
  it('the workout screen, with routines and a rotation, and in Edit', () => {
    const startedOn = new Date().toISOString().slice(0, 10);
    for (const schedule of [null, { days: [{ kind: 'routine' as const, templateId: 'Chest' }, { kind: 'rest' as const, id: 'r' }], startedOn }]) {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <WorkoutScreen
            weightUnit="lb"
            templates={templates}
            onSaveTemplate={() => {}}
            onDeleteTemplate={() => {}}
            schedule={schedule}
            onSaveSchedule={() => {}}
            onFinish={async () => {}}
            onClose={() => {}}
          />,
        );
      });
      expect(collapsingChildren(tree)).toEqual([]);
      // Edit: the up, down and delete controls beside each day.
      const edit = tree.root.findAll((node) => node.props.label === 'Edit' && typeof node.props.onPress === 'function')[0]!;
      act(() => edit.props.onPress());
      expect(collapsingChildren(tree)).toEqual([]);
      tree.unmount();
    }
  });
});
