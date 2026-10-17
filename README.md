# @koslibs/playwright

Independent Playwright runner, shared configuration and typed API mocks. Requires
Node.js 24.13.0 or newer. The package depends on one pinned @playwright/test version;
it has no runtime dependency on @koslibs/builder, @koslibs/api, React or Wails.

```sh
npm install --save-dev @koslibs/playwright
```

Expose the package-owned CLI in the consuming project's package.json:

```json
{
    "scripts": {
        "test:e2e": "koslibs-playwright test",
        "test:e2e:open": "koslibs-playwright test --ui",
        "test:screenshots": "koslibs-playwright test --grep @screenshots"
    }
}
```

The CLI forwards all arguments and exit codes to the installed Playwright runner.
Use `koslibs-playwright install webkit` to install a browser or `koslibs-playwright
show-report` to open its report. Install browsers explicitly in CI as well.

## Configuration

```ts
import { createPlaywrightConfig, devices } from '@koslibs/playwright';

export default createPlaywrightConfig({
    testDir: './e2e',
    use: {
        baseURL: 'http://localhost:5173',
        serviceWorkers: 'block',
    },
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
    },
    projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }],
});
```

Configuration defaults include parallel execution, CI retries, HTML reports and
failure diagnostics. The helper uses Playwright's defineConfig composition.
The default test ID attribute is `data-test-id`, matching @koslibs/components:
`page.getByTestId('save')` finds an element with `data-test-id="save"`.
Override `use.testIdAttribute` when a consuming project uses another attribute.
The consuming project explicitly owns its server command, URL and browser selection.
For plain browser tests import `test` and `expect` from `@koslibs/playwright`.

## API mocks

Use the opt-in fixture entrypoint when every API request must be mocked:

```ts
import { test as base, expect } from '@koslibs/playwright/mock-api';

export const test = base.extend({
    apiURL: 'http://localhost:34121/**',
});
export { expect };
```

Register responses before navigation:

```ts
test('opens profiles', async ({ page, mockApi }) => {
    await mockApi(profilesApi.getProfiles, { params: {}, response: [] });
    await page.goto('/');
});
```

`apiURL` is required and accepts the same glob, RegExp or URL predicate as
BrowserContext.route. It defines the API boundary: requests matching it are
intercepted, while frontend assets stay on their ordinary transport. Unregistered
requests inside that boundary are aborted and fail the test at fixture teardown.
The fixture blocks service workers and remains active until context disposal.

The API method must expose `describeRequest(params, transport?)`, returning
`{ url, method, body?, headers }`. Methods from @koslibs/api 1.0.0 or newer satisfy this contract structurally. The fixture never calls the
transport method and never imports the API runtime.

Parameters, successful responses and required transport/extender parameters are
inferred from the method. Query matching permits extra parameters; method, origin,
path and declared headers must match. JSON bodies are compared structurally;
string bodies are compared verbatim. Multipart contents are not compared.

The newest matching registration wins and remains available for repeated calls:

```ts
await mockApi(profilesApi.getProfiles, {
    params: { status: 'active' },
    response: [],
    delay: 500,
});

await mockApi(profilesApi.getProfiles, {
    params: {},
    response: { code: 'UNAVAILABLE' },
    status: 503,
});
```

Each test has an isolated registry. Application defaults, authentication bindings,
Wails stubs, factories and mutation state belong in the application's own fixtures.
Use an automatic application fixture depending on mockApi to register startup
responses before each test, then export the extended test to application specs.

## Migration from builder/configs

- Replace @koslibs/builder/playwright imports with @koslibs/playwright.
- Replace @koslibs/configs/playwright imports with @koslibs/playwright.
- Replace builder's createBrowserTestConfig with createPlaywrightConfig and explicit
  webServer/baseURL settings; no builder configuration is read automatically.
- Replace builder ui/lib test:e2e and test:screenshots commands with
  koslibs-playwright test and native filename/tag filters.
- Add @koslibs/playwright directly to each browser-test consumer's devDependencies.
- Keep application-specific mocks in the consuming repository.

## Development and release

@koslibs/builder 2 and @koslibs/configs 2 are development dependencies. The builder builds the Node.js ESM library
and declarations and checks source and test types. `prepack` runs the same build.
Consumers install only the Playwright runtime dependencies.

Run `npm ci`, `npm run build`, `npm run typecheck`, `npm test`, and `npm run lint`.
Run `node bin/playwright.js install webkit` before browser tests on a new machine.
Changesets and release commands use @koslibs/configs. Publishing requires an explicit
release command or manually triggered release workflow; no release occurs on push.

After merging to main, run the Release workflow manually. It uses the reusable
configs v2.0.0 workflow and installs WebKit before validation. Changesets prepares
the initial 1.0.0 version from the pending major changeset; do not pre-bump the
package version before running this workflow. The CLI release commands remain
available for a manual local release.
