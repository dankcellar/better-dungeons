# better-dungeons

![npm](https://img.shields.io/npm/dt/better-dungeons.svg) ![npm](https://img.shields.io/npm/v/better-dungeons.svg) [![Build Status](https://travis-ci.org/edowney29/better-dungeons.svg?branch=master)](https://travis-ci.org/edowney29/better-dungeons) 

## Install

```
npm install better-dungeons
```

## Usage

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