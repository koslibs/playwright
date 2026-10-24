import type { Page } from '../../dist/index.js';
import {
    expect,
    test,
    installMockApi,
    type ManualMockController,
} from '../../dist/mock-api/index.js';

import empty from './mock/manual-delay/read-empty-204.json' with { type: 'json' };
import held from './mock/manual-delay/read-held-201.json' with { type: 'json' };
import next from './mock/manual-delay/read-next-200.json' with { type: 'json' };
import second from './mock/manual-delay/read-second-200.json' with { type: 'json' };
import unavailable from './mock/manual-delay/read-unavailable-503.json' with { type: 'json' };

test.use({ apiURL: /^https:\/\/(?:api|other)\.example\.test\// });

export const read = Object.assign(async (_params: { id: number }) => ({ data: { name: '' } }), {
    describeRequest: ({ id }: { id: number }) => ({
        url: `https://api.example.test/items/${id}`,
        method: 'GET',
        headers: {},
    }),
});

declare global {
    interface Window {
        manualPopup: Window | null;
        manualRequests: {
            abort: AbortController;
            settled: boolean;
            result: Promise<{ status: number; body: string } | string>;
        }[];
    }
}

// Keep the actual fetches in the browser, including their cancellation and results.
const startRequests = async (page: Page, requestIds: number[]) => {
    const arrivals = requestIds.map((id, index) =>
        page.waitForRequest(`https://api.example.test/items/${id}?request=${index}`)
    );
    await page.evaluate((ids) => {
        window.manualRequests = ids.map((id, index) => {
            const abort = new AbortController();
            const entry = {
                abort,
                settled: false,
                result: fetch(`https://api.example.test/items/${id}?request=${index}`, {
                    signal: abort.signal,
                })
                    .then(async (response) => ({
                        status: response.status,
                        body: await response.text(),
                    }))
                    .catch((error: Error) => error.name)
                    .finally(() => {
                        entry.settled = true;
                    }),
            };
            return entry;
        });
    }, requestIds);
    await Promise.all(arrivals);
};

const results = (page: Page) =>
    page.evaluate(() => Promise.all(window.manualRequests.map((entry) => entry.result)));

const pending = (page: Page) =>
    page.evaluate(() => window.manualRequests.map((entry) => entry.settled));

test('manual mock holds the response until release', async ({ page, mockApi }) => {
    const controller = await mockApi(read, {
        params: { id: 1 },
        response: held,
        status: 201,
        delay: 'manual',
    });

    await page.goto('/');
    const response = page.evaluate(async () => {
        document.body.textContent = 'loading';
        const result = await fetch('https://api.example.test/items/1');
        document.body.textContent = 'loaded';
        return { status: result.status, body: await result.json() };
    });
    await controller.waitForRequest();

    await expect(page.locator('body')).toHaveText('loading');

    controller.release();

    expect(await response).toEqual({ status: 201, body: { name: 'held' } });
    await expect(page.locator('body')).toHaveText('loaded');
});

test('manual mock holds the first navigation of a popup until release', async ({
    page,
    mockApi,
}) => {
    const controller = await mockApi(read, {
        params: { id: 1 },
        response: held,
        delay: 'manual',
    });

    await page.goto('/');
    const popupOpened = page.waitForEvent('popup');
    await page.evaluate(() => {
        window.open('https://api.example.test/items/1');
    });
    await controller.waitForRequest();

    controller.release();

    const popup = await popupOpened;
    await popup.waitForLoadState();
    expect(await popup.locator('body').textContent()).toContain('{"name":"held"}');
});

test('closing a popup before its first response cancels the held navigation', async ({
    page,
    context,
    mockApi,
}) => {
    const controller = await mockApi(read, {
        params: { id: 1 },
        response: held,
        delay: 'manual',
    });

    await page.goto('/');
    await page.evaluate(() => {
        window.manualPopup = window.open('https://api.example.test/items/1');
    });
    await controller.waitForRequest();
    const failed = context.waitForEvent('requestfailed');
    await page.evaluate(() => window.manualPopup?.close());

    expect((await failed).url()).toBe('https://api.example.test/items/1');
    await context.unrouteAll({ behavior: 'wait' });
    controller.release();
});

test('waitForRequest before and after arrival observes the same first request', async ({
    page,
    mockApi,
}) => {
    const controller = await mockApi(read, { params: { id: 1 }, response: held, delay: 'manual' });
    const before = [controller.waitForRequest(), controller.waitForRequest()];

    await page.goto('/');
    await startRequests(page, [1]);
    await Promise.all(before);
    await controller.waitForRequest();
    await controller.waitForRequest();

    expect(await pending(page)).toEqual([false]);

    controller.release();

    expect(await results(page)).toEqual([{ status: 200, body: '{"name":"held"}' }]);
});

test('early and repeated release keeps future requests immediate', async ({ page, mockApi }) => {
    const controller = await mockApi(read, { params: { id: 1 }, response: held, delay: 'manual' });
    controller.release();
    controller.release();

    await page.goto('/');
    await startRequests(page, [1, 1]);
    await controller.waitForRequest();

    expect(await results(page)).toEqual([
        { status: 200, body: '{"name":"held"}' },
        { status: 200, body: '{"name":"held"}' },
    ]);
});

test('two held requests and immediate requests after release', async ({ page, mockApi }) => {
    const controller = await mockApi(read, { params: { id: 1 }, response: held, delay: 'manual' });

    await page.goto('/');
    await startRequests(page, [1, 1]);
    await controller.waitForRequest();

    expect(await pending(page)).toEqual([false, false]);

    controller.release();

    expect(await results(page)).toEqual([
        { status: 200, body: '{"name":"held"}' },
        { status: 200, body: '{"name":"held"}' },
    ]);

    await startRequests(page, [1]);

    expect(await results(page)).toEqual([{ status: 200, body: '{"name":"held"}' }]);
});

test('independent manual registrations and immediate mocks', async ({ page, mockApi }) => {
    const first = await mockApi(read, { params: { id: 1 }, response: held, delay: 'manual' });
    const other = await mockApi(read, { params: { id: 2 }, response: second, delay: 'manual' });
    await mockApi(read, { params: { id: 3 }, response: next });

    await page.goto('/');
    await startRequests(page, [1, 2, 3]);
    await Promise.all([first.waitForRequest(), other.waitForRequest()]);
    await page.evaluate(() => window.manualRequests[2].result);
    first.release();
    await page.evaluate(() => window.manualRequests[0].result);

    expect(await pending(page)).toEqual([true, false, true]);

    other.release();

    expect(await results(page)).toEqual([
        { status: 200, body: '{"name":"held"}' },
        { status: 200, body: '{"name":"second"}' },
        { status: 200, body: '{"name":"next"}' },
    ]);
});

test('manual errors and empty 204', async ({ page, mockApi }) => {
    const error = await mockApi(read, {
        params: { id: 1 },
        response: unavailable,
        status: 503,
        delay: 'manual',
    });
    const noContent = await mockApi(read, {
        params: { id: 2 },
        response: empty,
        status: 204,
        delay: 'manual',
    });

    await page.goto('/');
    await startRequests(page, [1, 2]);
    await Promise.all([error.waitForRequest(), noContent.waitForRequest()]);

    expect(await pending(page)).toEqual([false, false]);

    error.release();
    noContent.release();

    expect(await results(page)).toEqual([
        { status: 503, body: '{"code":"UNAVAILABLE"}' },
        { status: 204, body: '' },
    ]);
});

test('waitForRequest timeout does not release the response', async ({ page, mockApi }) => {
    const controller = await mockApi(read, { params: { id: 1 }, response: held, delay: 'manual' });

    await expect(controller.waitForRequest({ timeout: 25 })).rejects.toThrow(
        /GET.*https:\/\/api.example.test\/items\/1.*25/
    );
    await page.goto('/');
    await startRequests(page, [1]);
    await controller.waitForRequest();

    expect(await pending(page)).toEqual([false]);

    controller.release();

    expect(await results(page)).toEqual([{ status: 200, body: '{"name":"held"}' }]);
});

for (const timeout of [0, -1, NaN, Infinity]) {
    test(`waitForRequest rejects invalid timeout ${timeout}`, async ({ mockApi }) => {
        const controller = await mockApi(read, {
            params: { id: 1 },
            response: held,
            delay: 'manual',
        });

        await expect(controller.waitForRequest({ timeout })).rejects.toThrow(/finite positive/i);

        controller.release();
    });
}

test('replacement preserves the held response', async ({ page, mockApi }) => {
    const original = await mockApi(read, { params: { id: 1 }, response: held, delay: 'manual' });

    await page.goto('/');
    await startRequests(page, [1]);
    await original.waitForRequest();
    await mockApi(read, { params: { id: 1 }, response: next });

    expect(
        await page.evaluate(() => fetch('https://api.example.test/items/1').then((r) => r.json()))
    ).toEqual({ name: 'next' });
    expect(await pending(page)).toEqual([false]);

    original.release();

    expect(await results(page)).toEqual([{ status: 200, body: '{"name":"held"}' }]);
});

test('aborting one held request keeps another pending', async ({ page, context, mockApi }) => {
    const controller = await mockApi(read, { params: { id: 1 }, response: held, delay: 'manual' });
    const responses: string[] = [];
    page.on('response', (response) => responses.push(response.url()));

    await page.goto('/');
    await startRequests(page, [1, 1]);
    await controller.waitForRequest();
    const failed = page.waitForEvent('requestfailed');
    await page.evaluate(() => window.manualRequests[0].abort.abort());
    await failed;
    await controller.waitForRequest();

    expect(await page.evaluate(() => window.manualRequests[0].result)).toBe('AbortError');
    expect(await pending(page)).toEqual([true, false]);

    controller.release();

    expect(await results(page)).toEqual(['AbortError', { status: 200, body: '{"name":"held"}' }]);
    expect(responses.filter((url) => url.includes('/items/1?request='))).toEqual([
        'https://api.example.test/items/1?request=1',
    ]);

    // Completed callbacks must also leave Playwright's route lifecycle settled.
    await context.unrouteAll({ behavior: 'wait' });
});

test('matching excludes preflight and unrelated requests', async ({ page, mockApi }) => {
    const write = Object.assign(async (_params: { name: string }) => ({ data: { name: '' } }), {
        describeRequest: (body: { name: string }) => ({
            url: 'https://api.example.test/items?state=active',
            method: 'POST',
            headers: { 'X-Key': 'key' },
            body,
        }),
    });
    const controller = await mockApi(write, {
        params: { name: 'valid' },
        response: held,
        delay: 'manual',
    });
    await mockApi(read, { params: { id: 2 }, response: second });
    const waiting = controller.waitForRequest();
    let arrived = false;
    const observed = waiting.then(
        () => {
            arrived = true;
        },
        () => {}
    );

    await page.goto('/');
    const rejected = await page.evaluate(async () => {
        const send = (url: string, method: string, body?: string, key = 'key') =>
            fetch(url, {
                method,
                headers: { 'X-Key': key, 'Content-Type': 'application/json' },
                body,
            })
                .then((r) => r.status)
                .catch(() => null);
        return [
            await send('https://api.example.test/items?state=active', 'OPTIONS'),
            await send('https://api.example.test/items?state=active', 'GET'),
            await send('https://api.example.test/items?state=wrong', 'POST', '{"name":"valid"}'),
            await send('https://api.example.test/items?state=active', 'POST', '{"name":"wrong"}'),
            await send(
                'https://api.example.test/items?state=active',
                'POST',
                '{"name":"valid"}',
                'wrong'
            ),
            await send('https://api.example.test/other?state=active', 'POST', '{"name":"valid"}'),
            await send('https://other.example.test/items?state=active', 'POST', '{"name":"valid"}'),
            await fetch('https://api.example.test/items/2').then((r) => r.status),
        ];
    });

    expect(rejected).toEqual([204, null, null, null, null, null, null, 200]);
    expect(arrived).toBe(false);

    const response = page.evaluate(() =>
        fetch('https://api.example.test/items?state=active&extra=1', {
            method: 'POST',
            headers: { 'X-Key': 'key', 'Content-Type': 'application/json' },
            body: '{"name":"valid"}',
        }).then((r) => r.json())
    );
    await waiting;
    await observed;
    controller.release();

    expect(await response).toEqual({ name: 'held' });
});

test('direct install closes pending and future waiters with its context', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const { mockApi } = await installMockApi(context, 'https://api.example.test/**');
    const unseen = await mockApi(read, { params: { id: 2 }, response: second, delay: 'manual' });
    const active = await mockApi(read, { params: { id: 1 }, response: held, delay: 'manual' });
    const closed = expect(unseen.waitForRequest()).rejects.toThrow(/closed.*GET.*items\/2/i);
    const page = await context.newPage();

    await page.goto('http://127.0.0.1:6128');
    await startRequests(page, [1]);
    await active.waitForRequest();
    await context.close();

    await closed;
    await expect(unseen.waitForRequest()).rejects.toThrow(/closed/i);
    expect(() => {
        unseen.release();
        active.release();
    }).not.toThrow();
});

test('closing a page cancels only its held requests', async ({ context, page, mockApi }) => {
    const controller = await mockApi(read, { params: { id: 1 }, response: held, delay: 'manual' });
    const other = await context.newPage();

    await page.goto('/');
    await other.goto('http://127.0.0.1:6128');
    await startRequests(page, [1]);
    await startRequests(other, [1]);
    await controller.waitForRequest();
    await page.close();

    expect(await pending(other)).toEqual([false]);

    controller.release();

    expect(await results(other)).toEqual([{ status: 200, body: '{"name":"held"}' }]);

    await context.unrouteAll({ behavior: 'wait' });
});

test('explicit disposal aborts held requests without delivering a success', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
        const { mockApi, dispose } = await installMockApi(context, 'https://api.example.test/**');
        const controller = await mockApi(read, {
            params: { id: 1 },
            response: held,
            delay: 'manual',
        });
        const unseen = await mockApi(read, {
            params: { id: 2 },
            response: second,
            delay: 'manual',
        });
        const closed = expect(unseen.waitForRequest()).rejects.toThrow(/closed/i);
        const page = await context.newPage();

        await page.goto('http://127.0.0.1:6128');
        await startRequests(page, [1]);
        await controller.waitForRequest();
        dispose();
        dispose();
        controller.release();

        await closed;
        expect(await results(page)).toEqual(['TypeError']);
        await expect(unseen.waitForRequest()).rejects.toThrow(/closed/i);
        await context.unrouteAll({ behavior: 'wait' });
    } finally {
        await context.close();
    }
});

test.describe('fixture cleanup', () => {
    test.describe.configure({ mode: 'serial' });
    let waiting: Promise<unknown>;
    let previous: ManualMockController;

    test('leaves held requests and arrival waiters without release', async ({ page, mockApi }) => {
        previous = await mockApi(read, { params: { id: 2 }, response: second, delay: 'manual' });
        waiting = previous.waitForRequest().catch((error: unknown) => error);
        const heldRequest = await mockApi(read, {
            params: { id: 1 },
            response: held,
            delay: 'manual',
        });

        await page.goto('/');
        await startRequests(page, [1]);
        await heldRequest.waitForRequest();

        expect(await pending(page)).toEqual([false]);
    });

    test('the following test has clean state and previous waiters are closed', async ({
        page,
        mockApi,
    }) => {
        expect(await waiting).toBeInstanceOf(Error);
        expect(String(await waiting)).toMatch(/closed/i);
        expect(() => previous.release()).not.toThrow();
        await mockApi(read, { params: { id: 1 }, response: next });

        await page.goto('/');
        await startRequests(page, [1]);

        expect(await results(page)).toEqual([{ status: 200, body: '{"name":"next"}' }]);
    });
});
