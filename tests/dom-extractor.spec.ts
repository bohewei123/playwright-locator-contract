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

// ---------------------------------------------------------------------------
// L4 scopedRole 策略测试
// ---------------------------------------------------------------------------

test.describe('extractContracts - L4 scopedRole', () => {
  test('同名按钮在不同命名容器中应生成 scopedRole 策略', async ({ page }) => {
    await page.setContent(`
      <div role="region" aria-label="Departure">
        <button>Search</button>
      </div>
      <div role="region" aria-label="Return">
        <button>Search</button>
      </div>
    `);
    const elements = await extractContracts(page);
    const searchBtns = elements.filter(el => el.tag === 'button');
    expect(searchBtns).toHaveLength(2);
    
    // 两个按钮都应该有 L4 scopedRole 策略
    for (const btn of searchBtns) {
      const l4 = btn.contract.strategies.find(s => s.level === 4 && s.kind === 'scopedRole');
      expect(l4).toBeDefined();
    }
    
    // containerName 应分别对应各自的 region
    const l4Strategies = searchBtns.map(btn => 
      btn.contract.strategies.find(s => s.level === 4 && s.kind === 'scopedRole')
    );
    const containerNames = l4Strategies.map(s => (s as any).containerName);
    expect(containerNames).toContain('Departure');
    expect(containerNames).toContain('Return');
  });

  test('scopedRole 链路唯一性验证', async ({ page }) => {
    await page.setContent(`
      <div role="region" aria-label="Departure">
        <button>Search</button>
      </div>
      <div role="region" aria-label="Return">
        <button>Search</button>
      </div>
    `);
    const elements = await extractContracts(page);
    const searchBtns = elements.filter(el => el.tag === 'button');
    
    // L4 scopedRole 策略的 unique 应为 true（整条链路唯一）
    for (const btn of searchBtns) {
      const l4 = btn.contract.strategies.find(s => s.level === 4 && s.kind === 'scopedRole');
      expect(l4).toBeDefined();
      expect(l4!.unique).toBe(true);
    }
  });

  test('取最近命名祖先而非更远的', async ({ page }) => {
    await page.setContent(`
      <div role="navigation" aria-label="Main Nav">
        <div role="group" aria-label="User Menu">
          <button>Settings</button>
        </div>
      </div>
    `);
    const elements = await extractContracts(page);
    const settingsBtn = elements.find(el => el.tag === 'button');
    expect(settingsBtn).toBeDefined();
    
    const l4 = settingsBtn!.contract.strategies.find(s => s.level === 4 && s.kind === 'scopedRole');
    expect(l4).toBeDefined();
    // 应使用最近的 group，不是更远的 navigation
    expect((l4 as any).containerRole).toBe('group');
    expect((l4 as any).containerName).toBe('User Menu');
  });

  test('无命名祖先的元素不生成 L4', async ({ page }) => {
    await page.setContent(`
      <div>
        <button>OK</button>
      </div>
    `);
    const elements = await extractContracts(page);
    const okBtn = elements.find(el => el.tag === 'button');
    expect(okBtn).toBeDefined();
    
    const l4 = okBtn!.contract.strategies.find(s => s.level === 4 && s.kind === 'scopedRole');
    expect(l4).toBeUndefined();
  });

  test('无 aria-label 的容器也能生成 scopedRole 策略', async ({ page }) => {
    await page.setContent(`
      <div role="radiogroup">
        <label><input type="radio" name="trip" value="oneway"> 单程</label>
        <label><input type="radio" name="trip" value="round"> 往返</label>
      </div>
    `);
    const elements = await extractContracts(page);
    const radios = elements.filter(el => el.role === 'radio');
    expect(radios.length).toBeGreaterThan(0);
    
    // 应该有 L4 scopedRole 策略，containerRole 为 radiogroup
    const oneway = radios.find(el => el.text?.includes('单程') || el.name?.includes('单程'));
    if (oneway) {
      const l4 = oneway.contract.strategies.find(s => s.level === 4 && s.kind === 'scopedRole');
      expect(l4).toBeDefined();
      expect((l4 as any).containerRole).toBe('radiogroup');
      // containerName 应为 undefined 或空（因为 radiogroup 没有 aria-label）
      expect((l4 as any).containerName).toBeFalsy();
    }
  });

  test('有 containerName 的 L4 排在无 containerName 的 L4 前面', async ({ page }) => {
    await page.setContent(`
      <div role="navigation" aria-label="Main">
        <div role="group">
          <button>Action</button>
        </div>
      </div>
    `);
    const elements = await extractContracts(page);
    const actionBtn = elements.find(el => el.tag === 'button');
    expect(actionBtn).toBeDefined();
    
    const l4Strategies = actionBtn!.contract.strategies.filter(s => s.level === 4 && s.kind === 'scopedRole');
    // 应该有 2 个 L4：group(无name) 和 navigation(有name="Main")
    // 但由于 group 是最近的无name祖先，navigation 是最近的有name祖先
    // 有 name 的应排在前面
    expect(l4Strategies.length).toBe(2);
    // 第一个有 containerName
    expect((l4Strategies[0] as any).containerName).toBeTruthy();
    // 第二个无 containerName
    expect((l4Strategies[1] as any).containerName).toBeFalsy();
  });

  test('L4 与现有策略共存且按 level 排序', async ({ page }) => {
    await page.setContent(`
      <div role="dialog" aria-label="Confirm Delete">
        <button>OK</button>
        <button>Cancel</button>
      </div>
    `);
    const elements = await extractContracts(page);
    const okBtn = elements.find(el => el.tag === 'button' && el.text === 'OK');
    expect(okBtn).toBeDefined();
    
    // 应同时有 L1 (role) 和 L4 (scopedRole) 策略
    const hasL1 = okBtn!.contract.strategies.some(s => s.level === 1);
    const hasL4 = okBtn!.contract.strategies.some(s => s.level === 4 && s.kind === 'scopedRole');
    expect(hasL1).toBe(true);
    expect(hasL4).toBe(true);
    
    // 策略按 level 升序排列
    const levels = okBtn!.contract.strategies.map(s => s.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });
});

// ---------------------------------------------------------------------------
// L5 attribute-combination XPath
// ---------------------------------------------------------------------------

test.describe('extractContracts - L5 属性组合 XPath', () => {
  test('input 元素应生成多属性组合 XPath', async ({ page }) => {
    await page.setContent(`
      <input type="text" name="city" placeholder="Enter city" title="City input">
    `);
    const elements = await extractContracts(page);
    const input = elements.find(el => el.tag === 'input');
    expect(input).toBeDefined();
    
    const attrXpath = input!.contract.strategies.find(
      s => s.level === 5 && s.kind === 'xpath' && (s as any).value.includes('@type') && (s as any).value.includes('@name')
    );
    expect(attrXpath).toBeDefined();
    // Should contain multiple attribute selectors
    expect((attrXpath as any).value).toMatch(/\/\/input\[@type='text'\]\[@name='city'\]/);
  });

  test('单属性元素不生成属性组合 XPath', async ({ page }) => {
    await page.setContent(`
      <button title="Submit">OK</button>
    `);
    const elements = await extractContracts(page);
    const btn = elements.find(el => el.tag === 'button');
    expect(btn).toBeDefined();
    
    // title 是唯一的额外属性，不够组合（button 没有 name/placeholder/alt/type）
    // 所以不应该有属性组合 XPath
    const attrXpath = btn!.contract.strategies.find(
      s => s.level === 5 && s.kind === 'xpath' && (s as any).value.includes('@title')
    );
    expect(attrXpath).toBeUndefined();
  });

  test('属性组合 XPath 的 unique 验证', async ({ page }) => {
    await page.setContent(`
      <input type="text" name="departure" placeholder="From">
      <input type="text" name="arrival" placeholder="To">
    `);
    const elements = await extractContracts(page);
    const inputs = elements.filter(el => el.tag === 'input');
    expect(inputs).toHaveLength(2);
    
    // 每个 input 的属性组合 XPath 应该是唯一的（name 不同）
    for (const input of inputs) {
      const attrXpath = input.contract.strategies.find(
        s => s.level === 5 && s.kind === 'xpath' && (s as any).value.includes('@name')
      );
      expect(attrXpath).toBeDefined();
      expect(attrXpath!.unique).toBe(true);
    }
  });
});
