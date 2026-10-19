import { expect, test } from '../../dist/index.js';

test('getAllByTestId finds all exact test IDs and supports locator operations', async ({
    page,
}) => {
    await page.setContent(`
        <button data-test-id="card">First</button>
        <button data-test-id="card">Second</button>
        <button data-test-id="card-extra">Extra</button>
        <button data-testid="card">Different attribute</button>
        <button data-test-id='card"quoted'>Quoted</button>
    `);

    const cards = page.getAllByTestId('card');
    await expect(cards).toHaveCount(2);
    await expect(cards).toHaveText(['First', 'Second']);
    await expect(cards.nth(1)).toHaveText('Second');
    await expect(cards.filter({ hasText: 'First' })).toHaveCount(1);
    await expect(page.getAllByTestId(/^card/)).toHaveCount(4);
    await expect(page.getAllByTestId('card"quoted')).toHaveText('Quoted');
    await expect(page.getAllByTestId('missing')).toHaveCount(0);
});

test('getAllByTestId stays live and assertions wait for added elements', async ({ page }) => {
    const cards = page.getAllByTestId('card');
    await page.setContent('<main></main>');
    await expect(cards).toHaveCount(0);

    await page.evaluate(() => {
        window.setTimeout(() => {
            document.querySelector('main')!.innerHTML =
                '<div data-test-id="card">One</div><div data-test-id="card">Two</div>';
        }, 100);
    });
    await expect(cards).toHaveCount(2);
    await page.evaluate(() => document.querySelector('[data-test-id="card"]')!.remove());
    await expect(cards).toHaveCount(1);
});

test.describe('custom test ID attribute', () => {
    test.use({ testIdAttribute: 'data-qa' });

    test('getAllByTestId follows the same attribute as getByTestId', async ({ page }) => {
        await page.setContent(`
            <div data-qa="card">One</div>
            <div data-qa="card">Two</div>
            <div data-test-id="card">Default attribute</div>
        `);
        await expect(page.getAllByTestId('card')).toHaveCount(2);
        await expect(page.getAllByTestId('card')).toHaveText(['One', 'Two']);
        await expect(page.getByTestId('card')).toHaveCount(2);
    });
});
