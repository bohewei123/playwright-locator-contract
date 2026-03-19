/**
 * @file contracts.ts
 * @description Example LocatorContract definitions.
 *
 * These contracts demonstrate how to express locating intent as structured data.
 * Each contract captures:
 *  - what the element is (name)
 *  - what scope to search within (scope)
 *  - how to find it, in priority order (strategies)
 *
 * In a real project, group contracts by page or feature module, and import them
 * into spec files rather than writing selectors inline.
 *
 * @module contracts
 */

import type { LocatorContract } from './types';

// ---------------------------------------------------------------------------
// Order Confirmation dialog
// ---------------------------------------------------------------------------

/**
 * The "Submit Order" button inside the "Order Confirmation" dialog.
 *
 * Strategy walk-through:
 * 1. First try the semantic role + accessible name (most resilient)
 * 2. Fall back to a stable test ID if the team provides one
 * 3. Try the button's title attribute
 * 4. Try the visible text as exact match
 * 5. Try a scoped role inside a named group (structural, but still semantic)
 * 6. CSS fallback — only if DOM structure is known to be stable
 * 7. XPath fallback — last resort, expresses current DOM position
 */
export const submitOrderButtonContract: LocatorContract = {
  name: 'Submit Order button',
  scope: [
    { kind: 'role', role: 'dialog', name: 'Order Confirmation' },
  ],
  strategies: [
    { level: 1, kind: 'role', role: 'button', name: 'Submit Order' },
    { level: 1, kind: 'testId', value: 'submit-order' },
    { level: 2, kind: 'title', value: 'Submit Order' },
    { level: 3, kind: 'text', value: 'Submit Order', exact: true },
    {
      level: 4,
      kind: 'scopedRole',
      containerRole: 'group',
      containerName: 'Order Details',
      targetRole: 'button',
      targetName: 'Submit Order',
    },
    { level: 5, kind: 'css', value: '.dialog-footer .primary-btn' },
    { level: 5, kind: 'xpath', value: '//div[contains(@class,"dialog-footer")]//button[last()]' },
  ],
};

/**
 * The "Cancel" button inside the "Order Confirmation" dialog.
 */
export const cancelOrderButtonContract: LocatorContract = {
  name: 'Cancel Order button',
  scope: [
    { kind: 'role', role: 'dialog', name: 'Order Confirmation' },
  ],
  strategies: [
    { level: 1, kind: 'role', role: 'button', name: 'Cancel' },
    { level: 1, kind: 'testId', value: 'cancel-order' },
    { level: 3, kind: 'text', value: 'Cancel', exact: true },
    { level: 5, kind: 'css', value: '.dialog-footer .secondary-btn' },
  ],
};

// ---------------------------------------------------------------------------
// Flight search form
// ---------------------------------------------------------------------------

/**
 * The "Departure City" input in a flight search form.
 */
export const departureCityInputContract: LocatorContract = {
  name: 'Departure City input',
  strategies: [
    { level: 2, kind: 'label', value: 'Departure City' },
    { level: 2, kind: 'placeholder', value: 'Enter departure city' },
    { level: 1, kind: 'testId', value: 'departure-city-input' },
    { level: 5, kind: 'css', value: 'input[name="departureCity"]' },
  ],
};

/**
 * The "Arrival City" input in a flight search form.
 */
export const arrivalCityInputContract: LocatorContract = {
  name: 'Arrival City input',
  strategies: [
    { level: 2, kind: 'label', value: 'Arrival City' },
    { level: 2, kind: 'placeholder', value: 'Enter arrival city' },
    { level: 1, kind: 'testId', value: 'arrival-city-input' },
    { level: 5, kind: 'css', value: 'input[name="arrivalCity"]' },
  ],
};

/**
 * The "Search Flights" button in a flight search form.
 */
export const searchFlightsButtonContract: LocatorContract = {
  name: 'Search Flights button',
  strategies: [
    { level: 1, kind: 'role', role: 'button', name: 'Search Flights' },
    { level: 1, kind: 'testId', value: 'search-flights-btn' },
    { level: 3, kind: 'text', value: 'Search Flights', exact: true },
    { level: 5, kind: 'css', value: '.search-form .search-btn' },
  ],
};

// ---------------------------------------------------------------------------
// Flight results list
// ---------------------------------------------------------------------------

/**
 * The "Book" button for a specific flight row identified by flight number.
 *
 * This contract demonstrates scoped disambiguation: when multiple "Book" buttons
 * appear in a list, the scope is narrowed to the row containing the flight number.
 *
 * @param flightNumber - The flight number shown in the list row (e.g. "MU5137")
 */
export function bookFlightButtonContract(flightNumber: string): LocatorContract {
  return {
    name: `Book button for flight ${flightNumber}`,
    strategies: [
      // Level 4 — filterHasText: the idiomatic Playwright pattern from the article.
      // Finds the listitem that *contains* the flight number text, then locates
      // the Book button inside it. No aria-label on the <li> required.
      //   page.getByRole('listitem').filter({ hasText: 'MU5137' })
      //       .getByRole('button', { name: 'Book' })
      {
        level: 4,
        kind: 'filterHasText',
        containerRole: 'listitem',
        hasText: flightNumber,
        targetRole: 'button',
        targetName: 'Book',
      },
      // Level 5 CSS fallback
      { level: 5, kind: 'css', value: `li[aria-label="${flightNumber}"] .book-btn` },
    ],
  };
}

// ---------------------------------------------------------------------------
// Payment dialog
// ---------------------------------------------------------------------------

/**
 * The "Confirm Payment" button inside the "Payment Confirmation" dialog.
 */
export const confirmPaymentButtonContract: LocatorContract = {
  name: 'Confirm Payment button',
  scope: [
    { kind: 'role', role: 'dialog', name: 'Payment Confirmation' },
  ],
  strategies: [
    { level: 1, kind: 'role', role: 'button', name: 'Confirm Payment' },
    { level: 1, kind: 'testId', value: 'confirm-payment-btn' },
    { level: 2, kind: 'title', value: 'Confirm Payment' },
    { level: 3, kind: 'text', value: 'Confirm Payment', exact: true },
    { level: 5, kind: 'css', value: '.payment-dialog .confirm-btn' },
  ],
};

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * The close button on a modal (generic — works for any modal with a visible close control).
 */
export const modalCloseButtonContract: LocatorContract = {
  name: 'Modal close button',
  strategies: [
    { level: 1, kind: 'role', role: 'button', name: 'Close' },
    { level: 2, kind: 'title', value: 'Close' },
    { level: 2, kind: 'alt', value: 'Close' },
    { level: 1, kind: 'testId', value: 'modal-close-btn' },
    { level: 5, kind: 'css', value: '.modal-close, [aria-label="Close"]' },
  ],
};
