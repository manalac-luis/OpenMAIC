# OpenMAIC Hosted Platform — LIVE v3.0 (2026-05-22)

**Multi-tenant interactive AI classrooms. Each customer gets `<slug>.maic.gigabox.ai` with isolated OpenMAIC instance. Per-user magic-link auth (default) with dashboard, progress tracking, and classroom ownership. Legacy ACCESS_CODE mode still supported. Provisioning is script-based.**

Code in `maic-hosted/` at workspace root (nginx config, systemd units, provisioning scripts, landing page).
OpenMAIC fork: `openmaic-fork/` at workspace root (Gigabox-modified source with persistence + media + access control).
Fork repo: `https://github.com/manalac-luis/OpenMAIC` (origin), upstream: `https://github.com/THU-MAIC/OpenMAIC`.
Built at `/opt/maic/source/` on VM, standalone output at `/opt/maic/standalone/`.

### Architecture
```
Internet → nginx (SSL, wildcard cert)
              ↓
   map slug → port (/etc/maic-hosted/ports.map)
              ↓
   proxy_pass http://127.0.0.1:$maic_port
              ↓
   OpenMAIC (Next.js standalone, per-instance)
     ├─ Classrooms → Postgres (ClassroomStore) or flat files (FsClassroomStore)
     ├─ Media → GCS (GcsMediaStore) or local disk (FsMediaStore)
     ├─ Auth → iron-session magic-link or ACCESS_CODE (middleware.ts)
     └─ LLM calls → Sovereign (DeepSeek V4 Flash)
```

### v2.0 Changes (2026-05-18) — Persistence, Media, Access Control

Three-phase upgrade from flat-file storage to production-grade persistence:

**Phase 1: Classrooms → Postgres**
- `ClassroomStore` abstraction with PG and FS backends (selected by `DATABASE_URL` env var)
- Migration `002_classrooms.sql` — `classrooms` table with JSONB `stage`/`scenes` columns, `owner_id` FK to users
- Auto-migration via `instrumentation.ts` (Next.js server startup hook)
- `classroom-store-pg.ts` uses typed query functions from `lib/db/queries.ts`
- `classroom-store-fs.ts` extracted from old `classroom-storage.ts`

**Phase 2: Media → GCS**
- `MediaStore` abstraction with GCS and FS backends (selected by `GCS_MEDIA_BUCKET` env var)
- `media-store-gcs.ts` uses `@google-cloud/storage` SDK, objects at `classrooms/{id}/{subPath}`
- `media-store-fs.ts` extracted from old filesystem code with path traversal protection
- `mediaServingUrl()` now returns relative paths (`/api/classroom-media/...`) instead of baked-in origins
- Media serving route proxies through `getMediaStore().readStream()` — single access-control chokepoint
- `@google-cloud/storage` added to `serverExternalPackages` in next.config.ts

**Phase 3: Ownership & Access Control**
- Public-read, owner-write sharing model (matches teaching tool use case)
- `POST /api/classroom` records `owner_id` from auth session
- `PUT /api/classroom/[id]` and `DELETE /api/classroom/[id]` require auth + owner check
- `GET /api/classroom?list=true&mine=true` for authenticated classroom listing
- Middleware bypass for GET requests to `/api/classroom` and `/api/classroom-media/*`
- Legacy unowned classrooms (`owner_id = NULL`) can be claimed by any authenticated user

**Key files in fork (`openmaic-fork/`):**

| File | Purpose |
|------|---------|
| `instrumentation.ts` | Auto-run migrations on server startup |
| `migrations/002_classrooms.sql` | Classrooms table DDL |
| `lib/server/classroom-store.ts` | ClassroomStore interface + factory |
| `lib/server/classroom-store-pg.ts` | Postgres implementation |
| `lib/server/classroom-store-fs.ts` | Filesystem implementation |
| `lib/server/media-store.ts` | MediaStore interface + factory |
| `lib/server/media-store-gcs.ts` | GCS implementation |
| `lib/server/media-store-fs.ts` | Filesystem implementation |
| `lib/db/queries.ts` | Classroom query functions (find, upsert, list, delete, isOwner) |
| `app/api/classroom/[id]/route.ts` | PUT/DELETE with owner check |
| `middleware.ts` | Dual auth + public-read bypass |

### Infrastructure
- **VM:** `openclaw-prod` (shared with OpenClaw/Hermes/n8n/ComfyUI/Sovereign)
- **External IP:** `34.69.122.187`
- **DNS:** Cloud DNS zone `maic-gigabox-ai` on `aerial-venture-495423-b5`, wildcard + bare A records
- **GoDaddy:** NS delegation for `maic` → Cloud DNS NS records
- **SSL:** Wildcard cert via acme.sh DNS-01 (ZeroSSL CA), installed at `/etc/letsencrypt/live/maic.gigabox.ai/`
- **nginx:** `/etc/nginx/sites-available/maic` — slug→port map + WebSocket + SSE + `proxy_read_timeout 600s`
- **Systemd:** `maic-hosted@<slug>.service` template (per-instance), `maic-hosted.target`
- **Database:** Per-instance Postgres DB (e.g., `maic_ooda`) on Cloud SQL `axiom-prod-postgres` (when `DATABASE_URL` set)
- **Media storage:** GCS bucket `gs://gigabox-maic-media` on `aerial-venture-495423-b5` (us-central1). VM SA `602783118350-compute@developer.gserviceaccount.com` has `roles/storage.objectAdmin`.
- **Ports map:** `/etc/maic-hosted/ports.map`
- **System user:** `maic-hosted`
- **Runtime:** Next.js 16 standalone output (Node.js 22), shared at `/opt/maic/standalone/`
- **Inference:** DeepSeek V4 Flash via Sovereign (`OPENAI_BASE_URL=https://sovereign.gigabox.ai/v1`)

### Key Differences from n8n/ComfyUI Hosted

| Aspect | n8n Hosted | ComfyUI Hosted | OpenMAIC Hosted |
|--------|-----------|----------------|-----------------|
| Auth | n8n built-in (email/password) | nginx basic_auth (htpasswd) | Dual: magic-link sessions or ACCESS_CODE |
| Database | Per-instance Postgres DB | None (JSON file workflows) | Per-instance Postgres DB (classrooms) + optional GCS (media) |
| Instance ports | 5001+ | 6001+ | 7001+ |
| Runtime | Node.js (n8n binary) | Python (ComfyUI + PyTorch CPU) | Node.js (Next.js standalone) |
| Inference | — | fal.ai cloud | Sovereign (DeepSeek V4 Flash) |
| MemoryMax | 512MB | 512MB | 768MB |

### VM Directory Structure
```
/opt/maic/
  source/                # Git clone (build + deploy from here)
  standalone/            # Next.js standalone output (shared, read-only at runtime)
    server.js            # Entry point
    node_modules/        # Minimal bundled deps
    public/              # Static assets
    .next/static/        # Built JS/CSS chunks
    .next/node_modules/  # Externalized packages (pg, @google-cloud/storage, sharp, shiki)
    data -> /home/maic-hosted/ooda/data  # SYMLINK — protects data from rm -rf during deploys
  landing/               # Static landing page
  scripts/               # Fleet + provisioning scripts

/home/maic-hosted/{slug}/
  .env                   # Instance config (PORT, ACCESS_CODE, DATABASE_URL, GCS_MEDIA_BUCKET, OPENAI_*)
  data/
    classrooms/          # Classroom JSON files (FS fallback only)
    classroom-jobs/      # Generation job JSON files (always local)

/etc/maic-hosted/
  registry.json          # Instance registry (slug, port, access_code, status)
  ports.map              # nginx include (slug → port)
```

### Instance Provisioning
```bash
# Provision new instance (generates ACCESS_CODE, creates per-instance Postgres DB)
sudo /opt/maic/scripts/maic-provision.sh <slug> [owner-email]

# Send welcome email separately
sudo /opt/maic/scripts/maic-send-welcome.sh <email> <slug> <access-code>
```

### Fleet Management
```bash
sudo /opt/maic/scripts/maic-fleet.sh list       # List all instances
sudo /opt/maic/scripts/maic-fleet.sh health      # Check systemd + HTTP health
sudo /opt/maic/scripts/maic-fleet.sh logs ooda   # View instance logs
sudo /opt/maic/scripts/maic-fleet.sh restart ooda
sudo /opt/maic/scripts/maic-fleet.sh destroy ooda
```

### Build & Deploy (from source on VM)

**IMPORTANT: The deploy has 4 phases that MUST run in this exact order. Skipping or reordering causes broken packages, missing symlinks, or startup crashes. Two helper scripts live at `openmaic-fork/scripts/` and must be SCP'd to the VM.**

```bash
# ============================================================
# PHASE 1: Patch source + build
# ============================================================
# 1a. Create tarball of changed files (from local workspace)
cd openmaic-fork && tar -cf /tmp/maic-patch.tar <changed-files>
gcloud compute scp /tmp/maic-patch.tar openclaw-prod:/tmp/maic-patch.tar \
  --zone=us-central1-a --project=aerial-venture-495423-b5 --tunnel-through-iap

# 1b. Apply patch and build on VM
gcloud compute ssh openclaw-prod ... --command="
  sudo bash -c 'cd /opt/maic/source && tar -xf /tmp/maic-patch.tar && chown -R maic-hosted:maic-hosted .'
"
gcloud compute ssh openclaw-prod ... --command="
  sudo -u maic-hosted bash -c 'cd /opt/maic/source && pnpm install --frozen-lockfile && NODE_OPTIONS=--max-old-space-size=3072 pnpm build'
"

# ============================================================
# PHASE 2: Deploy standalone output
# ============================================================
gcloud compute ssh openclaw-prod ... --command="sudo bash -c '
  systemctl stop maic-hosted@ooda
  rm -rf /opt/maic/standalone/*
  cp -a /opt/maic/source/.next/standalone/. /opt/maic/standalone/
  # Re-create data symlink (cp overwrites it)
  rm -rf /opt/maic/standalone/data
  ln -sf /home/maic-hosted/ooda/data /opt/maic/standalone/data
  mkdir -p /opt/maic/standalone/.next/static
  cp -r /opt/maic/source/.next/static/. /opt/maic/standalone/.next/static/
  test -d /opt/maic/standalone/public || cp -r /opt/maic/source/public /opt/maic/standalone/public
'"

# ============================================================
# PHASE 3: Fix broken pnpm symlinks (GCS, sharp, shiki, pg)
# ============================================================
# Use the two helper scripts. MUST fix GCS/sharp/shiki FIRST,
# then pg separately (pg needs special handling for .d.mts).
# Scripts are at openmaic-fork/scripts/ — SCP them to VM:
gcloud compute scp openmaic-fork/scripts/fix-all-packages.sh openclaw-prod:/tmp/fix-all-packages.sh \
  --zone=us-central1-a --project=aerial-venture-495423-b5 --tunnel-through-iap
gcloud compute ssh openclaw-prod ... --command="sed -i 's/\r$//' /tmp/fix-all-packages.sh && sudo bash /tmp/fix-all-packages.sh"

# ============================================================
# PHASE 4: Start and verify
# ============================================================
gcloud compute ssh openclaw-prod ... --command="
  sudo systemctl start maic-hosted@ooda && sleep 4 && sudo journalctl -u maic-hosted@ooda -n 8 --no-pager
"
# Expected: "Ready in XXms" with NO errors about pg, storage, or modules.
```

**Why the scripts exist:** Next.js `serverExternalPackages` (pg, @google-cloud/storage, sharp, shiki) are externalized to `.next/node_modules/` as pnpm symlinks. These point into the pnpm store with paths that break after `cp -a` to standalone. The `fix-all-packages.sh` script:
1. Copies GCS/sharp/shiki from the pnpm store + runs `npm install --omit=dev` for transitive deps
2. Creates both clean and hashed symlinks (e.g., `pg` + `pg-63e85fc611dc39f8`)
3. Installs `pg@8.16.0` (NOT latest) into a temp dir, then copies to `.next/node_modules/` — avoids `pg@8.20.0`'s `.d.mts` file which Node.js 22 rejects with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`

**Critical: Do NOT use `npm install --prefix` or `npm install --production` directly in `.next/node_modules/`.** It will remove sibling packages (GCS, sharp, shiki) that aren't in the parent package.json. Always install into a temp dir first, then copy.

### Image Generation — OpenRouter + Seedream 4.5 (2026-05-18)

**Problem:** Blank image rectangles in slides. The `applyOpenAIImageFallback()` auto-registered `openai-image` using Sovereign's URL, but Sovereign has no `/images/generations` endpoint (404).

**Solution:** OpenRouter image adapter using `bytedance-seed/seedream-4.5` at $0.04/image.

| File | Purpose |
|------|---------|
| `lib/media/adapters/openrouter-image-adapter.ts` | Adapter — `/chat/completions` with `modalities: ["image"]` |
| `lib/media/image-providers.ts` | Registered in provider registry + switch statements |
| `lib/media/types.ts` | Added `'openrouter-image'` to `ImageProviderId` union |
| `lib/server/provider-config.ts` | `IMAGE_OPENROUTER` env map + fallback skip logic |
| `components/settings/index.tsx` | UI name + icon entries |
| `lib/store/settings.ts` | Default config entry |

**Env vars (ooda instance):**
```
IMAGE_OPENROUTER_API_KEY=<openrouter-key>
IMAGE_OPENROUTER_MODELS=bytedance-seed/seedream-4.5
```

**API request must include `enableImageGeneration: true`** — without this flag, the LLM doesn't produce `gen_img_*` placeholders and the image pipeline is skipped entirely.

**Verified:** Classroom `J-IZNiPoBH` generated with 1 Seedream image (872KB PNG, solar system diagram).

### GCS Media Storage — LIVE (2026-05-18)

**Problem:** Media files stored on local disk at `/opt/maic/standalone/data/classrooms/` were destroyed by `rm -rf /opt/maic/standalone/*` during deploys. Root cause: Next.js standalone `server.js` line 6 does `process.chdir(__dirname)`, overriding systemd's `WorkingDirectory`. So `CLASSROOMS_DIR` resolved to inside the standalone directory we wipe on every deploy.

**Solution:** GCS bucket `gs://gigabox-maic-media` on `aerial-venture-495423-b5` (us-central1).

- VM SA `602783118350-compute@developer.gserviceaccount.com` granted `roles/storage.objectAdmin`
- `GCS_MEDIA_BUCKET=gigabox-maic-media` added to `/home/maic-hosted/ooda/.env`
- `media-store.ts` changed from dynamic `require('./media-store-gcs')` to static `import { GcsMediaStore }` — the dynamic require was mangled by Next.js bundler in standalone mode (`t is not a constructor`)
- Data symlink `/opt/maic/standalone/data` → `/home/maic-hosted/ooda/data` protects FS-based data (classroom-jobs) from future deploys
- All 4 broken pnpm symlinks in `.next/node_modules/` fixed (pg, @google-cloud/storage, sharp, shiki) — replaced with real copies + transitive deps

**Verified:** Classroom generated with 3 Seedream images (~1MB PNGs), stored in `gs://gigabox-maic-media/classrooms/{id}/media/`, served correctly via `/api/classroom-media/` route.

### Classrooms Gallery Page — LIVE (2026-05-18)

Browsable gallery at `/classrooms` listing all server-persisted classrooms with slide thumbnails.

| File | Action | Purpose |
|------|--------|---------|
| `app/classrooms/page.tsx` | CREATE | Gallery page + GalleryCard with ThumbnailSlide rendering |
| `app/page.tsx` | MODIFY | "Browse all" button in Recent Classrooms divider |
| `lib/i18n/locales/en-US.json` | MODIFY | `gallery.*` i18n keys |
| `lib/i18n/locales/zh-CN.json` | MODIFY | `gallery.*` i18n keys (Chinese Simplified) |
| `lib/i18n/locales/zh-TW.json` | MODIFY | `gallery.*` i18n keys (Chinese Traditional) |
| `lib/i18n/locales/ja-JP.json` | MODIFY | `gallery.*` i18n keys (Japanese) |
| `lib/i18n/locales/ru-RU.json` | MODIFY | `gallery.*` i18n keys (Russian) |
| `lib/i18n/locales/ar-SA.json` | MODIFY | `gallery.*` i18n keys (Arabic) |

**Features:** Client-side search with `useDeferredValue`, staggered motion entry, responsive grid (1-4 cols), skeleton loading, error/empty/search-empty states, deterministic gradient fallback for classrooms without slide scenes, ResizeObserver-based thumbnail sizing.

### Per-User Login + Dashboard — LIVE (2026-05-22)

Switched `ooda` instance from `access-code` mode to `magic-link` mode. Per-user email login via Resend magic links, iron-session cookies, dashboard with progress tracking.

**Auth flow:** User visits site → redirected to `/login` → enters email → receives magic link email via Resend → clicks link → `/api/auth/verify` creates session → redirected to home page.

**Dashboard (`/dashboard`):** User info card (email, name, member since, logout), 3 quick stat cards (classrooms created, scenes completed, last active), My Classrooms grid with thumbnails (reuses `ThumbnailSlide` + `fetchFirstSlide` pattern), Learning Progress list with progress bars and completion badges.

**Progress tracking:** Classroom viewer (`app/classroom/[id]/page.tsx`) subscribes to Zustand store `currentSceneId` changes via `useStageStore.subscribe()` and fires `POST /api/progress` on every scene navigation. Course completion detected when `currentSceneId === PENDING_SCENE_ID && scenes.length === outlines.length && generatingOutlines.length === 0`.

**Home page auth indicator:** User chip + Dashboard link in top-right toolbar pill (before LanguageSwitcher). Fetches `/api/auth/me` on mount, shows user name or email prefix.

| File | Action | Purpose |
|------|--------|---------|
| `lib/db/queries.ts` | MODIFY | Added `getProgressWithClassrooms()` + `getUserStats()` query functions |
| `app/api/dashboard/progress/route.ts` | CREATE | GET endpoint — user progress joined with classroom names + stats |
| `app/dashboard/page.tsx` | CREATE | Dashboard page (user info, stats, classrooms, progress) |
| `app/page.tsx` | MODIFY | Auth-aware user chip + Dashboard link in toolbar |
| `app/classroom/[id]/page.tsx` | MODIFY | Progress tracking via Zustand subscription + POST /api/progress |
| `middleware.ts` | MODIFY | Added `x-access-code` header bypass in magic-link mode for headless API access |
| `lib/i18n/locales/en-US.json` | MODIFY | `dashboard.*` i18n keys (20 keys) |
| `lib/i18n/locales/zh-CN.json` | MODIFY | `dashboard.*` keys (English placeholders) |
| `lib/i18n/locales/zh-TW.json` | MODIFY | `dashboard.*` keys (English placeholders) |
| `lib/i18n/locales/ja-JP.json` | MODIFY | `dashboard.*` keys (English placeholders) |
| `lib/i18n/locales/ru-RU.json` | MODIFY | `dashboard.*` keys (English placeholders) |
| `lib/i18n/locales/ar-SA.json` | MODIFY | `dashboard.*` keys (English placeholders) |

**Env vars (ooda instance — already configured, only AUTH_MODE changed):**
```
AUTH_MODE=magic-link
SESSION_SECRET=<existing>
RESEND_API_KEY=re_fNFT9Az7_Lkq9nZHjV3zwoZa1K7H3mqXT
RESEND_FROM_EMAIL=noreply@send.gigabox.ai
NEXT_PUBLIC_BASE_URL=https://ooda.maic.gigabox.ai
```

**Key considerations:**
- `AUTH_MODE` is build-time — must be set during `pnpm build` (layout.tsx evaluates at build)
- Middleware updated: `x-access-code` header now works in BOTH auth modes (was access-code only). Required for headless API calls like `POST /api/generate-classroom` in magic-link mode.
- Existing classrooms with `owner_id = NULL` remain accessible (public-read model)
- Progress API (`POST /api/progress`) was pre-existing; only the client-side wiring was missing

### TTS — Kokoro TTS (Self-Hosted, CPU) — LIVE (2026-05-19)

**Server-side TTS via Kokoro FastAPI.** 82M param model (Apache 2.0, MOS 4.6, #1 on TTS Arena). Zero ongoing cost — runs on existing VM CPU.

| Item | Details |
|------|---------|
| Docker image | `ghcr.io/remsky/kokoro-fastapi-cpu:v0.2.0post4` |
| Container | `kokoro-tts` via systemd `kokoro-tts.service` |
| Port | `127.0.0.1:13305` (loopback only, maps to container port 8880) |
| Memory limit | 4GB (`--memory=4g`), steady-state ~1.24GB |
| CPU limit | 3.0 cores (`--cpus=3`) |
| Model | `kokoro` (67 voice packs loaded at startup) |
| Default voice | `af_heart` (American English, female) |
| API | OpenAI-compatible: `POST /v1/audio/speech` |
| Health | `http://localhost:13305/health` |
| Voices | `http://localhost:13305/v1/audio/voices` (67 voices: en-US, en-GB, ja, zh, etc.) |

**OpenMAIC integration:** `TTS_LEMONADE_BASE_URL=http://localhost:13305/v1` in instance `.env` activates the `lemonade-tts` provider (keyless, auto-selected by settings store).

**Manage:**
```bash
sudo systemctl status kokoro-tts
sudo systemctl restart kokoro-tts
sudo journalctl -u kokoro-tts -f
sudo docker stats kokoro-tts --no-stream
```

**Key lessons:**
- Kokoro CPU needs ~1.24GB RAM at steady state (PyTorch + 82M model + 67 voice packs). The initial 512MB limit caused OOM kills (exit code 137) during model loading. Memory bumped to 4GB after VM resize to e2-standard-4 (2026-05-20). CPU bumped to 3 cores.
- Kokoro model ID is `kokoro` (not `kokoro-v1`). The server-side TTS route validates model IDs against `kokoro-fastapi`'s `/v1/audio/voices` endpoint. Client settings migration + server-side validation added to auto-correct stale `kokoro-v1` values.
- Kokoro occasionally crashes with `TypeError: fetch failed` under load. TTS route has 2-retry logic with 20s backoff. `maxDuration` bumped to 120s.
- **Verified working:** TTS audio generates for all scenes. Browser plays server-generated audio via IndexedDB blob URLs.

### Image Generation — WORKING (2026-05-20)

**Status:** Full pipeline verified end-to-end. Flower diagram prompt generated with images successfully (2026-05-20).

**Root causes found and fixed (2026-05-19):**
1. **Interactive Mode blocks image generation** — When the UI toggle "Interactive Mode" is ON (cyan atom button), outlines use `interactive-outlines` prompt template which has ZERO image-related instructions. Only `requirements-to-outlines` template includes `{{#if imageEnabled}}{{snippet:image-instructions}}{{/if}}`. Fix: user must turn Interactive Mode OFF.
2. **LLM prefers interactive over slide** — DeepSeek V4 Flash strongly prefers `interactive` scene type. Image generation only works with `slide` type (which supports `mediaGenerations`). Fixed by strengthening prompt: "**MUST use `slide` type with `mediaGenerations`** when user asks for pictures/photos/illustrations".

**Debug infrastructure (retained for pipeline visibility):**
- `/api/debug` route — receives client-side diagnostic POSTs, logs to server journal
- `media-orchestrator.ts` — diagnostic POSTs at decision points (filter results, generation start)
- `classroom/[id]/page.tsx` — diagnostic POST in media resume branch

**Pipeline flow (for reference):**
```
generation-preview/page.tsx:
  1. Stream outlines from /api/generate/scene-outlines-stream (SSE)
  2. Store outlines via setOutlines() — includes mediaGenerations
  3. Generate scene 1 INLINE (content → actions → TTS)
  4. Navigate to /classroom/{stageId}

classroom/[id]/page.tsx:
  5. Auto-resume effect fires
  6. If hasPending → generateRemaining() (includes generateMediaForOutlines at line 315)
  7. If !hasPending → generateMediaForOutlines() directly (line 174)  ← THIS PATH for 1-scene courses
  8. Media orchestrator: filter by imageGenerationEnabled → callImageApi() → /api/generate/image
```

### Server-Side Classroom Generation — WORKING (2026-05-20)

**Full API-only classroom generation via `POST /api/generate-classroom`.** No browser required. Produces complete classroom with outlines, scenes, images (Seedream 4.5), and TTS audio (Kokoro CPU) — all persisted to Postgres + GCS.

**Fixes applied (2026-05-20):**
1. **`x-access-code` header auth** — middleware in `access-code` mode only checked cookies. Added `x-access-code` header bypass for headless/API-only access.
2. **`maxDuration` bumped to 600** — was 30 (irrelevant in standalone Node.js, but safe to have high).

**API usage:**
```bash
# Start generation
curl -X POST https://ooda.maic.gigabox.ai/api/generate-classroom \
  -H 'Content-Type: application/json' \
  -H 'x-access-code: <ACCESS_CODE>' \
  -d '{"requirement": "Teach me about photosynthesis in 3 slides", "enableTTS": true, "enableImageGeneration": true}'
# Returns: { jobId, pollUrl, status: "queued" }

# Poll status
curl https://ooda.maic.gigabox.ai/api/generate-classroom/<jobId> \
  -H 'x-access-code: <ACCESS_CODE>'
# Returns: { status, step, progress, scenesGenerated, totalScenes, result?, done, stepTimings?, summary? }

# View classroom
curl 'https://ooda.maic.gigabox.ai/api/classroom?id=<classroomId>'
# Or browse: https://ooda.maic.gigabox.ai/classroom/<classroomId>
```

**Pipeline steps (server-side):**
```
POST /api/generate-classroom → 202 (job queued)
  after() callback runs:
    1. resolveModel() → DeepSeek V4 Flash via OpenRouter
    2. generateSceneOutlinesFromRequirements() → outlines with mediaGenerations
    3. For each outline: generateSceneContent() → generateSceneActions()
    4. generateMediaForClassroom() → Seedream 4.5 images → GCS
    5. generateTTSForClassroom() → Kokoro CPU audio → GCS
    6. classroomStore.persist() → Postgres
```

**Performance (e2-standard-4 CPU, Kokoro at 4GB/3CPU):**
| Phase | 3-slide (internet basics) | 3-slide (photosynthesis, old) | 4-slide (AI/LLMs, old) |
|-------|---------------------------|-------------------------------|------------------------|
| Outlines | 10s | ~10s | ~33s |
| Scenes (content + actions) | 3.2 min | ~3.5 min | ~10.3 min |
| Images (Seedream 4.5) | 42s (3 files) | ~1 min (3 files) | ~37s (4 files) |
| TTS (Kokoro CPU) | **3.5 min (16 actions)** | ~14 min (15 actions)* | ~15.1 min (18 actions)* |
| **Total** | **7.6 min** | **~18 min*** | **~26.6 min*** |

*Old numbers measured on e2-standard-2 with Kokoro at 2GB/1.5CPU.

**VM resize benchmark (2026-05-20):** After resizing VM to e2-standard-4 and Kokoro to 4GB/3CPU, TTS improved from ~2.3× real-time to ~9× real-time (4× speedup). Total pipeline for a 3-slide classroom dropped from ~18 min to 7.6 min. Zero OOM crashes (0/16 TTS failures vs previous intermittent OOM at 99.97% memory utilization).

**Verified classrooms:** `tQqOd6I_vZ` (internet basics, 3 scenes, 7.6 min), `ZJravVkEmo` (photosynthesis, 3 scenes), `yHpn9Y4Aah` (Mandarin, 2 scenes), `z3Ev8bhjl2` (AI/LLMs 1/3, 4 scenes).

### Pipeline Hardening — Retry, Timing, Observability (2026-05-20)

**Problem:** Silent failures (images/TTS fail without indication in job result), no timing data (can't tell which phase is slow), fragile external calls (zero retry on images, narrow retry on TTS).

**Solution:** 8 files changed (2 new, 6 modified) — shared retry helper, stats accumulator, per-phase timing, per-item media/TTS tracking, expanded job record.

| File | Action | Purpose |
|------|--------|---------|
| `lib/server/retry.ts` | NEW | `withRetry(fn, opts)` — exponential backoff, `isRetryableError` for TypeError/429/500/502/503 |
| `lib/server/generation-stats.ts` | NEW | `GenerationStats` type, `createGenerationStats()`, `timeStep(stats, name, fn)` |
| `lib/media/adapters/openrouter-image-adapter.ts` | MODIFY | Wrapped fetch in `withRetry` (maxRetries: 2, baseDelayMs: 3000) |
| `lib/audio/tts-providers.ts` | MODIFY | Replaced hand-rolled Lemonade TTS retry with `withRetry` (baseDelayMs: 20000), error now includes HTTP status code |
| `lib/server/classroom-media-generation.ts` | MODIFY | Optional `stats` param on `generateMediaForClassroom` + `generateTTSForClassroom`, per-item timing/success/failure/bytes |
| `lib/server/classroom-generation.ts` | MODIFY | `timeStep()` wraps each phase (research, outlines, scenes, media, tts, persist), stats in result |
| `lib/server/classroom-job-store.ts` | MODIFY | `stepTimings` + `summary` fields on job record, `fullyComplete` flag, failure description |
| `app/api/generate-classroom/[jobId]/route.ts` | MODIFY | `stepTimings` + `summary` exposed in poll response |

**Poll response now includes (when job succeeds):**
```json
{
  "stepTimings": [
    { "name": "research", "startedAt": "...", "endedAt": "...", "durationMs": 0 },
    { "name": "outlines", "durationMs": 9892 },
    { "name": "scenes", "durationMs": 100652 },
    { "name": "media", "durationMs": 64946 },
    { "name": "tts", "durationMs": 727294 },
    { "name": "persist", "durationMs": 39 }
  ],
  "summary": {
    "totalDurationMs": 902823,
    "media": { "requested": 3, "succeeded": 3, "failed": 0 },
    "tts": { "requested": 12, "succeeded": 12, "failed": 0 },
    "fullyComplete": true,
    "description": "Completed: 2 scenes, media 3/3, TTS 12/12"
  }
}
```

**Verified:** Intro to Mandarin classroom `yHpn9Y4Aah` — 2 scenes, 3/3 images, 12/12 TTS, 15 min total, `fullyComplete: true`.

### 3-Classroom Course Run — "Introduction to AI with an emphasis on LLMs" (2026-05-20)

Three sequentially-generated classrooms testing the pipeline at scale. Each: 4 scenes, 4 images, TTS enabled.

| # | Classroom ID | URL | Scenes | Images | TTS | Total |
|---|-------------|-----|--------|--------|-----|-------|
| 1/3 | `z3Ev8bhjl2` | [What AI Actually Is](https://ooda.maic.gigabox.ai/classroom/z3Ev8bhjl2) | 4 | 4/4 | 17/18 | 26.6m |
| 2/3 | `hfErhOdrqU` | [What an LLM Is](https://ooda.maic.gigabox.ai/classroom/hfErhOdrqU) | 4 | 4/4 | 20/21 | ~24m |
| 3/3 | `kvm66KdW7Q` | [Using LLMs Well](https://ooda.maic.gigabox.ai/classroom/kvm66KdW7Q) | 4 | 4/4 | 18/18 | 22.9m |

**Total:** ~73 min for 3 classrooms, 12 scenes, 12/12 images, 55/57 TTS.

**Stale-job false positive on classroom 2/3:** The TTS phase took ~18 min without emitting sub-step progress updates (the job store only sees "Generating TTS audio" for the entire duration). The 30-minute stale detection threshold marked the job as `failed` even though the pipeline completed and persisted the classroom. The data was saved — only the job record was wrong. Needs fix: either emit per-action progress updates during TTS, or increase the stale threshold.

### Pipeline Diagnostic — Four-Category Breakdown (2026-05-20)

**Full diagnostic report:** `docs/maic-pipeline-diagnostic.md`

Using classroom 1/3 (`z3Ev8bhjl2`) as the source of truth:

| Stage | Wall Clock | (a) Inherent Compute | (b) Cold-Start | (c) Avoidable Serial | (d) External Latency |
|-------|-----------|---------------------|----------------|---------------------|---------------------|
| Outlines | 33s | 0s | 0s | 0s | 33s (100%) |
| Scenes | 620s | 0s | 0s | 465s (75%) | 155s (25%) |
| Media | 37s | 0s | 0s | 28s (75%) | 9s (25%) |
| TTS | 906s | 756s (83%) | 102s (11%) | 48s (5%) | 0s |
| **Total** | **1596s** | **756s (47%)** | **102s (6%)** | **541s (34%)** | **197s (12%)** |

**Two open questions answered:**
1. **Scenes 3× variance** (10.3m vs 3.5m on photosynthesis): 4 scenes vs 3, plus AI/LLMs topic produces 2-3× longer LLM responses per scene. No OpenRouter anomaly.
2. **TTS load vs synthesis**: Synthesis-dominated (83%). Kokoro stays warm across calls — stable 2.3× real-time multiplier. Below published 3-11× floor due to CPU contention (`--cpus=1.5`, 99.97% memory utilization). One OOM crash cost 102s (11%).

**Ranked optimization opportunities:**
1. Parallelize scene generation: -465s (low effort, `Promise.all` on scenes)
2. Increase Kokoro memory/CPU: -350s (low effort, docker flag change)
3. Parallelize images: -28s (low effort)
4. Concurrent TTS (×2): -225s (medium effort, needs testing)

**Achievable: 26.6m → 8.8m (3× improvement) with no hardware change.**

### Key Lessons (2026-05-18 + 2026-05-19 + 2026-05-20)
- **pnpm symlinks break cross-machine deploys** — `tar` preserves pnpm's symlinked node_modules pointing to Windows paths. Must build on the VM instead of locally.
- **Next.js bundler mangles `require()` in standalone mode** — dynamic `require('./classroom-store-pg')` in factory function becomes `r(...)` in bundled output, causing "r is not a constructor". Fix: use static imports instead.
- **`serverExternalPackages` required for GCS SDK and pg** — `@google-cloud/storage` and `pg` must be listed to avoid bundling issues in Next.js standalone. Turbopack externalizes these to `.next/node_modules/` but pnpm's symlink structure means transitive deps are broken symlinks. Fix: `npm install --production` inside the externalized module directory to resolve transitive deps with flat layout.
- **Middleware must explicitly allow public-read routes** — the root `middleware.ts` requires auth for all `/api/*` routes. GET bypasses for `/api/classroom` and `/api/classroom-media/*` must be added explicitly.
- **`MediaStore.write()` must accept `Buffer | Uint8Array`** — TTS audio `result.audio` is `Uint8Array`, not `Buffer`.
- **`enableImageGeneration` must be passed in API request** — the flag is `false` by default. Without it, the LLM prompt omits image instruction snippets, no `gen_img_*` placeholders are produced, and the media generation phase is skipped entirely.
- **OpenRouter image API uses chat completions** — unlike OpenAI's `/images/generations`, OpenRouter returns images via `/chat/completions` with `modalities: ["image"]`. Images returned as base64 data URLs in `message.images` array.
- **`applyOpenAIImageFallback` must check for existing providers** — without the guard `if (Object.keys(imageConfig).length > 0) return imageConfig`, the fallback injects a broken `openai-image` provider that overrides the working `openrouter-image` provider.
- **`server.js` does `process.chdir(__dirname)`** — overrides systemd's `WorkingDirectory`. Any path using `process.cwd()` resolves to `/opt/maic/standalone/`, not `/home/maic-hosted/ooda/`. Media and classroom-jobs stored in `data/` relative to cwd end up inside the standalone directory that gets wiped on deploy. Fix: GCS for media, symlink for FS data.
- **Static imports required for externalized packages** — `media-store.ts` used `require('./media-store-gcs')` which Next.js bundler mangles to `t(...)` in standalone output. Same issue as classroom-store-pg. Fix: always use static `import { GcsMediaStore }` — `serverExternalPackages` still externalizes correctly.
- **ALL externalized packages need symlink fixup** — not just pg. After `cp -a` of standalone output, `@google-cloud/storage`, `sharp`, and `shiki` also have broken pnpm symlinks in `.next/node_modules/`. Must replace each with real copy from pnpm store + `npm install --production --ignore-scripts` for transitive deps.
- **`@google-cloud/storage` hashed directory name** — Next.js externalizes as `storage-9b10680cfda2d54c` (not `storage`). Need `ln -sf storage-* storage` in `@google-cloud/` for Node.js resolution.
- **`npm install --ignore-scripts` needed for @google-cloud/storage** — the package has a `postinstall` script that runs `npm run compile` which fails without TypeScript. The pre-built `build/cjs/` directory is already present when copying from pnpm store.
- **Hashed symlinks must go BOTH ways** — Next.js runtime references `pg-63e85fc611dc39f8` (hashed), but Node.js resolution needs `pg` (clean). After copying the real package as `pg`, create `ln -sf pg pg-63e85fc611dc39f8`. Same for `sharp-*`, `shiki-*`, and `@google-cloud/storage-*`.
- **Interactive Mode prompt template has no image support** — `interactive-outlines` prompt template omits all `{{#if imageEnabled}}` conditionals. When Interactive Mode is ON, the LLM never sees image generation instructions, never produces `mediaGenerations`, and always generates `interactive` scene type. Must be OFF for image generation to work.
- **LLM needs strong instruction for image generation** — Weak wording like "Add `mediaGenerations` only when genuinely enhances" causes the LLM to skip images entirely. Changed to "**MUST include at least one `mediaGenerations` entry per slide scene**" to ensure compliance.
- **Image generation is client-side, not server-side** — `generateMediaForOutlines()` runs entirely in the browser. It reads from Zustand settings store, calls `/api/generate/image` via `fetch()`, downloads blobs, and stores in IndexedDB. Server logs only show the API call if the browser actually makes it.
- **`generation-preview/page.tsx` generates scene 1 without media orchestrator** — Scene 1 is generated inline (content → actions → TTS) before navigating to the classroom. `generateMediaForOutlines()` is only called from `use-scene-generator.ts:generateRemaining()` or the classroom page's media resume branch. For single-scene courses, this means media generation depends entirely on the classroom's else-if branch at line 174.
- **Deploy symlink fix must preserve hashed names** — The standalone deploy replaces broken pnpm symlinks with real package copies, but the Next.js compiled code references the original hashed names (e.g., `pg-63e85fc611dc39f8`). Must create reverse symlinks: `ln -sf pg pg-63e85fc611dc39f8`.
- **`access-code` middleware blocks API-only access** — The middleware only checked `openmaic_access` cookie, not headers. Added `x-access-code` header bypass for headless/API callers. Without this, `POST /api/generate-classroom` always returns 401.
- **Next.js `after()` works in standalone mode** — The `after()` callback runs after the response is sent and is not bound by `maxDuration` in self-hosted mode. The full pipeline (outlines → scenes → images → TTS → persist) runs to completion even though the route responds with 202 immediately.
- **Kokoro TTS is the bottleneck in API generation** — CPU-only Kokoro at ~60-90s per speech action means a 3-slide classroom with 15 speech actions takes ~14 min just for TTS. The rest of the pipeline (LLM + images) completes in ~5 min.
- **`pg@8.20.0` ships `index.d.mts` — Node.js 22 rejects it** (2026-05-20) — `pg` 8.20.0 added TypeScript declaration files (`.d.mts`). Node.js 22 throws `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` when it encounters `.d.mts` under `node_modules/`. Fix: pin `pg@8.16.0` (last version without `.d.mts`). The pnpm-store copy of pg is fine (8.20.0 in pnpm doesn't include `.d.mts`), but `npm install` inside `.next/node_modules/pg/` pulls the latest 8.20.0 with the `.d.mts` file. Always install pg into a temp dir, then copy the folder.
- **`npm install --prefix` in `.next/node_modules/` nukes sibling packages** (2026-05-20) — Running `npm install pg@8.16.0 --prefix /opt/maic/standalone/.next` treats `.next/` as the project root and removes any packages not in its `package.json` (which is auto-generated by Next.js and doesn't list GCS/sharp/shiki). Fix: install into a `mktemp -d` temp dir, then `cp -r` just the needed folders into `.next/node_modules/`. The `fix-all-packages.sh` script does this correctly.
- **CRLF in scripts SCP'd from Windows** (2026-05-20) — Shell scripts created on Windows have `\r\n` line endings. Bash on Linux chokes with `$'\r': command not found`. Always run `sed -i 's/\r$//' /tmp/script.sh` before `bash /tmp/script.sh`.
- **Deploy order matters: GCS/sharp/shiki BEFORE pg** (2026-05-20) — GCS/sharp/shiki use `npm install --omit=dev` inside their own directories (safe, doesn't affect siblings). pg must be installed into a temp dir then copied (to avoid nuking siblings). If pg is installed first via `npm install --prefix`, it removes the others. The combined `fix-all-packages.sh` script enforces the correct order.
- **Stale-job detection triggers false positives on long TTS phases** (2026-05-20) — The job store marks jobs as `failed` after 30 min without a progress update. The TTS phase emits no sub-step updates (only "Generating TTS audio" for the entire duration). With 18-21 speech actions at ~45-60s each on CPU, TTS can take 15-20 min. The job data is saved correctly — only the poll status is wrong. Fix: either emit per-action progress updates, or increase the stale threshold.
- **Kokoro OOM at `--memory=2g`** (2026-05-20) — Kokoro ran at 99.97% of its 2GB Docker memory limit. Under synthesis load, it OOM-crashed (exit 137). Fixed: bumped to `--memory=4g --cpus=3` after VM resize to e2-standard-4 (2026-05-20). Now at ~26% memory utilization with 3GB headroom.
- **Kokoro synthesis rate was 2.3× real-time on e2-standard-2** (2026-05-20) — Below published 3-11× floor. Cause: `--cpus=1.5` limit + memory pressure + VM CPU contention. After VM resize to e2-standard-4 and Kokoro bumped to 3 CPUs, rate should improve toward published 3-11× range.
- **Scene generation is serial but could be parallel** (2026-05-20) — The `for...of await` loop in `classroom-generation.ts` generates scenes one at a time. Scenes have no inter-dependency. Parallelizing with `Promise.all` would reduce wall-clock from sum (620s) to max (155s) = 75% savings on this stage.
- **Progress tracking requires explicit client-side wiring** (2026-05-22) — The `POST /api/progress` endpoint and DB tables existed, but the classroom viewer never called it. Scene navigation was entirely client-side via Zustand store. Fix: added `useStageStore.subscribe()` effect that fires `POST /api/progress` on every `currentSceneId` change. Used Zustand `subscribe()` (outside React render cycle) for fire-and-forget tracking to avoid blocking UI navigation.
- **`AUTH_MODE=magic-link` must be set at build time** (2026-05-22) — `layout.tsx` conditionally renders `AccessCodeGuard` based on `process.env.AUTH_MODE`. This is evaluated during Next.js build (SSR), not at runtime. Setting AUTH_MODE only in `.env` without rebuilding leaves the old access-code guard in place.
- **`x-access-code` header must work in both auth modes** (2026-05-22) — Originally only checked in `access-code` mode. In `magic-link` mode, the middleware rejected all API requests without a session cookie, blocking headless callers like `POST /api/generate-classroom`. Fix: moved the `x-access-code` header check before the session cookie check so it works in both modes. Note: `x-access-code` only bypasses middleware — route handlers still need a session or API key for user identity (`authenticateRequest()` returns `user: null`).
- **Verified classroom `uc0nyRJRAW`** (2026-05-22) — "Welcome to the Solar System", 3 scenes, 3/3 Seedream images, no TTS. Generated in 5.1 min. Progress tracking tested end-to-end: DB inserts for scenes 1-2, `POST /api/progress` via session cookie for scene 3 + completion, `GET /api/dashboard/progress` returns correct progress and stats.

### Resource Budget
- Per instance: ~300-500MB (Next.js SSR + LangGraph agent orchestration), 768MB max (systemd MemoryMax)
- VM available: ~12GB after existing services
- Capacity: ~15-25 instances at max usage
