---
'@koslibs/playwright': patch
---

Accept imported JSON mock responses by recursively allowing string values for response unions of multiple string literals. Preserve response structure, single literals, numeric and boolean types, request parameters and transport options. No casts or generated fixture declarations are required.
