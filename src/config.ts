import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';

export const playwrightConfig: PlaywrightTestConfig = {
    testDir: './playwright',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never' }]]
        : [['html', { open: 'never' }]],
    use: {
        testIdAttribute: 'data-test-id',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
};

export const createPlaywrightConfig = (
    overrides: PlaywrightTestConfig = {}
): PlaywrightTestConfig => defineConfig(playwrightConfig, overrides);
