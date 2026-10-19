import { test as base, type Page as PlaywrightPage } from '@playwright/test';

export type TestPage = PlaywrightPage & {
    /** Returns a live locator for all matching test IDs, using the configured testIdAttribute. */
    getAllByTestId: PlaywrightPage['getByTestId'];
};

export const test = base.extend<{ page: TestPage }>({
    page: async ({ page }, use) => {
        await use(
            Object.assign(page, {
                getAllByTestId: page.getByTestId.bind(page),
            })
        );
    },
});
