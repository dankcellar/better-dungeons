# better-dungeons

Better dungeons is a fast asynchronous seedable procedural dungeon generator that currently only creates an open floor plan dungeon. To do this it first generates a cellular automata cave and begins to simulate life. Once finished, rectangular rooms will be created within the cave to fit all the available space and the cave walls are smoothed to the shape of the rooms. These rooms are then tested using pathfinding to ensure connectivity to the major rooms within the dungeon.

![npm](https://img.shields.io/npm/v/better-dungeons.svg) ![npm](https://img.shields.io/npm/dt/better-dungeons.svg) [![Build Status](https://travis-ci.org/edowney29/better-dungeons.svg?branch=master)](https://travis-ci.org/edowney29/better-dungeons) 

```
npm install better-dungeons
```

## Example

```js
const fs = require('fs')
const betterdungeons = require('better-dungeons')

var dungeon = await betterdungeons(100, 100, 0.3, 5, 5, Date.now().toString())
var file = fs.createWriteStream('dungeon.txt');
dungeon.gridArray.forEach(cell => {
  file.write(cell.join('') + '\n');
});
file.end();
```

## TODO

- Option to mix cave features in with dungeon
- Generate interior walls and doors within rooms
- Better room creation for more negative space
- Add pre-made rooms
- Online demostration