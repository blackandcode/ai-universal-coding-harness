# TSConfig and modules

## Application projects

Use the module strategy expected by the runtime/bundler. Node-first ESM projects usually require Node-aware resolution; bundler-owned applications may legitimately use bundler resolution.

## Libraries

Library correctness includes declaration output and consumer resolution. Validate the package `exports` map and generated `.d.ts` files, not only the source build.

## ESM

For new Node 24+ applications prefer ESM unless compatibility requirements dictate CommonJS. Be explicit about file extensions and resolution rules required by the chosen toolchain.

## Do not conflate runtime execution with type checking

Node can execute supported TypeScript syntax through type stripping, but runtime type stripping is not a replacement for `tsc --noEmit` and does not mean every tsconfig transformation is honored by Node.
