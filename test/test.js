const assert = require('assert');
const betterdungeons = require('../better-dungeons');
describe('Dungeon correct', function () {
    it('should be the correct size', async function () {
        var dungeon = await betterdungeons(10, 10, 0.3, 3, 3, 'randomseed')
        var counter = 0
        for (var row = 0; row < dungeon.gridSizeLength; row++) {
            for (var column = 0; column < dungeon.gridSizeWidth; column++) {
                counter++
            }
        }
        assert.equal(counter, 100)
    })
    it('should have contains rooms', async function () {
        var dungeon = await betterdungeons(100, 10, 0.3, 3, 3, 'randomseed')
        assert.ok(dungeon.roomGrids.length > 0)
    });
});