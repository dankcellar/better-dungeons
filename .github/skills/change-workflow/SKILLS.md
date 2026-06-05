# Skill: Change Workflow

## Use This Skill When

- You are adding a new feature or modifying dungeon generation behavior.
- You need to minimize regressions while changing better-dungeons.js.

## Core Rules

- Make the smallest possible change that satisfies the request.
- Keep exported API shape stable unless the request explicitly changes it.
- Preserve deterministic output for a fixed seed unless a behavior change is intended.
- Do not add tests in this repository.
- Do not add new dependencies unless the request requires it.

## Recommended Implementation Flow

1. Read better-dungeons.js from top to bottom and identify affected methods.
2. Trace where updated state is consumed later in createDungeonSteps().
3. Implement changes using immutable grid snapshots (copy row arrays before mutating).
4. Keep tile semantics consistent:
   - 0 walkable
   - 1 wall
   - 2 room
   - 3 hallway
5. Ensure related state stays synchronized:
   - rooms
   - roomCenters
   - connectedRooms
   - paths
6. Update README.md only when behavior, tile meanings, or usage changes.
7. If docs/demo behavior changes, update docs/demo-entry.js and docs/bundle.js together.

## Completion Checklist

- No accidental API renames in exports.
- No unreachable branches introduced in generation flow.
- No mutation leaks between intermediate grid snapshots.
- All comments and doc comments still match behavior.
