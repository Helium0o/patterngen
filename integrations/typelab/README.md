# TypeLab integration

Everything needed to add texturelib's 52 patterns to TypeLab's Pattern workspace.
**Full guide: [../../TYPELAB_INTEGRATION.md](../../TYPELAB_INTEGRATION.md).**

| file | purpose |
|---|---|
| `texturelib-typelab.js` | The adapter (classic script). Registers `tx-*` generators in `TL.patterns`; renders on workers in the live view, exactly for exports. |
| `install.mjs` | `node install.mjs <typelab-root>`: copies the bundle, worker and adapter, adds the script tags and 3 small UI tweaks. Idempotent. |
| `verify-in-typelab.mjs` | `NODE_PATH=$(npm root -g) node verify-in-typelab.mjs <typelab>/app/index.html`: 13 checks inside the real app in headless Chromium (needs a global Playwright). Screenshot goes to the OS temp dir. |
| `typelab-ui.patch` | The exact TypeLab edits, for review or `git apply` (against TypeLab commit d4c0832). |
| `screenshot-typelab.jpg` | TypeLab with a sequins text fill and a knit background, rendered by the verifier. |
