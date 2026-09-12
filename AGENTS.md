# Repository workflow

- This repository is `jchoxha/last-bastion` on GitHub.
- The owner explicitly requested on September 12, 2026 that agents work locally, commit completed changes, and push directly to `origin/main` as they go. Follow this workflow unless the owner gives a different instruction for a task. Do not require a pull request or repeat approval before a normal push to `main`.
- Fetch before committing and reconcile upstream changes without discarding local work. Never force-push `main`.
- Run checks appropriate to the change before pushing. The project requires Node.js 22.13 or later.
- Edit game source in `game/`; regenerate `lib/bastion-source.ts` with `node scripts/integrate-bastion.cjs`. Use `npm run build:standalone` to update the tracked playable build when gameplay changes.
- `npm run test:game` and `npm run test:world` cover the current game and world behavior. See `tests/README.md` for focused and browser checks.
