# P2P Chat - Web client

An ephemeral, zero-knowledge, peer-to-peer WebRTC burner room webapp built with **Svelte 5**, **SvelteKit** and **Tailwind CSS v4**.

It runs both **standalone** (served directly as a static SPA without any seeder) and as a **P2P-seeded single-file bundle** (`dist/cotilla-svelte.html`) delivered over the Cotilla mesh via `cmd/seeder`.

---

## Development, Build & Test Commands

```bash
# Install dependencies
pnpm install

# Start local development server
pnpm run dev

# Type check
pnpm run check

# Run unit, store, platform, and live-server tests (requires `make server` from repo root first)
pnpm test

# Build standalone static SPA (svelte/build/)
pnpm run build

# Build single-file HTML bundle for P2P seeding (svelte/dist-singlefile/singlefile.html)
pnpm run build:singlefile

# Preview standalone production build
pnpm run preview
```
