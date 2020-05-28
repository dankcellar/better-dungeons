# better-dungeons

Better dungeons is a fast seedable asynchronous procedural dungeon generator that currently only creates an open floor plan dungeon. To do this it first generates a cellular automata cave and begins to simulate life. Once finished, rectangular rooms will be created within the cave to fit all the available space and the cave walls are smoothed to the shape of the rooms. These rooms are then tested using pathfinding to ensure connectivity to the major rooms within the dungeon.

Check out a simple demo [here](https://edowney29.github.io/better-dungeons/index.html)

[![npm](https://img.shields.io/npm/v/better-dungeons.svg)](https://www.npmjs.com/package/better-dungeons)
[![npm](https://img.shields.io/npm/dt/better-dungeons.svg)](https://www.npmjs.com/package/better-dungeons)
[![Build Status](https://travis-ci.org/edowney29/better-dungeons.svg?branch=master)](https://travis-ci.org/edowney29/better-dungeons)

```
npm install better-dungeons
```

## Example

```js
const fs = require("fs");
const betterdungeons = require("better-dungeons");

CreateDungeon(100, 100, 0.3, 5, 5, Date.now().toString());

async function CreateDungeon(
  gridWidth,
  gridLength,
  percent,
  roomWidth,
  roomLength,
  seed
) {
  try {
    const dungeon = await betterdungeons(
      gridWidth,
      gridLength,
      percent,
      roomWidth,
      roomLength,
      seed
    );
    const file = fs.createWriteStream("dungeon.txt");
    dungeon.grid.forEach(cell => {
      file.write(cell.join(",") + "\n");
    });
    file.end();
  } catch (err) {
    console.log(err);
  }
}
```

## TODO

- Option to perfer more cave or room like features
- Generate interior walls and doors within rooms
- Better room creation for more negative space
- Add pre-made rooms
