/**
 * @file types.ts
 * @description Core type definitions for the Playwright Locator Contract system.
 *
 * This module defines the data structures that represent a "locator contract":
 * a structured, layered strategy for finding a UI element that survives UI evolution
 * and encodes intent rather than just implementation details.
 */

import type { Page, Locator, FrameLocator } from '@playwright/test';

// ---------------------------------------------------------------------------
// Root context
// ---------------------------------------------------------------------------

/**
 * A root context for locator resolution — either the full page, a scoped
 * Locator (e.g. inside a dialog), or a FrameLocator (inside an iframe).
 */
export type Root = Page | Locator | FrameLocator;

// ---------------------------------------------------------------------------
// Scope definitions
// ---------------------------------------------------------------------------

/**
 * A scope definition narrows the search context before strategies are applied.
 * Scopes are applied in order, with each scope building on the previous result.
 *
 * @example
 * // Scope to a dialog by role
 * { kind: 'role', role: 'dialog', name: 'Order Confirmation' }
 *
 * @example
 * // Scope to an element with a test ID
 * { kind: 'testId', value: 'order-confirmation-modal' }
 */
export type ScopeDef =
  | {
      /** Scope by ARIA role, optionally filtered by accessible name */
      kind: 'role';
      role: string;
      name?: string | RegExp;
    }
  | {
      /** Scope by data-testid attribute */
      kind: 'testId';
      value: string;
    }
  | {
      /** Scope by CSS selector (use sparingly — implementation detail) */
      kind: 'css';
      value: string;
    };

// ---------------------------------------------------------------------------
// Strategy definitions (ordered by confidence level)
// ---------------------------------------------------------------------------

/**
 * Level 1 — Role-based semantics (highest confidence).
 * Uses ARIA role with an accessible name, which directly reflects what the
 * user sees and interacts with.
 */
export type Level1Strategy =
  | {
      level: 1;
      /** Locate by ARIA role and accessible name */
      kind: 'role';
      role: string;
      name: string | RegExp;
    }
  | {
      level: 1;
      /** Locate by data-testid — treated as a parallel primary channel */
      kind: 'testId';
      value: string;
    };

/**
 * Level 2 — Explicit control semantics.
 * Maps to labeled form fields, images, and title attributes.
 * Still very user-facing, but more specific to element type.
 */
export type Level2Strategy =
  | { level: 2; kind: 'label'; value: string | RegExp }
  | { level: 2; kind: 'placeholder'; value: string | RegExp }
  | { level: 2; kind: 'title'; value: string | RegExp }
  | { level: 2; kind: 'alt'; value: string | RegExp };

/**
 * Level 3 — Visible text.
 * Useful for non-interactive content, banners, and static labels.
 * Weaker than role/label because it lacks type information.
 */
export type Level3Strategy = {
  level: 3;
  kind: 'text';
  value: string | RegExp;
  /** Whether to require an exact full-string match (default: false) */
  exact?: boolean;
};

/**
 * Level 4 — Scoped and relative locators.
 *
 * Two kinds are supported:
 *
 * **`scopedRole`** — locate a container by role + accessible name, then find a
 * target role inside it. Works well when the container element has an explicit
 * accessible name (e.g. a dialog, region, or group with `aria-label`).
 *
 * **`filterHasText`** — locate all containers by role, filter to the one that
 * *contains* a specific text, then find a target role inside it. This is the
 * pattern the original article describes for list rows:
 * ```ts
 * page.getByRole('listitem').filter({ hasText: 'MU5137' })
 *     .getByRole('button', { name: 'Book' })
 * ```
 * Prefer `filterHasText` when containers (e.g. list items) don't carry an
 * explicit accessible name but do contain distinguishing visible text.
 */
export type Level4Strategy =
  | {
      level: 4;
      kind: 'scopedRole';
      /** The ARIA role of the container element */
      containerRole: string;
      /** Accessible name of the container (via aria-label / aria-labelledby) */
      containerName?: string | RegExp;
      /** The ARIA role of the target element inside the container */
      targetRole: string;
      /** The accessible name of the target element */
      targetName: string | RegExp;
    }
  | {
      level: 4;
      /**
       * Mirrors the article's recommended pattern:
       * `getByRole(containerRole).filter({ hasText }).getByRole(targetRole, { name })`
       *
       * This is the idiomatic Playwright way to pick one row out of a list when
       * the row element itself has no accessible name but contains unique text.
       */
      kind: 'filterHasText';
      /** The ARIA role shared by all sibling containers (e.g. 'listitem', 'row') */
      containerRole: string;
      /** Text that uniquely identifies the desired container among its siblings */
      hasText: string | RegExp;
      /** The ARIA role of the target element inside the matched container */
      targetRole: string;
      /** The accessible name of the target element */
      targetName: string | RegExp;
    };

/**
 * Level 5 — Implementation-detail fallback (lowest confidence).
 * CSS selectors and XPath should only be used when no semantic strategy works.
 * These are brittle and should be treated as explicit last resort.
 */
export type Level5Strategy =
  | {
      level: 5;
      /** CSS selector */
      kind: 'css';
      value: string;
    }
  | {
      level: 5;
      /** XPath expression */
      kind: 'xpath';
      value: string;
    };

/**
 * Union of all strategy levels.
 */
export type StrategyDef =
  | Level1Strategy
  | Level2Strategy
  | Level3Strategy
  | Level4Strategy
  | Level5Strategy;

// ---------------------------------------------------------------------------
// Locator Contract
// ---------------------------------------------------------------------------

/**
 * A LocatorContract is a structured description of how to find a UI element.
 *
 * Instead of storing a single selector string, a contract stores:
 * - **name**: a business-readable label for the element
 * - **frame**: (optional) CSS selector for an iframe that contains the element
 * - **scope**: (optional) ordered list of scope narrowing steps applied before strategies
 * - **strategies**: ordered list of locating strategies, tried from level 1 to level 5
 *
 * The resolver tries strategies in ascending level order and returns the first
 * strategy that produces exactly one visible match.
 *
 * @example
 * const submitButton: LocatorContract = {
 *   name: 'Submit Order button',
 *   scope: [{ kind: 'role', role: 'dialog', name: 'Order Confirmation' }],
 *   strategies: [
 *     { level: 1, kind: 'role', role: 'button', name: 'Submit Order' },
 *     { level: 1, kind: 'testId', value: 'submit-order' },
 *     { level: 5, kind: 'css', value: '.dialog-footer .primary-btn' },
 *   ],
 * };
 */
export interface LocatorContract {
  /** Human-readable business name for the element (used in error messages) */
  name: string;

  /**
   * CSS selector for an iframe to switch into before resolving.
   * The selector is used to find the iframe element, then `.contentFrame()` is called.
   * Leave undefined if the element is on the main page.
   */
  frame?: string;

  /**
   * Optional ordered list of scope narrowing steps.
   * Each scope is applied in sequence, narrowing the root context.
   * This is evaluated before any strategy is attempted.
   */
  scope?: ScopeDef[];

  /**
   * Ordered list of locating strategies.
   * Strategies are tried in ascending `level` order.
   * The first strategy that matches exactly one visible element wins.
   * Must contain at least one strategy.
   */
  strategies: [StrategyDef, ...StrategyDef[]];
}

// ---------------------------------------------------------------------------
// Resolution options
// ---------------------------------------------------------------------------

/**
 * Options passed to `resolveLocator`.
 */
export interface ResolveOptions {
  /**
   * Timeout in milliseconds for each individual visibility check.
   * Defaults to the Playwright default timeout.
   */
  timeout?: number;

  /**
   * If true, the resolver logs each attempted strategy to the console.
   * Useful for debugging flaky tests.
   * @default false
   */
  verbose?: boolean;
}

// ---------------------------------------------------------------------------
// Resolution result
// ---------------------------------------------------------------------------

/**
 * The result returned by `resolveLocator`.
 */
export interface ResolveResult {
  /** The resolved Playwright Locator */
  locator: Locator;

  /**
   * The strategy that was used to resolve the locator.
   * Useful for debugging and test reporting.
   */
  matchedStrategy: StrategyDef;

  /**
   * The confidence level of the matched strategy (1–5).
   * Lower is better (level 1 = most user-facing).
   */
  level: 1 | 2 | 3 | 4 | 5;
}
