import { test as base } from '../test.js';

import { installMockApi, type ApiURL, type MockApi } from './mock-api.js';

type Fixtures = {
    apiURL: ApiURL | undefined;
    mockApi: MockApi;
};

export const test = base.extend<Fixtures>({
    serviceWorkers: 'block',
    apiURL: [undefined, { option: true }],
    mockApi: [
        async ({ context, apiURL, serviceWorkers }, use) => {
            if (!apiURL) throw new Error('Configure test.use({ apiURL }) to enable API mocks');
            if (serviceWorkers !== 'block') {
                throw new Error('Configure serviceWorkers: block when using API mocks');
            }
            const { mockApi } = await installMockApi(context, apiURL);
            // Keep interception active until Playwright closes the context.
            await use(mockApi);
        },
        { auto: true },
    ],
});

export { expect } from '@playwright/test';
export {
    installMockApi,
    type ApiRequestDescription,
    type ApiURL,
    type MockApi,
    type MockOptions,
} from './mock-api.js';
