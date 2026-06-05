# Skill: Performance And Determinism

## Use This Skill When

- Optimizing loops in better-dungeons.js.
- Changing PRNG usage, random room selection, or sort behavior.
- Adjusting pathfinding or flood-fill algorithms.

## Determinism Requirements

- For the same input arguments and seed, output must be stable.
- Random calls must happen in consistent order between runs.
- Avoid replacing deterministic sort tie-breakers with unstable logic.

## Performance Guidance

- Avoid repeated full-grid clones unless algorithmically required.
- Cache grid dimensions and frequently reused values in local const bindings.
- Keep coordinate-key generation simple and allocation-light.
- Favor iterative loops over recursive flood fill.

## High-Impact Hotspots

- Nested grid scans in createRooms() and smoothing passes.
- Per-segment hallway stamp expansion.
- getConnectedCellsFrom() traversal breadth.

## Regression Signals

- Seed no longer reproduces previous layout under unchanged parameters.
- Significant extra paths carved for the same room count.
- Large maps showing noticeable increase in generation steps or memory churn.
