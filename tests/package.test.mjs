import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createPlaywrightConfig } from '../dist/index.js';

test('merges caller configuration without modifying defaults', () => {
    const config = createPlaywrightConfig({
        use: { baseURL: 'http://example.test' },
        projects: [{ name: 'chosen' }],
    });
    assert.equal(config.use.baseURL, 'http://example.test');
    assert.equal(config.use.screenshot, 'only-on-failure');
    assert.equal(config.projects[0].name, 'chosen');
    assert.equal(createPlaywrightConfig().use.baseURL, undefined);
});

test('CLI forwards Playwright arguments and exit codes without builder or API dependencies', () => {
    const result = spawnSync(process.execPath, ['bin/playwright.js', '--version'], {
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const invalid = spawnSync(process.execPath, ['bin/playwright.js', 'invalid-command'], {
        encoding: 'utf8',
    });
    assert.notEqual(invalid.status, 0);
    const { dependencies } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
    assert.equal(result.stdout.trim(), 'Version ' + dependencies['@playwright/test']);
    assert.deepEqual(Object.keys(dependencies), ['@playwright/test']);
});
