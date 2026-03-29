# playwright-locator-contract

> Stop treating locators as strings. Treat them as structured contracts.

A lightweight TypeScript library for [Playwright](https://playwright.dev/) that replaces fragile one-off selectors with a **layered locator contract system** — a structured, prioritized, and self-documenting approach to finding UI elements.

---

## Why this exists

Most flaky UI tests don't fail because the business flow is complicated.  
They fail because the locator strategy is fragile.

A single XPath or CSS selector encodes one answer to a narrow question: *"How do I find this element right now?"*

A **locator contract** encodes a more useful set of questions:

- What is this element, in business terms?
- What scope does it live in?
- What is the preferred way to locate it?
- If that fails, how should the strategy degrade?

That shift — from string to contract — is what makes test suites survive UI evolution.

---

## Installation

```bash
npm install --save-dev @playwright/test
npm install --save-dev playwright-locator-contract
```

Or clone this repository and install locally:

```bash
git clone https://github.com/your-org/playwright-locator-contract.git
cd playwright-locator-contract
npm install
npx playwright install
```

---

## Quick start

### 1. Define a contract

```typescript
// contracts/order.ts
import type { LocatorContract } from 'playwright-locator-contract';

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
    { level: 5, kind: 'css', value: '.dialog-footer .primary-btn' },
  ],
};
```

### 2. Use it in a test

```typescript
// tests/order-confirm.spec.ts
import { test, expect } from '@playwright/test';
import { findLocator } from 'playwright-locator-contract';
import { submitOrderButtonContract } from '../contracts/order';

test('submit order', async ({ page }) => {
  await page.goto('/order/confirm');

  // findLocator returns a plain Locator — no destructuring needed
  const submitButton = await findLocator(page, submitOrderButtonContract);
  await submitButton.click();

  await expect(page.getByText('Order submitted successfully')).toBeVisible();
});
```

The test reads like a business action. The contract captures the locating logic. Those two concerns are now separated.

---

## DOM auto-extraction with `extractContracts`

In addition to manually defining contracts, you can **automatically extract** locator contracts from any page. This is useful for:

- **Rapid scanning**: Quickly inventory all interactive elements on a page
- **Bulk contract generation**: Generate base contracts to refine and check into version control
- **Exploratory testing**: Understand what elements are available before writing tests

### Usage

```typescript
import { extractContracts } from 'playwright-locator-contract';

// Automatically scan the page and extract contracts for all interactive elements
const elements = await extractContracts(page);

for (const el of elements) {
  console.log(el.contract.name, el.contract.strategies);
}
```

Each `ExtractedElement` contains:

- `tag`: HTML tag name
- `role`: Computed ARIA role
- `name` / `text`: Accessible name and visible text
- `attributes`: Collected HTML/ARIA attributes (`id`, `testId`, `ariaLabel`, etc.)
- `bbox`: Bounding box position and dimensions
- `contract`: Auto-generated `LocatorContract` with multi-strategy definitions

### Extraction options

```typescript
interface ExtractOptions {
  /** Custom CSS selector to override the default interactive element selector */
  selector?: string;
  /** Whether to include hidden elements (default: false) */
  includeHidden?: boolean;
  /** Whether to validate uniqueness for each strategy via count() (default: true) */
  validateUniqueness?: boolean;
}
```

Example with options:

```typescript
const elements = await extractContracts(page, {
  selector: 'button, a',        // Only extract buttons and links
  includeHidden: true,          // Include invisible elements
  validateUniqueness: false,    // Skip uniqueness validation (faster)
});
```

### Auto-generated strategy hierarchy

The extractor generates strategies following the same five-level hierarchy:

| Level | Strategy | Source |
|-------|----------|--------|
| 1 | `role` + name | ARIA role with `aria-label`, text content, or `name` attribute |
| 1 | `testId` | `data-testid` attribute |
| 2 | `label` | `aria-label` attribute |
| 2 | `placeholder` | `placeholder` attribute |
| 2 | `title` | `title` attribute |
| 2 | `alt` | `alt` attribute on images |
| 3 | `text` | Visible text content (exact match for short text) |
| 5 | `css` | `#id` or `[data-testid="..."]` |
| 5 | `xpath` | `//tag[@id='...']` |

### Manual vs. automatic: complementary approaches

| Approach | Use when | Benefits |
|----------|----------|----------|
| **Manual contracts** | You need precise control over scoping, naming, and strategy ordering | Explicit intent, stable over time, self-documenting |
| **Auto-extraction** | Rapid prototyping, bulk scanning, or generating starter contracts | Fast, comprehensive, discovers elements you might miss |

A typical workflow: use `extractContracts` to discover elements, then curate and refine the generated contracts into version-controlled contract files.

---

## The five-level strategy hierarchy

Strategies are tried in ascending level order. The first strategy that matches **exactly one visible element** wins.

| Level | Kind | Description | Resilience |
|-------|------|-------------|------------|
| 1 | `role` | ARIA role + accessible name | Highest |
| 1 | `testId` | `data-testid` attribute | High (parallel primary) |
| 2 | `label` | `<label>` associated with form control | High |
| 2 | `placeholder` | Input placeholder text | High |
| 2 | `title` | `title` attribute | Medium-high |
| 2 | `alt` | `alt` attribute on images | Medium-high |
| 3 | `text` | Visible text content | Medium |
| 4 | `scopedRole` | Role inside a **named** container (`aria-label`) | Medium |
| 4 | `filterHasText` | Role inside a container found by the **text it contains** | Medium |
| 5 | `css` | CSS selector | Low (fallback) |
| 5 | `xpath` | XPath expression | Low (fallback) |

---

## API reference

### `findLocator(page, contract)` — primary API

Resolves a `LocatorContract` and returns a plain Playwright `Locator`. This is the clean, article-style API for everyday test code.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | `Page` | The Playwright page to resolve against |
| `contract` | `LocatorContract` | The locator contract to resolve |

**Returns:** `Promise<Locator>`

```typescript
const submitButton = await findLocator(page, submitOrderButtonContract);
await submitButton.click();
```

**Throws:** `Error` if no strategy produces a unique visible element.

---

### `resolveLocator(page, contract, options?)` — diagnostic API

Same resolution logic as `findLocator`, but also returns the matched strategy level. Use this when you want to inspect or assert which confidence level resolved the element (e.g. for CI diagnostics or debugging).

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | `Page` | The Playwright page to resolve against |
| `contract` | `LocatorContract` | The locator contract to resolve |
| `options` | `ResolveOptions` | Optional: `timeout`, `verbose` |

**Returns:** `Promise<ResolveResult>`

```typescript
interface ResolveResult {
  locator: Locator;             // The resolved Playwright Locator
  matchedStrategy: StrategyDef; // Which strategy was used
  level: 1 | 2 | 3 | 4 | 5;   // Confidence level of the match
}
```

```typescript
const result = await resolveLocator(page, submitOrderButtonContract, { verbose: true });
expect(result.level).toBeLessThanOrEqual(2); // assert high-confidence resolution
await result.locator.click();
```

**Throws:** `Error` if no strategy produces a unique visible element.

---

### `LocatorContract`

The core data structure describing how to find an element.

```typescript
interface LocatorContract {
  name: string;            // Human-readable name (used in error messages)
  frame?: string;          // CSS selector for an iframe (optional)
  scope?: ScopeDef[];      // Ordered context narrowing steps (optional)
  strategies: [StrategyDef, ...StrategyDef[]]; // At least one strategy required
}
```

---

### `ScopeDef`

Narrows the search context before strategies are evaluated.

```typescript
type ScopeDef =
  | { kind: 'role';   role: string; name?: string | RegExp }
  | { kind: 'testId'; value: string }
  | { kind: 'css';    value: string };
```

---

### `StrategyDef`

A single locating strategy at a given confidence level.

```typescript
// Level 1 — highest confidence
{ level: 1; kind: 'role';   role: string; name: string | RegExp }
{ level: 1; kind: 'testId'; value: string }

// Level 2 — explicit control semantics
{ level: 2; kind: 'label';       value: string | RegExp }
{ level: 2; kind: 'placeholder'; value: string | RegExp }
{ level: 2; kind: 'title';       value: string | RegExp }
{ level: 2; kind: 'alt';         value: string | RegExp }

// Level 3 — visible text
{ level: 3; kind: 'text'; value: string | RegExp; exact?: boolean }

// Level 4 — scoped role (two sub-kinds)
{ level: 4; kind: 'scopedRole';
  containerRole: string; containerName?: string | RegExp; // container has aria-label
  targetRole: string;    targetName: string | RegExp }

{ level: 4; kind: 'filterHasText';
  containerRole: string; hasText: string | RegExp;        // container has no aria-label needed
  targetRole: string;    targetName: string | RegExp }

// Level 5 — implementation-detail fallback
{ level: 5; kind: 'css';   value: string }
{ level: 5; kind: 'xpath'; value: string }
```

---

### `ResolveOptions`

```typescript
interface ResolveOptions {
  timeout?: number;  // Per-strategy visibility check timeout (ms)
  verbose?: boolean; // Log each strategy attempt to console (default: false)
}
```

---

### `extractContracts(page, options?)`

Automatically extracts interactive and semantic elements from a page and generates multi-strategy `LocatorContract`s for each element.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | `Page` | The Playwright page to extract from |
| `options` | `ExtractOptions` | Optional: `selector`, `includeHidden`, `validateUniqueness` |

**Returns:** `Promise<ExtractedElement[]>`

```typescript
const elements = await extractContracts(page);
for (const el of elements) {
  const locator = await findLocator(page, el.contract);
  // Use the locator...
}
```

---

### `buildCandidate(root, strategy)`

Builds a Playwright `Locator` from a single `StrategyDef`. This is a lower-level API used internally by the resolver, exposed for advanced use cases where you need direct control over individual strategies.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `root` | `Page \| Locator \| FrameLocator` | The root context to search within |
| `strategy` | `StrategyDef` | A single strategy definition |

**Returns:** `Locator`

```typescript
import { buildCandidate } from 'playwright-locator-contract';

const locator = buildCandidate(page, { level: 1, kind: 'role', role: 'button', name: 'Submit' });
await locator.click();
```

---

### `ExtractedElement`

An element extracted from the page DOM, including its auto-generated locator contract.

```typescript
interface ExtractedElement {
  tag: string;                    // HTML tag name (lowercase)
  role?: string;                  // Computed ARIA role
  name?: string;                  // Accessible name
  text?: string;                  // Visible text content (truncated)
  attributes: ElementAttributes;  // { id?, testId?, ariaLabel?, placeholder?, title?, alt? }
  bbox?: BoundingBox;             // { x, y, width, height }
  contract: LocatorContract;      // Auto-generated contract with strategies
}
```

---

### `ExtractOptions`

```typescript
interface ExtractOptions {
  selector?: string;           // Custom CSS selector (overrides default)
  includeHidden?: boolean;     // Include hidden elements (default: false)
  validateUniqueness?: boolean; // Validate strategy uniqueness (default: true)
}
```

---

### `BoundingBox`

```typescript
interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

---

### `ElementAttributes`

```typescript
interface ElementAttributes {
  id?: string;
  testId?: string;
  ariaLabel?: string;
  placeholder?: string;
  title?: string;
  alt?: string;
}
```

---

## Recipes

### Scoping to a dialog

```typescript
const contract: LocatorContract = {
  name: 'Confirm button inside Payment dialog',
  scope: [
    { kind: 'role', role: 'dialog', name: 'Payment Confirmation' },
  ],
  strategies: [
    { level: 1, kind: 'role', role: 'button', name: 'Confirm' },
    { level: 1, kind: 'testId', value: 'confirm-btn' },
  ],
};
```

### Scoping to an iframe

```typescript
const contract: LocatorContract = {
  name: 'Submit button inside embedded checkout iframe',
  frame: '#checkout-frame',
  strategies: [
    { level: 1, kind: 'role', role: 'button', name: 'Pay Now' },
    { level: 1, kind: 'testId', value: 'pay-now-btn' },
  ],
};
```

### Dynamic contracts (e.g. per list row)

The `filterHasText` kind is designed for list rows, table rows, and cards — any container whose ARIA semantics don't include an explicit accessible name. It corresponds to the Playwright pattern:

```typescript
page.getByRole('listitem').filter({ hasText: 'MU5137' })
    .getByRole('button', { name: 'Book' })
```

As a contract:

```typescript
function bookFlightContract(flightNumber: string): LocatorContract {
  return {
    name: `Book button for flight ${flightNumber}`,
    strategies: [
      {
        level: 4,
        kind: 'filterHasText',
        containerRole: 'listitem',
        hasText: flightNumber,    // matches any listitem that contains this text
        targetRole: 'button',
        targetName: 'Book',
      },
      { level: 5, kind: 'css', value: `li[aria-label="${flightNumber}"] .book-btn` },
    ],
  };
}

const bookBtn = await findLocator(page, bookFlightContract('MU5137'));
await bookBtn.click();
```

Use `scopedRole` instead when the container has an explicit accessible name (`aria-label` / `aria-labelledby`), for example a named `dialog`, `region`, or `group`:

```typescript
{
  level: 4,
  kind: 'scopedRole',
  containerRole: 'group',
  containerName: 'Order Details',   // container must have aria-label="Order Details"
  targetRole: 'button',
  targetName: 'Submit Order',
}
```

### Verbose debugging

```typescript
const result = await resolveLocator(page, myContract, { verbose: true });
// Console output:
// [LocatorContract] "Submit Order button": applying scope { kind: 'role', ... }
// [LocatorContract] "Submit Order button": trying strategy { level: 1, kind: 'role', ... }
// [LocatorContract] "Submit Order button": resolved via level 1 strategy (role)
```

---

## Project structure

```
playwright-locator-contract/
├── src/
│   ├── types.ts              # All TypeScript type definitions
│   ├── locator-contract.ts   # Core findLocator / resolveLocator implementation
│   ├── extractor.ts          # DOM auto-extraction (extractContracts)
│   ├── contracts.ts          # Example LocatorContract definitions
│   └── index.ts              # Public API entry point
├── tests/
│   └── order-confirm.spec.ts # Example Playwright tests (6 tests)
├── demo-app/
│   ├── server.js             # Zero-dependency Node.js HTTP server
│   └── public/
│       ├── order-confirm.html   # Order confirmation dialog page
│       ├── flights-search.html  # Flight search + results page
│       └── payment-confirm.html # Payment confirmation dialog page
├── playwright.config.ts      # Playwright configuration (auto-starts demo-app)
├── tsconfig.json             # TypeScript configuration
├── package.json
└── .gitignore
```

---

## Running the examples

This repository includes a **built-in demo app** — three simple HTML pages served by a zero-dependency Node.js HTTP server. The Playwright configuration automatically starts and stops the server, so you don't need to run anything manually before the tests.

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers (first time only)
npx playwright install
```

### Running tests

```bash
# Run all tests in all configured browsers (headless)
npm test

# Run tests in Chromium only (faster for development)
npm run test:chromium

# Run tests with a visible browser window
npm run test:headed

# Open Playwright UI mode (interactive test explorer)
npm run test:ui

# Type-check the source without running tests
npm run typecheck
```

### What the tests cover

The 6 example tests cover three demo pages:

| Page | URL | What is tested |
|------|-----|----------------|
| Order confirmation | `/order/confirm` | Submit and cancel buttons inside a scoped dialog |
| Flight search | `/flights/search` | Form inputs, search, and per-row Book buttons using `filterHasText` |
| Payment confirmation | `/payment/confirm` | Confirm button inside a payment dialog |

A seventh test (`Locator contract debug mode`) demonstrates the `resolveLocator` diagnostic API and asserts that the Submit Order button resolves at level 1 (role-based, highest confidence).

### Demo app pages

The demo app is in `demo-app/` and serves static HTML pages on `http://localhost:3000`. You can also start it manually to explore the pages in a browser:

```bash
npm run serve
# → http://localhost:3000/order/confirm
# → http://localhost:3000/flights/search
# → http://localhost:3000/payment/confirm
```

---

## Recommended project conventions

Once you adopt this pattern, treat contracts as first-class test assets:

- **One contract file per page or feature** (e.g. `contracts/order.ts`, `contracts/flight.ts`)
- **One named export per important control**
- **Spec files import contracts** — never write raw selectors in test files
- **Use factories for dynamic contracts** (e.g. `bookFlightContract(flightNumber)`)
- **Prefer level 1–2 strategies first; add level 5 only as explicit fallback**

This creates a clean two-layer architecture:

```
┌─────────────────────────────────────────────┐
│  Business action layer  (spec files)        │
│  What the test is trying to do              │
├─────────────────────────────────────────────┤
│  Locator contract layer  (contract files)   │
│  How the element should be found            │
└─────────────────────────────────────────────┘
```

---

## Philosophy

The biggest mistake in UI automation is treating element location as a one-line implementation detail.

A better model:

- Prefer user-facing semantics (role, label, text)
- Prefer uniqueness over ambiguity
- Prefer explicit scope over global guessing
- Use test IDs as a strong parallel contract
- Reserve CSS, XPath, and index-based selection for controlled fallback

A locator contract doesn't eliminate fallback. It makes fallback **intentional**.

---

## License

MIT
