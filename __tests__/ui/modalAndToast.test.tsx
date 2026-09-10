/**
 * Regression tests for two dataflow bugs found in the P1.E3 review:
 *
 *  1. Portal/Modal never wired `onRequestClose`, so the Android hardware
 *     back button could not dismiss a modal (spec 05 §3.6). The composed
 *     `<Modal>` must now forward `onClose` into the RN Modal's
 *     `onRequestClose`.
 *
 *  2. `<ToastHost />` was never mounted, so every `toast()` call emitted
 *     into a listener set with zero subscribers and messages silently
 *     vanished. These tests pin the ToastHost render contract that the
 *     app-level `<Providers>` relies on.
 */

import React from 'react';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';

import { Modal } from '@/ui/primitives/Modal';
import { Portal } from '@/ui/primitives/Portal';
import { ToastHost, toast, clearToasts } from '@/ui/composed/Toast';

/** Find every node in the tree carrying a given prop. */
function findNodesWithProp(node: ReactTestInstance, prop: string): ReactTestInstance[] {
  const found: ReactTestInstance[] = [];
  if (node.props && prop in node.props) {
    found.push(node);
  }
  for (const child of node.children) {
    if (typeof child === 'object') {
      found.push(...findNodesWithProp(child as ReactTestInstance, prop));
    }
  }
  return found;
}

describe('Modal / Portal Android back-button wiring', () => {
  it('Portal forwards onRequestClose to the RN Modal', () => {
    const spy = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <Portal visible onRequestClose={spy}>
          <React.Fragment />
        </Portal>,
      );
    });

    const nodes = findNodesWithProp(tree.root, 'onRequestClose');
    expect(nodes.length).toBeGreaterThan(0);
    ReactTestRenderer.act(() => {
      (nodes[0]!.props.onRequestClose as () => void)();
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('Modal wires onClose as the back-button handler (spec 05 §3.6)', () => {
    const onClose = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <Modal visible onClose={onClose}>
          <React.Fragment />
        </Modal>,
      );
    });

    const nodes = findNodesWithProp(tree.root, 'onRequestClose');
    expect(nodes.length).toBeGreaterThan(0);
    ReactTestRenderer.act(() => {
      (nodes[0]!.props.onRequestClose as () => void)();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Modal renders nothing when visible=false', () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <Modal visible={false} onClose={() => undefined}>
          <React.Fragment />
        </Modal>,
      );
    });
    // Portal returns null when hidden — the rendered output must be empty.
    expect(tree.toJSON()).toBeNull();
  });
});

describe('ToastHost renders the global toast queue', () => {
  afterEach(() => {
    clearToasts();
  });

  it('a toast() emitted BEFORE mount appears once ToastHost mounts', () => {
    ReactTestRenderer.act(() => {
      toast('Item acquired!', { variant: 'success' });
    });

    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<ToastHost />);
    });

    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Item acquired!');
  });

  it('a toast() emitted AFTER mount appears and dismisses on tap', () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<ToastHost />);
    });

    ReactTestRenderer.act(() => {
      toast('Level up!');
    });
    expect(JSON.stringify(tree.toJSON())).toContain('Level up!');

    const pressables = findNodesWithProp(tree.root, 'onPress');
    expect(pressables.length).toBeGreaterThan(0);
    ReactTestRenderer.act(() => {
      (pressables[0]!.props.onPress as () => void)();
    });
    expect(JSON.stringify(tree.toJSON())).not.toContain('Level up!');
  });
});
