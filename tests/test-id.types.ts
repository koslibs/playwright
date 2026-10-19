import { expect, test, type Locator, type Page, type TestPage } from '../dist/index.js';
import { test as mockTest } from '../dist/mock-api/index.js';

// These callbacks are compiled by test:types; this file is not collected as a browser test.
test('typed collection locator on a plain page', async ({ page }) => {
    const typedPage: TestPage = page;
    const locator: Locator = typedPage.getAllByTestId('card');
    await expect(locator).toHaveCount(3);
    await expect(page.getAllByTestId(/card/).nth(0)).toBeVisible();
    // @ts-expect-error test IDs must be strings or regular expressions
    page.getAllByTestId(123);
});

mockTest('typed collection locator on a mock API page', async ({ page }) => {
    const typedPage: TestPage = page;
    const locator: Locator = typedPage.getAllByTestId('card');
    await expect(locator).toHaveCount(3);
    // @ts-expect-error getAllByTestId returns a Locator, not an array
    expect(locator.length).toBe(3);
});

// Keep the native Page export compatible with pages created outside fixtures.
export const checkNativePage = (page: Page) => {
    const locator: Locator = page.getByTestId('card');
    return locator;
};
