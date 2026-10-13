# Notes for coding agents working on Gain

Gain is a Node.js server (TypeScript, run directly by Node's type stripping — there is no build step) plus a
plain-JavaScript phone web app in `public/`.

- TypeScript must stay "erasable": no `enum`, no `namespace`, no constructor parameter properties.
  Import local files with the `.ts` extension and use `import type` for types.
- No runtime dependencies. Use Node built-ins (`node:http`, `node:child_process`, `fetch`).
- `public/` is served as-is to an iPhone: no frameworks, no build, no external scripts (the CSP blocks them).
- Tests use `node:test`: `npm test`. Type check: `npm run typecheck`. Keep both green.
- Keep changes small and focused on the task you were given. The user reviews every branch before merging.
