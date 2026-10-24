import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { installMockApi } from '../dist/mock-api/index.js';

import held from './browser/mock/manual-delay/read-held-201.json' with { type: 'json' };

test('a cancelled popup whose target is gone completes manual route cleanup', async () => {
    const context = new EventEmitter();
    let handleRoute;
    context.route = async (_url, handler) => {
        handleRoute = handler;
    };
    let failure = null;
    let delivered = false;
    const url = 'https://api.example.test/items/1';
    const request = {
        url: () => url,
        method: () => 'GET',
        headers: () => ({}),
        isNavigationRequest: () => true,
        frame: () => {
            throw new Error('Frame for this navigation request is not available');
        },
        failure: () => failure,
    };
    const read = Object.assign(async (_params) => ({ data: { name: '' } }), {
        describeRequest: () => ({ url, method: 'GET', headers: {} }),
    });
    const { mockApi, dispose } = await installMockApi(context, 'https://api.example.test/**');
    try {
        const controller = await mockApi(read, { params: {}, response: held, delay: 'manual' });
        // Model the Linux WebKit protocol boundary after a popup has been destroyed.
        const handling = handleRoute({
            request: () => request,
            abort: async () => {
                throw new Error('route.abort: Target page, context or browser has been closed');
            },
            fallback: async () => {},
            fulfill: async () => {
                delivered = true;
            },
        });
        const completed = assert.doesNotReject(handling);
        await controller.waitForRequest();

        failure = { errorText: 'cancelled' };
        context.emit('requestfailed', request);

        await completed;
        controller.release();
        assert.equal(delivered, false);
        await controller.waitForRequest();
    } finally {
        dispose();
    }
});
