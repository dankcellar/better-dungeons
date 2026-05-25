# better-dungeons

Better dungeons is a fast seedable asynchronous procedural dungeon generator that currently creates an open floor plan type of dungeon. To do this it first generates a cellular automata cave and begins to simulate life. Once finished, rectangular rooms are created within the cave to fit available space, then dedicated hallway carving runs to connect rooms to the main room region, and finally cave walls are smoothed around room boundaries.

Tile values in `dungeon.grid`:

- `0`: walkable floor
- `1`: wall
- `2`: room
- `3`: hallway (at least 2 tiles wide)

Check out the [better-dungeons interactive demo](https://dankcellar.github.io/better-dungeons/)

[![npm](https://img.shields.io/npm/v/better-dungeons.svg)](https://www.npmjs.com/package/better-dungeons)
[![npm](https://img.shields.io/npm/dt/better-dungeons.svg)](https://www.npmjs.com/package/better-dungeons)
[![CI](https://github.com/dankcellar/better-dungeons/actions/workflows/ci.yml/badge.svg)](https://github.com/dankcellar/better-dungeons/actions/workflows/ci.yml)

```bash
npm install better-dungeons
```

## Example

```js
import { createWriteStream } from "fs";
import createDungeon from "better-dungeons";

const dungeon = await createDungeon(100, 100, 0.3, 5, 5, Date.now().toString());
const file = createWriteStream("dungeon.txt");
dungeon.grid.forEach(cell => {
  file.write(cell.join(",") + "\n");
});
file.end();
```

## TODO

- Option to prefer more cave or room like features
- Generate interior walls and doors within rooms
- Better room creation for more negative space
- Add pre-made rooms
