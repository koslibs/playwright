---
'@koslibs/playwright': minor
---

Ignore API requests without matching mocks by default instead of failing tests at fixture teardown. Unmatched requests remain aborted without contacting the real backend; registered mocks and optional installMockApi diagnostics are unchanged.

Add page.getAllByTestId to plain and API-mocking test fixtures. It returns a live Locator, uses the configured test ID attribute and retains Playwright assertion retries, filtering and nth selection.
