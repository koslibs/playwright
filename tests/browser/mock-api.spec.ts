import { expect, test, installMockApi } from '../../dist/mock-api/index.js';

test.use({ apiURL: 'https://api.example.test/**' });

const read = Object.assign(
    async (_params: { id: number; state?: string }) => ({ data: { name: '' } }),
    {
        describeRequest: ({ id, state }: { id: number; state?: string }) => ({
            url: `https://api.example.test/items/${id}${state ? `?state=${state}` : ''}`,
            method: 'GET',
            headers: {},
        }),
    }
);

test('mocks use the last matching registration and survive reloads', async ({ page, mockApi }) => {
    await mockApi(read, { params: { id: 1 }, response: { name: 'initial' } });
    await mockApi(read, { params: { id: 1 }, response: { name: 'latest' } });
    await mockApi(read, { params: { id: 2 }, response: { name: 'second' } });
    await page.goto('/');
    const load = () =>
        page.evaluate(async () => {
            const results = [];
            for (const id of [1, 2]) {
                const response = await fetch(`https://api.example.test/items/${id}`);
                results.push(await response.json());
            }
            return results;
        });
    expect(await load()).toEqual([{ name: 'latest' }, { name: 'second' }]);
    await page.reload();
    expect(await load()).toEqual([{ name: 'latest' }, { name: 'second' }]);
});

test('matches query subsets and responds to errors and preflights', async ({ page, mockApi }) => {
    await mockApi(read, { params: { id: 1, state: 'active' }, response: { name: 'active' } });
    await mockApi(read, {
        params: { id: 1, state: 'archived' },
        response: { code: 'UNAVAILABLE' },
        status: 503,
        delay: 20,
    });
    await page.goto('/');
    const result = await page.evaluate(async () => {
        const active = await fetch('https://api.example.test/items/1?extra=value&state=active', {
            headers: { 'X-Test': 'preflight' },
        });
        const archived = await fetch('https://api.example.test/items/1?state=archived');
        return {
            active: await active.json(),
            archived: await archived.json(),
            status: archived.status,
        };
    });
    expect(result).toEqual({
        active: { name: 'active' },
        archived: { code: 'UNAVAILABLE' },
        status: 503,
    });
});

test('mocks are isolated between tests', async ({ page, mockApi }) => {
    await mockApi(read, { params: { id: 1 }, response: { name: 'isolated' } });
    await page.goto('/');
    expect(
        await page.evaluate(() =>
            fetch('https://api.example.test/items/1').then((response) => response.json())
        )
    ).toEqual({ name: 'isolated' });
});

test('blocks unexpected methods, bodies and headers', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
        const { mockApi, unexpectedRequests } = await installMockApi(
            context,
            'https://api.example.test/**'
        );
        const write = Object.assign(async (_params: { name: string }) => ({ data: { ok: true } }), {
            describeRequest: (body: { name: string }) => ({
                url: 'https://api.example.test/items',
                method: 'POST',
                body,
                headers: { 'X-Key': 'key' },
            }),
        });
        await mockApi(write, { params: { name: 'valid' }, response: { ok: true } });
        const page = await context.newPage();
        await page.goto('http://127.0.0.1:6128');
        const results = await page.evaluate(async () => {
            const send = async (method: string, body?: string, key = 'key') =>
                fetch('https://api.example.test/items', {
                    method,
                    headers: { 'X-Key': key, 'Content-Type': 'application/json' },
                    body,
                })
                    .then(async (response) => await response.json())
                    .catch(() => null);
            return [
                await send('POST', '{"name":"valid"}'),
                await send('GET'),
                await send('POST', 'invalid JSON'),
                await send('POST', '{"name":"valid"}', 'wrong'),
            ];
        });
        expect(results).toEqual([{ ok: true }, null, null, null]);
        expect(unexpectedRequests).toHaveLength(3);
    } finally {
        await context.close();
    }
});
