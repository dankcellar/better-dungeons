# better-dungeons
> A Brouge Procedural Dungeon Generator For Javascript :)

[![Build Status](https://travis-ci.org/edowney29/better-dungeons.svg?branch=master)](https://travis-ci.org/edowney29/better-dungeons) 

## Install

```
npm install better-dungeons
```

## Usage

```js
var dungeon = await betterdungeons(100, 100, 0.3, 5, 5, Date.now().toString())
var file = fs.createWriteStream('dungeon.txt');
dungeon.mapArray.forEach(grid => {
  file.write(grid.join('') + '\n');
});
file.end();
```