/**
 * @file extractor.ts
 * @description DOM element extractor that automatically generates LocatorContracts
 * by scanning a page for interactive and semantic elements.
 *
 * @module extractor
 */

import type { Page } from '@playwright/test';
import type { ExtractedElement, ExtractOptions, RawElementData, StrategyDef } from './types';
import { buildCandidate } from './locator-contract';

// Default selector for interactive and semantic elements
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

/**
 * Infers the default ARIA role from an element's tag name.
 */
function inferRole(tag: string, inputType?: string): string {
  const roleMap: Record<string, string> = {
    button: 'button',
    a: 'link',
    select: 'combobox',
    textarea: 'textbox',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    img: 'img',
    label: 'label',
  };

  if (tag === 'input') {
    const inputRoleMap: Record<string, string> = {
      text: 'textbox',
      search: 'searchbox',
      tel: 'textbox',
      url: 'textbox',
      email: 'textbox',
      password: 'textbox',
      number: 'spinbutton',
      checkbox: 'checkbox',
      radio: 'radio',
      button: 'button',
      submit: 'button',
      reset: 'button',
      range: 'slider',
    };
    return inputRoleMap[inputType || 'text'] || 'textbox';
  }

  return roleMap[tag] || '';
}

/**
 * Collects DOM element data from the page.
 */
async function collectElements(
  page: Page,
  selector: string,
  includeHidden: boolean
): Promise<RawElementData[]> {
  return page.evaluate(
    ({ selector, includeHidden }) => {
      // Role inference function (must be defined inside evaluate)
      function inferRoleInBrowser(tag: string, inputType?: string): string {
        const roleMap: Record<string, string> = {
          button: 'button',
          a: 'link',
          select: 'combobox',
          textarea: 'textbox',
          h1: 'heading',
          h2: 'heading',
          h3: 'heading',
          h4: 'heading',
          h5: 'heading',
          h6: 'heading',
          img: 'img',
          label: 'label',
        };

        if (tag === 'input') {
          const inputRoleMap: Record<string, string> = {
            text: 'textbox',
            search: 'searchbox',
            tel: 'textbox',
            url: 'textbox',
            email: 'textbox',
            password: 'textbox',
            number: 'spinbutton',
            checkbox: 'checkbox',
            radio: 'radio',
            button: 'button',
            submit: 'button',
            reset: 'button',
            range: 'slider',
          };
          return inputRoleMap[inputType || 'text'] || 'textbox';
        }

        return roleMap[tag] || '';
      }

      const elements = document.querySelectorAll(selector);
      const results: Array<{
        tag: string;
        role: string;
        id: string;
        name: string;
        ariaLabel: string;
        placeholder: string;
        title: string;
        alt: string;
        testId: string;
        text: string;
        bbox: { x: number; y: number; width: number; height: number } | null;
      }> = [];

      elements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        const tag = htmlEl.tagName.toLowerCase();

        // Filter hidden elements
        if (!includeHidden) {
          if (rect.width === 0 || rect.height === 0) return;
          // Check offsetParent for non-body/html elements
          if (htmlEl.offsetParent === null && tag !== 'body' && tag !== 'html') {
            // Fixed position elements may have null offsetParent
            const style = window.getComputedStyle(htmlEl);
            if (style.position !== 'fixed' && style.position !== 'sticky') {
              return;
            }
          }
        }

        // Get role: first try attribute, then infer from tag
        let role = htmlEl.getAttribute('role') || '';
        if (!role) {
          const inputType = (htmlEl as HTMLInputElement).type;
          role = inferRoleInBrowser(tag, inputType);
        }

        results.push({
          tag,
          role,
          id: htmlEl.id || '',
          name: htmlEl.getAttribute('name') || '',
          ariaLabel: htmlEl.getAttribute('aria-label') || '',
          placeholder: htmlEl.getAttribute('placeholder') || '',
          title: htmlEl.getAttribute('title') || '',
          alt: htmlEl.getAttribute('alt') || '',
          testId: htmlEl.getAttribute('data-testid') || '',
          text: (htmlEl.textContent || '').trim().slice(0, 100),
          bbox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        });
      });

      return results;
    },
    { selector, includeHidden }
  );
}

/**
 * Builds locating strategies for a raw element.
 */
function buildStrategies(raw: RawElementData): StrategyDef[] {
  const strategies: StrategyDef[] = [];

  // Level 1: role + name
  if (raw.role) {
    const name = raw.ariaLabel || raw.text || raw.name;
    if (name) {
      strategies.push({ level: 1, kind: 'role', role: raw.role, name });
    }
  }

  // Level 1: testId
  if (raw.testId) {
    strategies.push({ level: 1, kind: 'testId', value: raw.testId });
  }

  // Level 2: label (ariaLabel)
  if (raw.ariaLabel) {
    strategies.push({ level: 2, kind: 'label', value: raw.ariaLabel });
  }

  // Level 2: placeholder
  if (raw.placeholder) {
    strategies.push({ level: 2, kind: 'placeholder', value: raw.placeholder });
  }

  // Level 2: title
  if (raw.title) {
    strategies.push({ level: 2, kind: 'title', value: raw.title });
  }

  // Level 2: alt
  if (raw.alt) {
    strategies.push({ level: 2, kind: 'alt', value: raw.alt });
  }

  // Level 3: text
  if (raw.text) {
    strategies.push({ level: 3, kind: 'text', value: raw.text, exact: raw.text.length < 20 });
  }

  // Level 5: css with #id
  if (raw.id) {
    strategies.push({ level: 5, kind: 'css', value: `#${raw.id}` });
  }

  // Level 5: css with data-testid
  if (raw.testId) {
    strategies.push({ level: 5, kind: 'css', value: `[data-testid="${raw.testId}"]` });
  }

  // Level 5: xpath with id
  if (raw.id) {
    strategies.push({ level: 5, kind: 'xpath', value: `//${raw.tag}[@id='${raw.id}']` });
  }

  return strategies;
}

/**
 * Extracts interactive and semantic elements from a page and generates
 * multi-strategy LocatorContracts for each element.
 *
 * @param page - The Playwright Page to extract elements from
 * @param options - Optional extraction configuration
 * @returns Array of extracted elements with auto-generated contracts
 */
export async function extractContracts(
  page: Page,
  options?: ExtractOptions
): Promise<ExtractedElement[]> {
  const selector = options?.selector || DEFAULT_SELECTOR;
  const includeHidden = options?.includeHidden ?? false;
  const validateUniqueness = options?.validateUniqueness ?? true;

  // 1. Collect DOM elements
  const rawElements = await collectElements(page, selector, includeHidden);

  // 2. Build strategies and assemble ExtractedElement for each
  const results: ExtractedElement[] = [];

  for (const raw of rawElements) {
    const strategies = buildStrategies(raw);
    if (strategies.length === 0) continue; // Skip elements with no strategies

    // Sort by level ascending
    strategies.sort((a, b) => a.level - b.level);

    // 3. Validate uniqueness
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

    const contractName = raw.ariaLabel || raw.text || `<${raw.tag}>`;

    results.push({
      tag: raw.tag,
      role: raw.role || undefined,
      name: raw.ariaLabel || raw.name || undefined,
      text: raw.text || undefined,
      attributes: {
        id: raw.id || undefined,
        testId: raw.testId || undefined,
        ariaLabel: raw.ariaLabel || undefined,
        placeholder: raw.placeholder || undefined,
        title: raw.title || undefined,
        alt: raw.alt || undefined,
      },
      bbox: raw.bbox || undefined,
      contract: {
        name: contractName,
        strategies: strategies as [StrategyDef, ...StrategyDef[]],
      },
    });
  }

  return results;
}
