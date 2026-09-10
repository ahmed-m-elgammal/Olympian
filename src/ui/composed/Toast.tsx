/**
 * `<Toast>` composed component with imperative `toast(message, duration)` API.
 *
 * Spec reference: 05 §4.5 (Toast), task P1.E3.T10.
 *
 * Usage:
 *   1. Mount `<ToastHost />` once near the app root (e.g., inside
 *      `<Providers>` or at the top of `RootNavigator`).
 *   2. From anywhere in the codebase, call:
 *        ```ts
 *        import { toast } from '@/ui/composed/Toast';
 *        toast('Item acquired!');
 *        ```
 *
 * Toasts queue — each call enqueues a message and auto-dismisses after
 * `duration` ms (default 2000). Tapping a toast dismisses it immediately.
 *
 * The toast manager is a tiny module-level singleton so it can be invoked
 * from any non-component code (ECS systems, save manager, etc.).
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  colors,
  sizing,
  spacing,
  zIndex,
  type ColorKey,
} from '@/ui/theme';
import { Text } from '@/ui/primitives/Text';

/** Toast visual variant. */
export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

/** A single toast in the queue. */
export interface ToastEntry {
  /** Auto-generated unique id (incrementing counter). */
  readonly id: number;
  /** Message text (already translated by the caller). */
  readonly message: string;
  /** Visual variant. Default `'info'`. */
  readonly variant: ToastVariant;
  /** Auto-dismiss after this many ms. Default 2000. */
  readonly duration: number;
}

/** Map a toast variant to its background color token. */
function variantColor(variant: ToastVariant): ColorKey {
  switch (variant) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'danger':
      return 'danger';
    case 'info':
    default:
      return 'secondary';
  }
}

/** Default auto-dismiss duration in ms (spec 05 §4.5: 2000ms default). */
const DEFAULT_DURATION_MS = 2000;

// ---------------------------------------------------------------------------
// Singleton toast manager (no React context — works from anywhere)
// ---------------------------------------------------------------------------

/** Listener type — the mounted ToastHost subscribes with one of these. */
type ToastListener = (toasts: readonly ToastEntry[]) => void;

let nextId = 1;
const queue: ToastEntry[] = [];
const listeners = new Set<ToastListener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit(): void {
  const snapshot = [...queue];
  listeners.forEach((cb) => cb(snapshot));
}

function dismiss(id: number): void {
  const index = queue.findIndex((t) => t.id === id);
  if (index >= 0) {
    queue.splice(index, 1);
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    emit();
  }
}

/**
 * Push a toast onto the queue. Returns the assigned toast id (so callers
 * can dismiss it explicitly if needed).
 *
 * @param message The (already translated) message to show.
 * @param options.duration Auto-dismiss after this many ms. Default 2000.
 * @param options.variant Visual variant. Default `'info'`.
 */
export function toast(
  message: string,
  options?: { duration?: number; variant?: ToastVariant },
): number {
  const id = nextId++;
  const entry: ToastEntry = {
    id,
    message,
    variant: options?.variant ?? 'info',
    duration: options?.duration ?? DEFAULT_DURATION_MS,
  };
  queue.push(entry);
  emit();

  const timeout = setTimeout(() => {
    dismiss(id);
  }, entry.duration);
  timers.set(id, timeout);

  return id;
}

/** Dismiss a toast by id (cancels the auto-dismiss timer). */
export function dismissToast(id: number): void {
  dismiss(id);
}

/** Subscribe to the toast queue. Returns an unsubscribe function. */
export function subscribeToToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  // Immediately emit the current queue so the new subscriber renders
  // any existing toasts.
  listener([...queue]);
  return () => {
    listeners.delete(listener);
  };
}

/** Clear all queued toasts (used in tests + on app shutdown). */
export function clearToasts(): void {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  queue.length = 0;
  emit();
}

// ---------------------------------------------------------------------------
// ToastHost component — mounts at the app root, renders the current queue
// ---------------------------------------------------------------------------

/** Props accepted by {@link ToastHost}. */
export interface ToastHostProps {
  /** Test ID for the container. */
  testID?: string;
}

/**
 * Mount once near the app root. Listens to the global toast queue and
 * renders any active toasts stacked at the bottom of the screen.
 */
export function ToastHost({ testID }: ToastHostProps = {}): React.JSX.Element {
  const [toasts, setToasts] = React.useState<readonly ToastEntry[]>([]);

  React.useEffect(() => {
    return subscribeToToasts((next) => {
      setToasts(next);
    });
  }, []);

  if (toasts.length === 0) {
    return <></>;
  }

  return (
    <View
      testID={testID}
      pointerEvents="box-none"
      style={styles.host}
    >
      {toasts.map((t) => {
        const colorKey = variantColor(t.variant);
        return (
          <Pressable
            key={t.id}
            testID={`toast-${t.id}`}
            onPress={() => dismiss(t.id)}
            accessibilityRole="alert"
            accessibilityLabel={t.message}
            style={[
              styles.toast,
              { backgroundColor: colors[colorKey] },
            ]}
          >
            <Text
              variant="body"
              scale="md"
              color="textInverted"
              align="center"
            >
              {t.message}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: spacing.xl5,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: zIndex.toast,
  },
  toast: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: sizing.radiusMd,
    maxWidth: '90%',
    minWidth: 200,
    ...({
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    } as const),
  },
});
