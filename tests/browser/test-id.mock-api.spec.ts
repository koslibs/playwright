import { expect, test } from '../../dist/mock-api/index.js';

test.use({ apiURL: 'https://api.example.test/**' });

test('mock API fixtures inherit getAllByTestId', async ({ page }) => {
    await page.setContent(`
        <div data-test-id="card">One</div>
        <div data-test-id="card">Two</div>
    `);
    await expect(page.getAllByTestId('card')).toHaveCount(2);
    await expect(page.getAllByTestId('card')).toHaveText(['One', 'Two']);
});
