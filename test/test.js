const assert = require('assert');
const betterdungeons = require('../better-dungeons');

describe('Create new Dungeon', () => {
  it('should be the correct size', async () => {
    const dungeon = await betterdungeons(10, 10, 1 / 3, 2, 2, new Date().getTime().toString());
    let counter = 0;
    for (let row = 0; row < dungeon.gridLength; row += 1) {
      for (let column = 0; column < dungeon.gridWidth; column += 1) {
        counter += 1;
      }
    }
    console.log(`Area of grid: ${counter}`);
    assert.equal(counter, 100);
  });
  it('should have some rooms', async () => {
    const dungeon = await betterdungeons(100, 100, 1 / 3, 5, 5, new Date().getTime().toString());
    console.log(`Number of rooms: ${dungeon.rooms.length}`);
    assert.ok(dungeon.rooms.length > 0 && dungeon.paths.length > 0);
  });
  /*
  it('should set walkable tiles to 0', async () => {
    const dungeon = await betterdungeons(100, 100, 0.3, 5, 5, new Date().getTime().toString());
    console.log(`Walkable tiles: ${dungeon.rooms.length}`);
    assert.ok(dungeon.rooms.length > 0 && dungeon.paths.length > 0);
  });
  */
});
