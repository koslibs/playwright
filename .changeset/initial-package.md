---
'@koslibs/playwright': major
---

Introduce the independent Playwright CLI, test/configuration exports and typed API-mocking fixture. Browser tests have no runtime dependency on builder, API clients, Wails or application-specific data.

Use @koslibs/builder 2 and @koslibs/configs 2 as development tooling, with @koslibs/builder as a development dependency for the Node.js library build, declarations, type checks and prepack. Default the shared Playwright configuration to the data-test-id attribute used by @koslibs/components.
