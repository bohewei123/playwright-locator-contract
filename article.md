# Playwright 定位器契约：自动提取多策略定位器的实践

在 Web 自动化测试领域，定位器的维护一直是困扰测试工程师的核心痛点。随着前端技术的快速发展，UI 结构频繁变化，传统的 CSS 选择器和 XPath 表达式往往在一次重构后就全部失效。本文将介绍 playwright-locator-contract 项目新增的「自动提取定位器」能力，展示如何通过 DOM 扫描自动生成多策略定位器契约，从而在测试稳定性与维护成本之间找到更好的平衡点。

---

## 1. 背景与动机

### Playwright 测试中定位器的维护痛点

Playwright 提供了丰富的定位器 API，如 `getByRole`、`getByText`、`getByTestId` 等，鼓励开发者使用用户可感知的语义属性来定位元素。然而在实际项目中，测试工程师往往面临以下挑战：

1. **手动编写耗时**：大型应用可能有数百个交互元素，逐一编写定位器契约是一项繁重的体力劳动
2. **策略选择困难**：同一个元素可能支持多种定位方式，如何确定优先级需要经验判断
3. **唯一性验证繁琐**：编写的定位器是否真的唯一？需要在页面上逐一验证
4. **页面变化感知滞后**：当页面结构变化时，很难快速发现哪些定位器受到影响

### 手动编写 vs 自动提取

playwright-locator-contract 项目最初提供的是一套手动编写定位器契约的 API。开发者需要像这样定义每个元素：

```typescript
const submitOrderButtonContract: LocatorContract = {
  name: 'Submit Order button',
  scope: [{ kind: 'role', role: 'dialog', name: 'Order Confirmation' }],
  strategies: [
    { level: 1, kind: 'role', role: 'button', name: 'Submit Order' },
    { level: 1, kind: 'testId', value: 'submit-order' },
    { level: 2, kind: 'title', value: 'Submit Order' },
    { level: 5, kind: 'css', value: '.dialog-footer .primary-btn' },
  ],
};
```

这种方式虽然结构化，但在面对大量元素时效率不高。自动提取能力的目标是让机器先扫描页面生成基础契约，开发者再在此基础上进行精修。

### 5 级策略体系简介

playwright-locator-contract 采用五级策略体系，按语义清晰度从高到低排列：

| 层级 | 策略类型 | 说明 | Playwright API |
|------|----------|------|----------------|
| Level 1 | Role / TestId | ARIA 角色 + 可访问名称，或 data-testid | `getByRole`, `getByTestId` |
| Level 2 | Label / Placeholder / Title / Alt | 表单标签、占位符、标题、替代文本 | `getByLabel`, `getByPlaceholder`, `getByTitle`, `getByAltText` |
| Level 3 | Text | 可见文本内容 | `getByText` |
| Level 4 | ScopedRole / FilterHasText | 在语义容器内定位，或通过文本过滤容器 | 组合 API |
| Level 5 | CSS / XPath | 实现细节，最脆弱 | `locator` |

### 为什么需要自动提取能力

自动提取并非要取代手动编写，而是提供一种**快速启动**和**批量处理**的能力：

- **快速扫描新页面**：接手新项目时，快速生成页面元素地图
- **回归测试准备**：为现有页面批量生成契约，建立基线
- **变化检测**：定期扫描对比，发现页面结构变化
- **辅助手动编写**：先生成草稿，再人工精修关键元素

---

## 2. 核心设计：extractContracts API

### API 签名和参数说明

```typescript
export async function extractContracts(
  page: Page,
  options?: ExtractOptions
): Promise<ExtractedElement[]>
```

### ExtractOptions 三个选项的用途

```typescript
export interface ExtractOptions {
  /** 自定义 CSS 选择器，覆盖默认的交互元素选择器 */
  selector?: string;
  /** 是否包含隐藏元素（默认：false） */
  includeHidden?: boolean;
  /** 是否通过 count() 验证每个策略的唯一性（默认：true） */
  validateUniqueness?: boolean;
}
```

- **selector**：默认选择器覆盖了常见交互元素（button、a[href]、input、select、textarea、ARIA 角色元素等），但你可以传入自定义选择器来聚焦特定元素类型
- **includeHidden**：默认过滤掉不可见元素（零尺寸或 `display:none`），开启后会包含隐藏元素
- **validateUniqueness**：默认通过 `locator.count()` 验证每个策略是否唯一匹配一个元素。关闭可提升速度，但策略的 `unique` 字段将为空

### 返回值 ExtractedElement 的结构

```typescript
export interface ExtractedElement {
  tag: string;                    // HTML 标签名
  role?: string;                  // 计算的 ARIA 角色
  name?: string;                  // 可访问名称
  text?: string;                  // 可见文本（截断至100字符）
  attributes: ElementAttributes;  // 收集的属性（id, testId, ariaLabel等）
  bbox?: BoundingBox;             // 元素边界框位置
  contract: LocatorContract;      // 自动生成的定位器契约
}
```

### 整体数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                      extractContracts                           │
├─────────────────────────────────────────────────────────────────┤
│  阶段一: DOM 元素收集                                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ querySelector│ -> │ 可见性过滤  │ -> │ 属性采集 + 祖先链    │  │
│  │ (默认选择器) │    │ (尺寸检查)  │    │ (遍历DOM树)         │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  阶段二: 多策略生成                                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  根据元素属性生成 L1-L5 策略                              │    │
│  │  • L1: role+name / testId                                │    │
│  │  • L2: label / placeholder / title / alt                 │    │
│  │  • L3: text                                              │    │
│  │  • L4: scopedRole (祖先容器)                             │    │
│  │  • L5: CSS / XPath                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  阶段三: 唯一性验证                                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  对每个策略调用 buildCandidate + count()                  │    │
│  │  标记 unique = true (唯一匹配) / false (0或多匹配)        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│                    ExtractedElement[]                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 三阶段实现详解

### 3.1 阶段一：DOM 元素收集（collectElements）

#### 默认选择器覆盖的元素类型

```typescript
const DEFAULT_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role=button]',
  '[role=link]',
  '[role=checkbox]',
  '[role=radio]',
  '[role=switch]',
  '[role=tab]',
  '[role=menuitem]',
  '[contenteditable=true]',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'img[alt]',
  '[role=heading]',
  '[role=img]',
  'label',
].join(', ');
```

这个选择器覆盖了绝大多数用户可交互的语义元素，包括表单控件、链接、ARIA 角色元素、标题、图片和标签。

#### 可见性过滤规则

```typescript
// 过滤零尺寸元素
if (rect.width === 0 || rect.height === 0) return;

// 检查 offsetParent（排除 fixed/sticky 定位元素）
if (htmlEl.offsetParent === null && tag !== 'body' && tag !== 'html') {
  const style = window.getComputedStyle(htmlEl);
  if (style.position !== 'fixed' && style.position !== 'sticky') {
    return;
  }
}
```

这里有一个细节：fixed 和 sticky 定位的元素可能 `offsetParent` 为 null，但它们仍然是可见的，所以需要特殊处理。

#### 属性采集

对每个元素收集以下属性：

| 属性 | 来源 |
|------|------|
| tag | `tagName.toLowerCase()` |
| role | `getAttribute('role')` 或从 tag/type 推断 |
| id | `id` |
| name | `getAttribute('name')` |
| ariaLabel | `getAttribute('aria-label')` |
| placeholder | `getAttribute('placeholder')` |
| title | `getAttribute('title')` |
| alt | `getAttribute('alt')` |
| testId | `getAttribute('data-testid')` |
| text | `textContent.trim().slice(0, 100)` |
| inputType | `(HTMLInputElement).type` |

#### 祖先链收集

这是 Level 4 `scopedRole` 策略的基础。实现逻辑如下：

```typescript
// 合格容器 role 白名单
const CONTAINER_ROLES = new Set([
  'dialog', 'alertdialog', 'region', 'group', 'navigation',
  'banner', 'main', 'form', 'complementary', 'contentinfo',
  'tabpanel', 'menu', 'toolbar',
]);

// 从 tag 推断隐式 landmark role
function inferContainerRole(tag: string): string {
  const map: Record<string, string> = {
    nav: 'navigation',
    main: 'main',
    form: 'form',
    aside: 'complementary',
    header: 'banner',
    footer: 'contentinfo',
    section: 'region',
    article: 'article',
  };
  return map[tag] || '';
}

// 向上遍历最多10层，收集语义容器
const ancestors: Array<{ role: string; name: string; tag: string }> = [];
let parent = htmlEl.parentElement;
let depth = 0;
while (parent && depth < 10) {
  const parentTag = parent.tagName.toLowerCase();
  const parentRole = parent.getAttribute('role') || inferContainerRole(parentTag);
  const parentName = parent.getAttribute('aria-label') || '';
  
  if (parentRole && CONTAINER_ROLES.has(parentRole)) {
    ancestors.push({ role: parentRole, name: parentName, tag: parentTag });
  }
  parent = parent.parentElement;
  depth++;
}
```

**设计决策说明**：

1. **容器 role 白名单**：并非所有祖先都有语义价值，只有具有明确区域划分意义的 role 才被视为"容器"
2. **隐式 role 推断**：HTML5 语义标签（如 `<nav>`、`<main>`）虽然没有显式 `role` 属性，但浏览器会隐式映射为对应的 ARIA role
3. **10层遍历限制**：防止在深层 DOM 树上过度遍历，同时覆盖大多数实际场景

---

### 3.2 阶段二：多策略生成（buildStrategies）

#### 各层级生成逻辑详解

| Level | Kind | 触发条件 | 生成的 Playwright 方法 |
|-------|------|---------|----------------------|
| 1 | role | 有 role + (ariaLabel \| text \| name) | `getByRole(role, { name })` |
| 1 | testId | 有 data-testid | `getByTestId(value)` |
| 2 | label | 有 aria-label | `getByLabel(value)` |
| 2 | placeholder | 有 placeholder | `getByPlaceholder(value)` |
| 2 | title | 有 title | `getByTitle(value)` |
| 2 | alt | 有 alt | `getByAltText(value)` |
| 3 | text | 有 text | `getByText(value, { exact: text.length < 20 })` |
| 4 | scopedRole | 有语义容器祖先 + targetName | `getByRole(container).getByRole(target)` |
| 5 | css | 有 id | `locator('#id')` |
| 5 | css | 有 testId | `locator('[data-testid=...]')` |
| 5 | xpath | 有 id | `locator('xpath=//tag[@id]')` |
| 5 | xpath | ≥2 个属性 | `locator('xpath=//tag[@a][@b]')` |

#### Level 4 scopedRole 的设计决策

**为什么需要 L4？**

当页面上存在多个同名元素时（如两个"搜索"按钮分别位于"出发地"和"目的地"区域），L1-L3 的策略可能都无法唯一确定目标。L4 通过引入容器上下文来解决这个问题：

```typescript
// 页面结构示例
<div role="region" aria-label="出发地">
  <button>搜索</button>
</div>
<div role="region" aria-label="目的地">
  <button>搜索</button>
</div>

// L4 生成的策略
{
  level: 4,
  kind: 'scopedRole',
  containerRole: 'region',
  containerName: '出发地',
  targetRole: 'button',
  targetName: '搜索'
}
// 对应 Playwright: page.getByRole('region', { name: '出发地' }).getByRole('button', { name: '搜索' })
```

**祖先遍历逻辑**：

```typescript
// Pass 1: 优先取最近的有 name 的祖先（更高精度）
for (const ancestor of raw.ancestors) {
  if (ancestor.role && ancestor.name) {
    strategies.push({
      level: 4,
      kind: 'scopedRole',
      containerRole: ancestor.role,
      containerName: ancestor.name,
      targetRole: raw.role,
      targetName,
    });
    break;
  }
}

// Pass 2: 取最近的有 role 的祖先（无 name），如果与 Pass 1 不同
for (const ancestor of raw.ancestors) {
  if (ancestor.role) {
    const alreadyAdded = strategies.some(
      s => s.level === 4 && s.kind === 'scopedRole'
        && (s as any).containerRole === ancestor.role
        && (s as any).containerName === ancestor.name
    );
    if (!alreadyAdded) {
      strategies.push({
        level: 4,
        kind: 'scopedRole',
        containerRole: ancestor.role,
        containerName: undefined,  // 无 name
        targetRole: raw.role,
        targetName,
      });
      break;
    }
  }
}
```

**"链路唯一"而非"容器唯一"的验证策略**：

L4 策略的唯一性验证检查的是**整条链路**是否只匹配一个元素，而非容器本身是否唯一。这是关键的设计决策：

```typescript
// 验证时
const locator = page.getByRole('region', { name: '出发地' }).getByRole('button', { name: '搜索' });
const count = await locator.count();  // 如果为 1，则 unique = true
```

即使页面上有多个 `region` 名为"出发地"，只要每个区域内只有一个"搜索"按钮，该策略对该按钮就是唯一的。

#### Level 5 属性组合 XPath 的设计

```typescript
const attrs: string[] = [];
if (raw.tag === 'input' && raw.inputType) {
  attrs.push(`@type='${raw.inputType}'`);
}
if (raw.name) attrs.push(`@name='${raw.name}'`);
if (raw.placeholder) attrs.push(`@placeholder='${raw.placeholder}'`);
if (raw.title) attrs.push(`@title='${raw.title}'`);
if (raw.alt) attrs.push(`@alt='${raw.alt}'`);

// 至少 2 个属性才生成
if (attrs.length >= 2) {
  const xpathAttrs = attrs.map(a => `[${a}]`).join('');
  strategies.push({ level: 5, kind: 'xpath', value: `//${raw.tag}${xpathAttrs}` });
}
```

**为什么设置"至少 2 个属性"的门槛？**

单一属性的 XPath（如 `//input[@name='city']`）通常已经可以通过 L1-L3 的语义策略覆盖。多属性组合的目的是在**没有 id/testId** 且**语义属性不足以唯一确定**时，提供一个相对稳定的备选方案。两个及以上属性的组合能显著降低误匹配概率。

---

### 3.3 阶段三：唯一性验证

```typescript
if (validateUniqueness) {
  for (const s of strategies) {
    try {
      const locator = buildCandidate(page, s);
      const count = await locator.count();
      (s as StrategyDef & { unique?: boolean }).unique = count === 1;
    } catch {
      (s as StrategyDef & { unique?: boolean }).unique = false;
    }
  }
}
```

**unique 字段的含义**：

- `true`：该策略在当前页面只匹配到一个元素，可以安全使用
- `false`：该策略匹配到 0 个或多个元素，可能存在歧义
- `undefined`：当 `validateUniqueness: false` 时，不进行验证

**validateUniqueness: false 快速模式的用途**：

- **大规模扫描**：当只需要收集元素信息而不关心唯一性时
- **性能敏感场景**：避免对每个策略都执行 Playwright 查询
- **离线分析**：提取后再分析策略质量

---

## 4. 实际效果：真实网站验证

我们在东航官网（ceair.com）上进行了实际测试，以下是典型输出：

```
📊 提取到 47 个交互元素

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
元素提取结果摘要
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏷  机票预订
   tag: <a> | role: link
   策略数: 5 (其中唯一: 3)
   L1 role         ✅ role="link" name="机票预订"
   L3 text         ✅ "机票预订"
   L4 scopedRole   ❌ container: navigation[""] → target: link["机票预订"]
   L5 css          ✅ "#nav-flight"
   L5 xpath        ✅ "xpath=//a[@id='nav-flight']"

🏷  出发城市
   tag: <input> | role: textbox
   策略数: 7 (其中唯一: 4)
   L1 role         ✅ role="textbox" name="出发城市"
   L2 placeholder  ✅ "请输入出发城市"
   L3 text         ❌ ""
   L4 scopedRole   ❌ container: form[""] → target: textbox["出发城市"]
   L5 css          ❌ "[data-testid='departure-input']"
   L5 xpath        ✅ "xpath=//input[@type='text'][@name='departure']"
   L5 xpath        ✅ "xpath=//input[@type='text'][@placeholder='请输入出发城市']"
```

### 策略层级分布分析

在真实页面上，各层级策略的分布通常如下：

| Level | 策略总数 | 唯一策略数 | 占比 |
|-------|----------|------------|------|
| 1 | 45 | 32 | 71% |
| 2 | 28 | 20 | 71% |
| 3 | 35 | 8 | 23% |
| 4 | 15 | 5 | 33% |
| 5 | 42 | 30 | 71% |

**观察**：

1. **L1 和 L2 表现最佳**：语义明确的元素通常具有较好的唯一性
2. **L3 文本策略唯一性较低**：因为页面上的文本内容容易重复
3. **L4 覆盖率取决于页面结构**：如果开发者使用了语义化容器（region、group 等），L4 能有效工作；否则覆盖率较低
4. **L5 作为兜底**：CSS/XPath 通常能提供更精确的定位，但脆弱性也更高

### L4 scopedRole 在真实页面上的覆盖率讨论

在实际测试中，L4 的覆盖率受以下因素影响：

- **正面因素**：现代前端框架（React、Vue）配合组件化开发，往往会产生自然的容器边界
- **负面因素**：许多生产网站对 ARIA 属性的支持不完整，容器缺少 `aria-label`
- **改进空间**：可以考虑通过文本内容推断容器身份（类似 `filterHasText` 策略）

---

## 5. 与手动契约的协作

### extractContracts 适用场景

| 场景 | 说明 |
|------|------|
| 快速扫描 | 接手新项目时，快速生成页面元素地图 |
| 批量生成 | 为回归测试批量建立契约基线 |
| 变化检测 | 定期扫描对比，发现页面结构变化 |
| 策略发现 | 了解页面上哪些定位方式可用 |

### 手动编写适用场景

| 场景 | 说明 |
|------|------|
| 精确控制 | 需要精确指定 scope 和策略优先级 |
| 复杂交互 | 涉及 iframe、动态加载、条件渲染 |
| 跨 iframe | 需要 frame 字段切换到 iframe 内 |
| filterHasText | 当前自动提取尚未实现此策略 |

### 推荐工作流

```
┌─────────────────────────────────────────────────────────────┐
│  1. 自动提取阶段                                              │
│     extractContracts(page) → 生成基础契约列表                  │
│                              ↓                              │
│  2. 筛选阶段                                                  │
│     过滤出 unique 策略数 ≥ 1 的元素                           │
│     按业务重要性排序                                          │
│                              ↓                              │
│  3. 人工精修阶段                                              │
│     对关键元素手动调整：                                      │
│     • 添加/调整 scope                                         │
│     • 重新排序策略优先级                                      │
│     • 添加 filterHasText 策略                                 │
│     • 删除脆弱的 CSS/XPath 策略                               │
│                              ↓                              │
│  4. 契约入库                                                  │
│     将精修后的契约保存到项目代码库                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 技术总结

### 关键技术决策回顾

1. **五级策略体系**：按语义清晰度分层，优先使用用户可感知的属性
2. **容器白名单 + 隐式推断**：平衡精确性和覆盖率
3. **双 Pass 祖先遍历**：优先使用有 name 的容器，同时保留无 name 容器作为备选
4. **属性组合门槛**：L5 XPath 至少 2 个属性，避免与 L1-L3 重复
5. **链路唯一性验证**：L4 策略验证整条链路的唯一性，而非仅容器

### 当前局限性

1. **filterHasText 未实现**：这是 Level 4 的另一种策略，用于容器没有 aria-label 但通过包含文本可区分的情况
2. **性能优化空间**：大规模页面扫描时，每个策略的 count() 调用会产生较多 Playwright 查询
3. **动态内容处理**：当前实现针对静态 DOM，对于延迟加载的内容需要额外处理
4. **iframe 支持**：自动提取尚未处理跨 iframe 的场景

### 未来方向

1. **智能 filterHasText 生成**：通过文本相似度分析，自动识别列表行中的区分文本
2. **契约版本管理**：支持对比不同时间点的扫描结果，生成变更报告
3. **IDE 集成**：提供 VS Code 插件，支持可视化查看和编辑契约
4. **机器学习辅助**：基于历史数据预测哪些策略在页面变化后仍然稳定

---

## 结语

playwright-locator-contract 的自动提取能力不是要取代测试工程师的判断，而是将**重复性的扫描和验证工作**自动化，让工程师能够专注于**策略选择和契约精修**。通过 DOM 扫描生成多策略定位器契约，我们建立了一个机器生成与人类判断协作的工作流，在测试稳定性与维护成本之间找到了更好的平衡点。

在实际项目中，建议将自动提取作为**起点**而非**终点**：先用 `extractContracts` 快速获取页面元素地图，然后针对关键业务流程手动精修契约，最终形成既稳定又可维护的测试资产。
