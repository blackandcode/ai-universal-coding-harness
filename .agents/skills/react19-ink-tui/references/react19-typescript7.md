# React 19 + TypeScript 7 notes

Use current React 19 typing behavior:

- modern JSX transform is required by React 19;
- `useRef` typing requires an initial argument;
- callback refs may return cleanup functions, so avoid accidental implicit returns;
- unparameterized `ReactElement` props default to `unknown`;
- use scoped `React.JSX` rather than relying on the old global JSX namespace when augmenting JSX types.

For TS7, remember `types` defaults to `[]`; configure required ambient types intentionally.

Do not enable React Compiler or other build-time transforms merely because React supports them. Adopt only if compatible with the Ink/toolchain and justified by measured benefit.
