const assert = require('assert');
const betterdungeons = require('../better-dungeons');

describe('Dungeon correct', () => {
	it('should be the correct size', async () => {
		const dungeon = await betterdungeons(10, 10, 0.3, 3, 3, new Date().getTime().toString());
		let counter = 0;
		for (let row = 0; row < dungeon.gridLength; row++) {
			for (let column = 0; column < dungeon.gridWidth; column++) {
				counter++;
			}
		}
		assert.equal(counter, 100);
	});
	it('should have contain rooms', async () => {
		const dungeon = await betterdungeons(100, 100, 0.3, 5, 5, new Date().getTime().toString());
		assert.ok(dungeon.rooms.length > 0);
	});
});
