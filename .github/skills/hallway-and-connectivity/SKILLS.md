# Skill: Hallway And Connectivity

## Use This Skill When

- Editing createHallways(), findPathBetweenPoints(), carveWideHallway(), or connectivity helpers.
- Changing how rooms are connected or which rooms are considered reachable.

## Connectivity Contract

- If two or more rooms exist, hallway generation should create a spanning connection strategy.
- Hallways are tile value 3.
- Hallway carving must not remove border walls.
- connectedRooms should represent rooms reachable in the current carved grid.

## Pathfinding Rules

- Use A* with a cost preference that allows crossing walls but favors existing open space.
- Keep acceptable tile list aligned with tile constants.
- Build finder from current grid snapshot used for carving.

## Hallway Width Rules

- Carve paths at minimum width 2 cells where possible.
- For diagonal motion, stamp orthogonal companion cells to avoid thin diagonal cuts.
- Deduplicate carved cells using coordinate-key sets.

## Typical Pitfalls

- Reusing stale room centers after room edits.
- Computing connectivity from a different grid than the one just carved.
- Failing to guard out-of-bounds in stamp expansion.
- Updating paths without also updating connectedRooms.

## Minimal Verification Pass

- Zero rooms: connectedRooms and paths should both be empty.
- One room: connectedRooms should include only index 0 and paths should be empty.
- Multiple rooms: connectedRooms length should monotonically increase after hallway carving.
