import { createPlaywrightConfig, devices } from './src/index.js';

export default createPlaywrightConfig({
    testDir: './tests/browser',
    fullyParallel: true,
    reporter: [['list']],
    use: { baseURL: 'http://127.0.0.1:6128' },
    webServer: {
        command: 'node tests/server.mjs',
        url: 'http://127.0.0.1:6128',
        reuseExistingServer: false,
    },
    projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }],
});
