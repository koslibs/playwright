# @koslibs/playwright

## Unreleased

### Minor Changes

- Add `delay: 'manual'` with an exported `ManualMockController`: wait for the first
  matching request and release all current and future responses independently per
  registration. Preserve ordinary/numeric return types and infer a union for
  dynamic delays. Add bounded arrival waits, request cancellation and automatic
  fixture/context cleanup without delivering held success responses.

### Patch Changes

- Update the development dependencies `@koslibs/builder` and `@koslibs/configs`
  to `^3.0.0`. Replace the vulnerable Happy DOM toolchain with jsdom and refresh
  the lockfile to retain the patched `fast-uri` dependency.

## 1.0.1

### Patch Changes

- [#3](https://github.com/koslibs/playwright/pull/3) [`ffd8cc4`](https://github.com/koslibs/playwright/commit/ffd8cc48d438c3086ee0a77354b5a7255307c0de) Thanks [@holypower777](https://github.com/holypower777)! - Accept imported JSON mock responses by recursively allowing string values for response unions of multiple string literals. Preserve response structure, single literals, numeric and boolean types, request parameters and transport options. No casts or generated fixture declarations are required.

## 1.0.0

### Major Changes

- [`f834ae7`](https://github.com/koslibs/playwright/commit/f834ae7f6f32c3838fee66f1be93849fa8600d59) Thanks [@holypower777](https://github.com/holypower777)! - Introduce the independent Playwright CLI, test/configuration exports and typed API-mocking fixture. Browser tests have no runtime dependency on builder, API clients, Wails or application-specific data.

    Use @koslibs/builder 2 and @koslibs/configs 2 as development tooling, with @koslibs/builder as a development dependency for the Node.js library build, declarations, type checks and prepack. Default the shared Playwright configuration to the data-test-id attribute used by @koslibs/components.

### Patch Changes

- [#2](https://github.com/koslibs/playwright/pull/2) [`7a31a7a`](https://github.com/koslibs/playwright/commit/7a31a7a7cac7a24adc6ea2e04c445d39ddccd09c) Thanks [@holypower777](https://github.com/holypower777)! - Start the shared release workflow automatically on pushes and merges to main, matching the other koslibs packages. Keep manual runs available and skip automatic runs for release commits from github-actions[bot].

- [#1](https://github.com/koslibs/playwright/pull/1) [`10cac9b`](https://github.com/koslibs/playwright/commit/10cac9b463986538a1649c8716c105f9005892b9) Thanks [@holypower777](https://github.com/holypower777)! - Document how to check the package-owned Playwright version with koslibs-playwright --version.
