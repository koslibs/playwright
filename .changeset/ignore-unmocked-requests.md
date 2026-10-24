---
'@koslibs/playwright': minor
---

Add delay: 'manual' and export ManualMockController. waitForRequest observes the first matching request with a configurable positive finite timeout (5000 ms by default); release opens all current and future responses for this registration. Preserve ordinary and numeric-delay return types, request matching and JSON typing, and infer a union for dynamic delays. Keep held responses bound to their original registration and clean up cancelled requests, fixture waits and closed contexts without delivering prepared successes.

Update the development dependencies @koslibs/builder and @koslibs/configs to ^3.0.0, replacing the vulnerable Happy DOM toolchain with jsdom. Refresh the lockfile with patched transitive dependencies and align reusable configs workflows with v3.0.0.

Complete cancelled manual routes without aborting an already destroyed popup target, avoiding teardown errors in Linux WebKit while still aborting live requests during disposal.
