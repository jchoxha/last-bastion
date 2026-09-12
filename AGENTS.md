# Repository workflow

- This repository is `jchoxha/last-bastion` on GitHub.
- The owner explicitly requested on September 12, 2026 that agents work locally, commit completed changes, and push directly to `origin/main` as they go. Follow this workflow unless the owner gives a different instruction for a task. Do not require a pull request or repeat approval before a normal push to `main`.
- Fetch before committing and reconcile upstream changes without discarding local work. Never force-push `main`.
- Run checks appropriate to the change before pushing. The project requires Node.js 22.13 or later.
- Edit game source in `game/`; regenerate `lib/bastion-source.ts` with `node scripts/integrate-bastion.cjs`. Use `npm run build:standalone` to update the tracked playable build when gameplay changes.
- `npm run test:game` and `npm run test:world` cover the current game and world behavior. See `tests/README.md` for focused and browser checks.
- Update affected sections of `docs/GAME-WIKI.md` in the same commit as changes to mechanics, balance, controls, saves, or player-facing features. It is the single editable source for the main-menu wiki. Run `npm run build:wiki` and `npm run test:wiki` when changing it; never edit `lib/game-wiki.generated.ts` directly. Mark legacy behavior and design proposals explicitly instead of documenting them as current features.

## Efficient development

- Keep changes focused on the requested outcome; avoid unrelated refactors, formatting, and optional features.
- Use the README and wiki source maps, targeted `rg` searches, and bounded source reads. Avoid dumping generated bundles or rereading unchanged files.
- Choose meaningful checks for the affected behavior using `tests/README.md`. Broaden validation for shared simulation, terrain, or save changes; use browser checks for changed UI interactions. Instructions-only edits need content review and `git diff --check`, not an app rebuild.
- Reuse passing checks unless subsequent edits invalidate them. Batch independent reads/checks, keep output compact, and avoid redundant builds when a command already includes the required build steps.
- Keep wiki edits limited to affected sections and regenerate required artifacts after source edits are settled.
- Use one agent by default. Keep progress and completion reports concise, including relevant validation, limitations, and the pushed commit. Do not wait on deployment for instructions-only changes.
