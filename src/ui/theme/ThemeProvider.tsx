/**
 * Theme provider + `useTheme()` hook.
 *
 * Spec reference: 05 §2 (Design tokens), task P1.E3.T2.
 *
 * The provider exposes the full token set (`tokens` from `./tokens`) via
 * React context so any descendant component can call `useTheme()` and
 * receive typed access to colors / spacing / typography / sizing / etc.
 *
 * At MVP, the game ships with a single dark theme. The `theme` prop
 * accepts `'dark' | 'light'` for forward-compat — `'light'` reuses the
 * same token set (no separate light palette exists yet). When a future
 * phase adds a light palette, this provider will switch on the prop.
 */

import React, { createContext, useContext, useMemo } from 'react';

import { tokens, type ThemeTokens } from './tokens';

/**
 * Theme name. Task P1.E3.T2 specifies `'dark' | 'light'` with `'dark'` as
 * the default (the game is dark-themed at MVP).
 */
export type ThemeName = 'dark' | 'light';

/**
 * Shape exposed by `useTheme()`. Currently this is just the token set; in
 * a future phase it can also expose `themeName` and helpers for switching
 * themes at runtime.
 */
export interface ThemeContextValue {
  /** The active theme name. */
  readonly theme: ThemeName;
  /** The full token set (colors, spacing, typography, …). */
  readonly tokens: ThemeTokens;
}

/** Default theme context (used when no provider is mounted). */
const defaultContextValue: ThemeContextValue = {
  theme: 'dark',
  tokens,
};

const ThemeContext = createContext<ThemeContextValue>(defaultContextValue);

/** Props accepted by the {@link ThemeProvider}. */
export interface ThemeProviderProps {
  /** Active theme. Default: `'dark'` (spec 05, task P1.E3.T2). */
  theme?: ThemeName;
  /** Children to render with the theme context in scope. */
  children: React.ReactNode;
}

/**
 * Mount the theme context provider. Wrap the app root (or per-screen)
 * with this so descendant components can call {@link useTheme}.
 *
 * ```tsx
 * <ThemeProvider theme="dark">
 *   <App />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({
  theme = 'dark',
  children,
}: ThemeProviderProps): React.JSX.Element {
  // `useMemo` is technically redundant here because the value is constant
  // for a given `theme` prop, but it keeps the API stable if we add a
  // runtime-switchable palette later.
  const value = useMemo<ThemeContextValue>(() => {
    return { theme, tokens };
  }, [theme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Access the current theme context. Returns `{ theme, tokens }`.
 *
 * Throws if called outside a `<ThemeProvider>` — but we fall back to the
 * default dark theme context value, so a bare `<View>` from this library
 * still renders correctly without an explicit provider.
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
