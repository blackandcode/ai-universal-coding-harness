# React Compiler guidance

React Compiler is a build-time optimizer designed to understand the Rules of React and automatically handle many memoization opportunities.

## Application projects

If enabled, prefer compiler-friendly component purity over manual memoization everywhere.

Do not delete all memoization blindly. Keep explicit memoization when:

- identity is observable by an external API;
- dependency identity is intentionally part of a contract;
- measurement shows the compiler does not cover a hot path;
- a library/API requires stable references.

Use current compiler diagnostics and React Hooks lint rules as feedback.

## Library projects

Libraries can publish compiler-optimized code. If doing so:

- compile in the library build, not consumer runtime;
- target the documented React compatibility baseline;
- test compiled output;
- test a consumer that does not itself use React Compiler;
- keep peer dependencies accurate.

For React 19, the compiler can target React 19's built-in runtime APIs without the compatibility runtime package needed by React 17/18.
