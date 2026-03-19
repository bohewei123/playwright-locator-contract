/**
 * @file order-confirm.spec.ts
 * @description End-to-end test examples using the LocatorContract system.
 *
 * Two APIs are available:
 *
 *   findLocator(page, contract)
 *     — matches the article's original API, returns a plain Locator
 *     — use for clean, readable test code
 *
 *   resolveLocator(page, contract, options?)
 *     — enhanced version, returns ResolveResult { locator, matchedStrategy, level }
 *     — use when you need to inspect which strategy level resolved the element
 */

import { test, expect } from '@playwright/test';
import { findLocator, resolveLocator } from '../src/locator-contract';
import {
  submitOrderButtonContract,
  cancelOrderButtonContract,
  departureCityInputContract,
  arrivalCityInputContract,
  searchFlightsButtonContract,
  bookFlightButtonContract,
  confirmPaymentButtonContract,
} from '../src/contracts';

// ---------------------------------------------------------------------------
// Order confirmation flow
// ---------------------------------------------------------------------------

test.describe('Order confirmation dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/order/confirm');
  });

  test('should submit an order via the Submit Order button', async ({ page }) => {
    // findLocator — article-style API, returns Locator directly (no destructuring)
    const submitButton = await findLocator(page, submitOrderButtonContract);
    await submitButton.click();

    await expect(page.getByText('Order submitted successfully')).toBeVisible();
  });

  test('should cancel an order via the Cancel button', async ({ page }) => {
    const cancelButton = await findLocator(page, cancelOrderButtonContract);
    await cancelButton.click();

    await expect(
      page.getByRole('dialog', { name: 'Order Confirmation' })
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Flight search + booking flow
// ---------------------------------------------------------------------------

test.describe('Flight search and booking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/flights/search');
  });

  test('should search for a flight and book a specific result', async ({ page }) => {
    const departureCityInput = await findLocator(page, departureCityInputContract);
    await departureCityInput.fill('Shanghai');

    const arrivalCityInput = await findLocator(page, arrivalCityInputContract);
    await arrivalCityInput.fill('Beijing');

    const searchButton = await findLocator(page, searchFlightsButtonContract);
    await searchButton.click();

    await expect(page.getByRole('list', { name: 'Flight results' })).toBeVisible();

    const bookButton = await findLocator(page, bookFlightButtonContract('MU5137'));
    await bookButton.click();

    await expect(page).toHaveURL(/\/order\//);
  });

  test('should handle multiple flights in results without ambiguity', async ({ page }) => {
    const dep = await findLocator(page, departureCityInputContract);
    await dep.fill('Guangzhou');

    const arr = await findLocator(page, arrivalCityInputContract);
    await arr.fill('Chengdu');

    const search = await findLocator(page, searchFlightsButtonContract);
    await search.click();

    await expect(page.getByRole('list', { name: 'Flight results' })).toBeVisible();

    // CZ6188 is unambiguous — other rows' Book buttons are unaffected
    const bookCZ6188 = await findLocator(page, bookFlightButtonContract('CZ6188'));
    await bookCZ6188.click();

    await expect(page).toHaveURL(/\/order\//);
  });
});

// ---------------------------------------------------------------------------
// Payment confirmation dialog
// ---------------------------------------------------------------------------

test.describe('Payment confirmation', () => {
  test('should confirm payment', async ({ page }) => {
    await page.goto('/payment/confirm');

    const confirmButton = await findLocator(page, confirmPaymentButtonContract);
    await confirmButton.click();

    await expect(page.getByText('Payment Successful')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Demonstrating resolveLocator — enhanced API for CI diagnostics
// ---------------------------------------------------------------------------

test.describe('Locator contract debug mode', () => {
  test('resolveLocator exposes which strategy level resolved the element', async ({ page }) => {
    await page.goto('/order/confirm');

    // resolveLocator returns { locator, matchedStrategy, level }
    // useful when you want to assert or log which confidence level was used
    const result = await resolveLocator(
      page,
      submitOrderButtonContract,
      { verbose: true, timeout: 5000 }
    );

    // Should resolve at level 1 (role-based, highest confidence)
    expect(result.level).toBeLessThanOrEqual(2);
    expect(result.locator).toBeTruthy();
  });
});
