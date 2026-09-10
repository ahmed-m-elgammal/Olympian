/**
 * App-level re-export of the real RootNavigator from `@/ui/navigation`.
 *
 * Spec reference: 02 §3 (src/app/RootNavigator.tsx), task P1.E3.T11.
 *
 * `src/app/App.tsx` imports `RootNavigator` from this file; this file just
 * re-exports the real navigator from `src/ui/navigation/RootNavigator.tsx`
 * so the app boot sequence is decoupled from the navigation implementation.
 *
 * The original Phase 0 placeholder (a single static `Olympian` text view)
 * has been replaced with this re-export.
 */

export { RootNavigator } from '@/ui/navigation/RootNavigator';
export type {
  RootStackParamList,
  RootStackScreenProps,
} from '@/ui/navigation/RootNavigator';
