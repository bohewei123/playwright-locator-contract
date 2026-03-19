/**
 * @file locator-contract.ts
 * @description Core resolver for the Playwright Locator Contract system.
 *
 * This module provides `resolveLocator` — the main entry point for resolving a
 * `LocatorContract` into a concrete Playwright `Locator`.
 *
 * The resolver:
 * 1. Optionally switches into an iframe context (`frame` field)
 * 2. Applies ordered scope narrowing steps (`scope` array)
 * 3. Tries each strategy from level 1 (highest confidence) to level 5 (fallback)
 * 4. Returns the first strategy that produces exactly one visible match
 *
 * @module locator-contract
 */

import { expect } from '@playwright/test';
import type { Page, Locator, FrameLocator } from '@playwright/test';
import type {
  Root,
  ScopeDef,
  StrategyDef,
  LocatorContract,
  ResolveOptions,
  ResolveResult,
} from './types';

// ---------------------------------------------------------------------------
// Internal: scope application
// ---------------------------------------------------------------------------

/**
 * Applies a single scope definition to a root context, returning the narrowed root.
 *
 * @param root - The current root (Page, Locator, or FrameLocator)
 * @param scope - The scope definition to apply
 * @returns A narrowed root context
 *
 * @internal
 */
function applyScope(root: Root, scope: ScopeDef): Root {
  switch (scope.kind) {
    case 'role':
      return (root as Page).getByRole(scope.role as Parameters<Page['getByRole']>[0], scope.name ? { name: scope.name } : {});
    case 'testId':
      return (root as Page).getByTestId(scope.value);
    case 'css':
      return (root as Page).locator(scope.value);
  }
}

// ---------------------------------------------------------------------------
// Internal: candidate locator building
// ---------------------------------------------------------------------------

/**
 * Builds a Playwright `Locator` from a single strategy definition, relative to
 * the given root context.
 *
 * @param root - The current root (Page, Locator, or FrameLocator)
 * @param strategy - The strategy definition to apply
 * @returns A Playwright Locator (not yet evaluated)
 *
 * @internal
 */
function buildCandidate(root: Root, strategy: StrategyDef): Locator {
  const r = root as Page; // Page, Locator, and FrameLocator share the same locator API shape

  switch (strategy.kind) {
    // -----------------------------------------------------------------------
    // Level 1: Role + accessible name
    // -----------------------------------------------------------------------
    case 'role':
      return r.getByRole(strategy.role as Parameters<Page['getByRole']>[0], { name: strategy.name });

    // -----------------------------------------------------------------------
    // Level 1 (parallel): Test ID
    // -----------------------------------------------------------------------
    case 'testId':
      return r.getByTestId(strategy.value);

    // -----------------------------------------------------------------------
    // Level 2: Explicit control semantics
    // -----------------------------------------------------------------------
    case 'label':
      return r.getByLabel(strategy.value);

    case 'placeholder':
      return r.getByPlaceholder(strategy.value);

    case 'title':
      return r.getByTitle(strategy.value);

    case 'alt':
      return r.getByAltText(strategy.value);

    // -----------------------------------------------------------------------
    // Level 3: Visible text
    // -----------------------------------------------------------------------
    case 'text':
      return r.getByText(strategy.value, { exact: strategy.exact ?? false });

    // -----------------------------------------------------------------------
    // Level 4: Scoped role (container → target), two sub-kinds
    // -----------------------------------------------------------------------
    case 'scopedRole': {
      const container = r.getByRole(
        strategy.containerRole as Parameters<Page['getByRole']>[0],
        strategy.containerName ? { name: strategy.containerName } : {}
      );
      return container.getByRole(
        strategy.targetRole as Parameters<Page['getByRole']>[0],
        { name: strategy.targetName }
      );
    }

    case 'filterHasText': {
      // This is the pattern described in the article for list rows:
      //   page.getByRole('listitem').filter({ hasText: 'MU5137' })
      //       .getByRole('button', { name: 'Book' })
      // The container is identified by visible text it *contains*, not by
      // an explicit accessible name — no aria-label required on the row.
      const container = r.getByRole(
        strategy.containerRole as Parameters<Page['getByRole']>[0]
      ).filter({ hasText: strategy.hasText });
      return container.getByRole(
        strategy.targetRole as Parameters<Page['getByRole']>[0],
        { name: strategy.targetName }
      );
    }

    // -----------------------------------------------------------------------
    // Level 5: Implementation-detail fallback
    // -----------------------------------------------------------------------
    case 'css':
      return r.locator(strategy.value);

    case 'xpath':
      return r.locator(`xpath=${strategy.value}`);
  }
}

// ---------------------------------------------------------------------------
// Public API: resolveLocator
// ---------------------------------------------------------------------------

/**
 * Resolves a `LocatorContract` into a concrete Playwright `Locator`.
 *
 * The resolver applies the following steps in order:
 * 1. If `contract.frame` is set, switches the root into that iframe.
 * 2. Applies each scope in `contract.scope` to narrow the root context.
 * 3. Sorts strategies by ascending level (1 = highest confidence).
 * 4. For each strategy, counts matching elements.
 *    - If exactly one element matches and is visible → returns it.
 *    - Otherwise continues to the next strategy.
 * 5. If no strategy produces a unique visible match, throws an error.
 *
 * @param page - The Playwright `Page` to resolve against
 * @param contract - The locator contract describing how to find the element
 * @param options - Optional configuration (timeout, verbosity)
 * @returns A `ResolveResult` containing the locator and the matched strategy
 *
 * @throws {Error} If no strategy produces a unique visible match
 *
 * @example
 * const { locator } = await resolveLocator(page, submitOrderButtonContract);
 * await locator.click();
 *
 * @example
 * // With verbose logging for debugging
 * const result = await resolveLocator(page, submitOrderButtonContract, { verbose: true });
 * console.log(`Resolved via level ${result.level} strategy`);
 * await result.locator.click();
 */
export async function resolveLocator(
  page: Page,
  contract: LocatorContract,
  options: ResolveOptions = {}
): Promise<ResolveResult> {
  const { verbose = false, timeout } = options;

  // Step 1: start from the page root or switch into an iframe
  let root: Root = page;

  if (contract.frame) {
    if (verbose) {
      console.log(`[LocatorContract] "${contract.name}": switching into frame "${contract.frame}"`);
    }
    root = page.locator(contract.frame).contentFrame();
  }

  // Step 2: apply scope narrowing steps in order
  for (const scope of contract.scope ?? []) {
    if (verbose) {
      console.log(`[LocatorContract] "${contract.name}": applying scope`, scope);
    }
    root = applyScope(root, scope);
  }

  // Step 3: sort strategies by level (ascending), then try each one
  const ordered = [...contract.strategies].sort((a, b) => a.level - b.level);

  for (const strategy of ordered) {
    if (verbose) {
      console.log(`[LocatorContract] "${contract.name}": trying strategy`, strategy);
    }

    const candidate = buildCandidate(root, strategy);

    let count: number;
    try {
      count = await candidate.count();
    } catch {
      // count() should not throw, but guard against unexpected errors during evaluation
      if (verbose) {
        console.warn(`[LocatorContract] "${contract.name}": count() failed for strategy`, strategy);
      }
      continue;
    }

    if (count === 0) {
      if (verbose) {
        console.log(`[LocatorContract] "${contract.name}": no match at level ${strategy.level} (${strategy.kind})`);
      }
      continue;
    }

    if (count > 1) {
      if (verbose) {
        console.warn(
          `[LocatorContract] "${contract.name}": ${count} matches at level ${strategy.level} (${strategy.kind}) — ambiguous, skipping`
        );
      }
      continue;
    }

    // Exactly one match — verify it is visible
    try {
      await expect(candidate).toBeVisible({ timeout });
    } catch {
      if (verbose) {
        console.warn(
          `[LocatorContract] "${contract.name}": element found at level ${strategy.level} but not visible, skipping`
        );
      }
      continue;
    }

    if (verbose) {
      console.log(
        `[LocatorContract] "${contract.name}": resolved via level ${strategy.level} strategy (${strategy.kind})`
      );
    }

    return {
      locator: candidate,
      matchedStrategy: strategy,
      level: strategy.level as ResolveResult['level'],
    };
  }

  // No strategy succeeded
  throw new Error(
    `[LocatorContract] Failed to resolve "${contract.name}": ` +
    `no strategy produced a unique visible element. ` +
    `Tried ${ordered.length} strateg${ordered.length === 1 ? 'y' : 'ies'} ` +
    `across levels ${ordered.map(s => s.level).join(', ')}.`
  );
}

// ---------------------------------------------------------------------------
// Re-export types for convenience
// ---------------------------------------------------------------------------

export type {
  Root,
  ScopeDef,
  StrategyDef,
  LocatorContract,
  ResolveOptions,
  ResolveResult,
} from './types';

// ---------------------------------------------------------------------------
// Convenience wrapper — matches the article's original API exactly
// ---------------------------------------------------------------------------

/**
 * A simplified wrapper around `resolveLocator` that returns a plain Playwright
 * `Locator`, matching the API described in the original article:
 *
 * ```ts
 * // Article-style usage (no destructuring needed)
 * const submitButton = await findLocator(page, submitOrderButtonContract);
 * await submitButton.click();
 * ```
 *
 * Use `resolveLocator` directly when you need to inspect which strategy level
 * was matched (e.g. for CI diagnostics or verbose debugging).
 *
 * @param page     - The Playwright `Page` to resolve against
 * @param contract - The locator contract describing how to find the element
 * @param options  - Optional configuration (timeout, verbosity)
 * @returns The resolved Playwright `Locator`
 *
 * @throws {Error} If no strategy produces a unique visible match
 */
export async function findLocator(
  page: Page,
  contract: LocatorContract,
  options: ResolveOptions = {}
): Promise<Locator> {
  const { locator } = await resolveLocator(page, contract, options);
  return locator;
}
