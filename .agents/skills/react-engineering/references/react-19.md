# React 19 notes

React 19 introduced/normalized APIs that can simplify async actions, forms and ref usage. Apply them when they make the local design clearer; do not migrate working code merely for novelty.

Check framework compatibility before using server-only or framework-integrated features. React itself and a particular React framework are not interchangeable.

When upgrading older components, consider whether `forwardRef` wrappers are still necessary under the project's React 19 toolchain.
