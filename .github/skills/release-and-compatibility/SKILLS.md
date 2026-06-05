# Skill: Release And Compatibility

## Use This Skill When

- Modifying exports, package metadata, or repository distribution files.
- Preparing changes that affect downstream consumers.

## Public Surface To Protect

- Default export: createDungeon.
- Named export: createDungeonSteps.
- Output object shape used by consumers:
  - grid
  - rooms
  - roomCenters
  - connectedRooms
  - paths

## Packaging Constraints

- Keep package.json exports and files list aligned with actual shipped files.
- Keep module type and entry points unchanged unless explicitly requested.
- Preserve Node engine constraint unless requirements change.

## Release Safety Checklist

- No accidental breaking rename in exported symbols.
- README usage imports still valid.
- LICENSE and metadata remain intact.
- Docs references still point to existing behavior.

## Versioning Guidance

- Patch: internal behavior fixes with same API.
- Minor: additive behavior or new options with backward compatibility.
- Major: breaking API or output contract changes.
