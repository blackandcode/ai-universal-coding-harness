# Testing

The project uses Node's built-in test runner (`node:test`) for unit and integration testing.

```bash
npm run build
npm run test:unit
npm run test:coverage
npm run test:cli
npm test
npm run verify
```

## Test Discovery

The test runner discovers all compiled `.test.js` files under `dist/` (originating from both `.test.ts` and `.test.tsx` source files) and sorts them deterministically by file path.

## Coverage

Running `npm run test:coverage` executes the test suite with Node's native `--experimental-test-coverage` flag to provide line, branch, and function coverage reports without external instrumentation libraries.

## Hermetic Offline Invariant

All unit tests and CLI smoke checks run completely offline and hermetically in isolated temporary directories. No real AI harness credentials or network calls to external APIs are required.

## CI Matrix

CI runs on Linux (Ubuntu with Node 24.18.0), Windows, and macOS using Node 24 LTS.

Key areas covered by tests include:

- plan review/consolidation behavior
- permission policies
- evidence corroboration
- harness registry behavior
- responsive Ink layout and TSX element rendering
- stage source resolution
- configuration precedence
- package and toolchain invariants
