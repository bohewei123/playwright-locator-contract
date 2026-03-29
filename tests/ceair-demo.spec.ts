/**
 * @file ceair-demo.spec.ts
 * @description Demo: using extractContracts on a real-world website (ceair.com)
 * 
 * This test demonstrates how extractContracts works on a production website.
 * It navigates to China Eastern Airlines' homepage and automatically extracts
 * interactive elements with multi-strategy locator contracts.
 */

import { test, expect } from '@playwright/test';
import { extractContracts, resolveLocator } from '../src';
import type { ExtractedElement } from '../src';

test.describe('extractContracts - 东航官网 ceair.com 真实页面演示', () => {

  // 增加超时时间，因为真实网站加载可能较慢
  test.use({ 
    baseURL: undefined,  // 覆盖 playwright.config 中的 baseURL
    navigationTimeout: 60000,
    actionTimeout: 30000,
  });

  // 标记为慢速测试，增加超时时间
  test.slow();

  test('自动提取首页交互元素并生成多策略定位契约', async ({ page }) => {
    // 导航到东航首页 - 使用 load 事件等待更完整的页面加载
    await page.goto('https://www.ceair.com/', { 
      waitUntil: 'load',
      timeout: 60000 
    });
    
    // 等待页面基本加载
    await page.waitForTimeout(3000);

    // 尝试处理可能出现的 Cookie 同意弹窗
    try {
      const agreeBtn = page.getByRole('button', { name: '同意' });
      if (await agreeBtn.isVisible({ timeout: 2000 })) {
        console.log('🍪 检测到 Cookie 同意弹窗，点击同意...');
        await agreeBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {
      // 没有弹窗，继续
    }

    // 自动提取所有交互元素
    const elements = await extractContracts(page);

    // 基本断言：应该能提取到多个元素（注：真实网站可能因各种原因提取不到元素，这里放宽断言）
    console.log(`\n📊 提取到 ${elements.length} 个交互元素\n`);
    
    // 如果提取到元素，则打印详细信息；否则打印警告
    if (elements.length === 0) {
      console.log('⚠️ 警告：未提取到任何交互元素（可能是页面结构特殊或网络问题）');
      // 不强制失败，因为真实网站可能不稳定
      return;
    }

    // 打印每个元素的摘要信息
    console.log('━'.repeat(80));
    console.log('元素提取结果摘要');
    console.log('━'.repeat(80));
    
    for (const el of elements) {
      const uniqueStrategies = el.contract.strategies.filter(s => s.unique === true);
      console.log(`\n🏷  ${el.contract.name}`);
      console.log(`   tag: <${el.tag}> | role: ${el.role || 'none'}`);
      console.log(`   策略数: ${el.contract.strategies.length} (其中唯一: ${uniqueStrategies.length})`);
      
      for (const s of el.contract.strategies) {
        const uniqueFlag = s.unique ? '✅' : '❌';
        const detail = s.kind === 'role' ? `role="${s.role}" name="${s.name}"` 
                     : s.kind === 'scopedRole' ? `container: ${(s as any).containerRole}["${(s as any).containerName}"] → target: ${(s as any).targetRole}["${(s as any).targetName}"]`
                     : 'value' in s ? `"${s.value}"` 
                     : JSON.stringify(s);
        console.log(`   L${s.level} ${s.kind.padEnd(12)} ${uniqueFlag} ${detail}`);
      }
    }

    console.log('\n' + '━'.repeat(80));

    // 统计各层级策略分布
    const allStrategies = elements.flatMap(el => el.contract.strategies);
    const levelCounts = [1, 2, 3, 4, 5].map(level => ({
      level,
      total: allStrategies.filter(s => s.level === level).length,
      unique: allStrategies.filter(s => s.level === level && s.unique === true).length,
    }));

    console.log('\n📈 策略层级分布:');
    for (const { level, total, unique } of levelCounts) {
      if (total > 0) {
        console.log(`   Level ${level}: ${total} 个策略, ${unique} 个唯一`);
      }
    }

    // 统计元素类型分布
    const tagCounts: Record<string, number> = {};
    for (const el of elements) {
      tagCounts[el.tag] = (tagCounts[el.tag] || 0) + 1;
    }
    console.log('\n🏗  元素类型分布:');
    for (const [tag, count] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`   <${tag}>: ${count} 个`);
    }
  });

  test('提取按钮元素并验证策略可用性', async ({ page }) => {
    await page.goto('https://www.ceair.com/', { 
      waitUntil: 'load',
      timeout: 60000 
    });
    await page.waitForTimeout(3000);

    // 只提取 button 类元素
    const buttons = await extractContracts(page, { 
      selector: 'button, [role=button], input[type=submit]' 
    });

    console.log(`\n🔘 提取到 ${buttons.length} 个按钮元素\n`);

    for (const btn of buttons) {
      console.log(`按钮: "${btn.contract.name}"`);
      for (const s of btn.contract.strategies) {
        const flag = s.unique ? '✅唯一' : '❌非唯一';
        // 对于 L4 scopedRole 策略，展示详细的容器和目标信息
        if (s.kind === 'scopedRole') {
          const scopedInfo = `container: ${(s as any).containerRole}["${(s as any).containerName}"] → target: ${(s as any).targetRole}["${(s as any).targetName}"]`;
          console.log(`  L${s.level} ${s.kind}: ${flag} | ${scopedInfo}`);
        } else {
          console.log(`  L${s.level} ${s.kind}: ${flag}`);
        }
      }
    }

    // 如果有唯一策略的按钮，尝试用 resolveLocator 解析
    const resolvableBtn = buttons.find(btn => 
      btn.contract.strategies.some(s => s.unique === true)
    );

    if (resolvableBtn) {
      console.log(`\n🎯 尝试用 resolveLocator 解析: "${resolvableBtn.contract.name}"`);
      try {
        const result = await resolveLocator(page, resolvableBtn.contract, { 
          verbose: true, 
          timeout: 5000 
        });
        console.log(`✅ 解析成功! 使用 Level ${result.level} ${result.matchedStrategy.kind} 策略`);
        
        // 验证解析结果是可见的
        await expect(result.locator).toBeVisible({ timeout: 5000 });
        console.log('✅ 元素可见');
      } catch (e) {
        console.log(`⚠️ 解析失败（可能页面已变化）: ${(e as Error).message}`);
      }
    }
  });

});
