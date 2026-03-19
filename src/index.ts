/**
 * @file index.ts
 * @description Public API for the playwright-locator-contract package.
 *
 * Import from this entry point to use the locator contract system:
 *
 * @example
 * import { resolveLocator } from 'playwright-locator-contract';
 * import type { LocatorContract } from 'playwright-locator-contract';
 */

// Core resolver — enhanced version (returns ResolveResult with matched strategy info)
export { resolveLocator } from './locator-contract';

// Article-style convenience wrapper — returns plain Locator, no destructuring needed:
//   const btn = await findLocator(page, myContract);
//   await btn.click();
export { findLocator } from './locator-contract';

// All type definitions
export type {
  Root,
  ScopeDef,
  StrategyDef,
  Level1Strategy,
  Level2Strategy,
  Level3Strategy,
  Level4Strategy,
  Level5Strategy,
  LocatorContract,
  ResolveOptions,
  ResolveResult,
} from './types';

// Example contracts (consumers can use these as templates or import directly)
export {
  submitOrderButtonContract,
  cancelOrderButtonContract,
  departureCityInputContract,
  arrivalCityInputContract,
  searchFlightsButtonContract,
  bookFlightButtonContract,
  confirmPaymentButtonContract,
  modalCloseButtonContract,
} from './contracts';
