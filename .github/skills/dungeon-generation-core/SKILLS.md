# Skill: Dungeon Generation Core

## Use This Skill When

- Editing fillRandom(), smoothStep(), smoothStepAroundRooms(), createRooms(), or fillWalkable().
- Changing room shape rules, room candidate selection, or smoothing behavior.

## Project-Specific Invariants

- Border cells must remain walls.
- createRooms() must produce non-overlapping room cell arrays.
- fillRooms() projects room cells into grid tile value 2.
- smoothStepAroundRooms() should operate on wall and walkable cells without destroying room intent.
- Final createDungeonSteps() return uses fillWalkable() to normalize leftover walkable noise.

## Design Guidance

- Prefer clear rectangular-room rules over heuristic complexity.
- Keep room candidate ordering deterministic when area ties occur.
- Keep row and column loops explicit for readability in this codebase.
- Store temporary computation in local const bindings.

## Common Failure Modes

- Forgetting to reset roomCenters after room topology changes.
- Accidentally treating room or hallway cells as plain walkable during smoothing.
- Introducing out-of-bounds checks too late in nested loops.
- Breaking tie behavior in room sorting, causing seed drift.

## Safe Refactor Pattern

1. Compute candidates from current grid snapshot.
2. Resolve overlap with an occupied set.
3. Replace this.rooms in one assignment at the end.
4. Recompute derived room metadata only after final room list is set.
