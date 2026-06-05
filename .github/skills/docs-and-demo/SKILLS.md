# Skill: Docs And Demo Sync

## Use This Skill When

- Public behavior changes in better-dungeons.js.
- Tile values, generation stages, or usage examples change.
- Demo controls or rendering logic in docs/ are updated.

## Sync Targets

- README.md: feature description, tile semantics, and usage snippets.
- docs/demo-entry.js: interactive behavior and state presentation.
- docs/index.html: explanatory copy when UI behavior changes.
- docs/bundle.js: rebundled output when demo-entry changes.

## Documentation Rules

- Keep terminology consistent: room, hallway, walkable, wall.
- Keep tile values explicit and aligned with source constants.
- Prefer short practical examples over long conceptual text.

## Demo Change Protocol

1. Update docs/demo-entry.js first.
2. Rebundle docs/bundle.js from demo-entry.js.
3. Confirm README text matches actual runtime behavior.

## Pitfalls

- Updating README without reflecting actual tile behavior.
- Updating docs source without rebundling docs/bundle.js.
- Demo showing stale assumptions about room connectivity or hallway width.
