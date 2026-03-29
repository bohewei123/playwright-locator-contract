/**
 * @file dom-extractor.spec.ts
 * @description TDD tests for the extractContracts function.
 * Tests are written BEFORE implementation (RED phase).
 */

import { test, expect } from '@playwright/test';
import { extractContracts } from '../src/extractor';

// ---------------------------------------------------------------------------
// Flight search page (/flights/search)
// ---------------------------------------------------------------------------

test.describe('extractContracts - 航班搜索页', () => {
  test('提取结果包含 search button 且契约包含 Level 1 role + testId 策略', async ({ page }) => {
    await page.goto('/flights/search');
    const elements = await extractContracts(page);
    const searchBtn = elements.find(el => el.attributes.testId === 'search-flights-btn');
    expect(searchBtn).toBeDefined();
    expect(searchBtn!.contract.strategies.some(s => s.level === 1 && s.kind === 'role')).toBe(true);
    expect(searchBtn!.contract.strategies.some(s => s.level === 1 && s.kind === 'testId')).toBe(true);
  });

  test('提取结果包含 input 且契约包含 Level 2 placeholder 策略', async ({ page }) => {
    await page.goto('/flights/search');
    const elements = await extractContracts(page);
    const depInput = elements.find(el => el.attributes.testId === 'departure-city');
    expect(depInput).toBeDefined();
    expect(depInput!.contract.strategies.some(s => s.level === 2 && s.kind === 'placeholder')).toBe(true);
  });

  test('Level 1 策略的 unique 应为 true', async ({ page }) => {
    await page.goto('/flights/search');
    const elements = await extractContracts(page);
    const searchBtn = elements.find(el => el.attributes.testId === 'search-flights-btn');
    const level1 = searchBtn!.contract.strategies.filter(s => s.level === 1);
    level1.forEach(s => expect(s.unique).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// Order confirmation page (/order/confirm)
// ---------------------------------------------------------------------------

test.describe('extractContracts - 订单确认页', () => {
  test('提取 Submit Order 和 Cancel 按钮，Submit 应有 testId 策略', async ({ page }) => {
    await page.goto('/order/confirm');
    const elements = await extractContracts(page);
    const submitBtn = elements.find(el => el.attributes.testId === 'submit-order');
    const cancelBtn = elements.find(el => el.attributes.testId === 'cancel-order');
    expect(submitBtn).toBeDefined();
    expect(cancelBtn).toBeDefined();
    expect(submitBtn!.contract.strategies.some(s => s.kind === 'testId' && s.value === 'submit-order')).toBe(true);
  });

  test('策略按 level 升序排列', async ({ page }) => {
    await page.goto('/order/confirm');
    const elements = await extractContracts(page);
    const submitBtn = elements.find(el => el.attributes.testId === 'submit-order');
    const levels = submitBtn!.contract.strategies.map(s => s.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });
});

// ---------------------------------------------------------------------------
// Payment confirmation page (/payment/confirm)
// ---------------------------------------------------------------------------

test.describe('extractContracts - 支付确认页', () => {
  test('Confirm Payment 按钮应提取出 role + testId + title 三种策略', async ({ page }) => {
    await page.goto('/payment/confirm');
    const elements = await extractContracts(page);
    const confirmBtn = elements.find(el => el.attributes.testId === 'confirm-payment-btn');
    expect(confirmBtn).toBeDefined();
    const kinds = confirmBtn!.contract.strategies.map(s => s.kind);
    expect(kinds).toContain('role');
    expect(kinds).toContain('testId');
    expect(kinds).toContain('title');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test.describe('extractContracts - 边界情况', () => {
  test('自定义 selector 只提取 button 元素', async ({ page }) => {
    await page.goto('/flights/search');
    const elements = await extractContracts(page, { selector: 'button' });
    elements.forEach(el => expect(el.tag).toBe('button'));
  });

  test('validateUniqueness: false 时策略无 unique 字段', async ({ page }) => {
    await page.goto('/flights/search');
    const elements = await extractContracts(page, { validateUniqueness: false });
    const allStrategies = elements.flatMap(el => el.contract.strategies);
    allStrategies.forEach(s => expect(s.unique).toBeUndefined());
  });

  test('每个 ExtractedElement 包含完整结构（tag, contract.name, contract.strategies 非空）', async ({ page }) => {
    await page.goto('/flights/search');
    const elements = await extractContracts(page);
    expect(elements.length).toBeGreaterThan(0);
    elements.forEach(el => {
      expect(el.tag).toBeTruthy();
      expect(el.contract.name).toBeTruthy();
      expect(el.contract.strategies.length).toBeGreaterThan(0);
    });
  });
});
