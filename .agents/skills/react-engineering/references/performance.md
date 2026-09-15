# React performance priorities

## Highest leverage

- eliminate sequential independent awaits
- reduce shipped JavaScript and oversized dependencies
- place data fetching near the correct ownership boundary
- avoid duplicate client requests
- stream/progressively render where supported

## Rendering

Profile before adding memoization. A rerender is not automatically a performance problem. Prefer stable state ownership and smaller update surfaces over widespread memo wrappers.

## Lists

Use stable semantic keys. Virtualize genuinely large lists when DOM size/render cost is measurable.
