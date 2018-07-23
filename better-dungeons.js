const pathfinding = require('pathfinding');
const seedrandom = require('seedrandom');

module.exports = createDungeon;

/**
 * Create a dungeon
 * @param {number} gridSizeWidth
 * @param {number} gridSizeLength
 * @param {number} percentAreWalls
 * @param {number} minRoomSizeWidth
 * @param {number} minRoomSizeLength
 * @param {string} seed
 */
function createDungeon(gridSizeWidth, gridSizeLength, percentAreWalls, minRoomSizeWidth, minRoomSizeLength, seed) {
	const passes = Math.floor((Math.sqrt(gridSizeWidth) * Math.sqrt(gridSizeLength)) / 2);
	return Promise.resolve(new Dungeon(gridSizeWidth, gridSizeLength, percentAreWalls, minRoomSizeWidth, minRoomSizeLength, seed))
		.then(dungeon => {
			dungeon.fillRandom();
			return dungeon;
		})
		.then(dungeon => {
			for (let i = 0; i < passes; i++) {
				dungeon.smoothStep();
			}
			return dungeon;
		})
		.then(dungeon => {
			dungeon.createRooms();
			return dungeon;
		})
		.then(dungeon => {
			for (let i = 0; i < passes; i++) {
				dungeon.smoothStepAroundRooms();
			}
			return dungeon;
		})
		.then(dungeon => {
			dungeon.fillRooms();
			return dungeon;
		})
		.then(dungeon => {
			dungeon.fillWalkable();
			return dungeon;
		})
		.then(dungeon => {
			dungeon.removeRooms();
			return dungeon;
		})
		.catch(err => {
			throw err;
		});
}

function Dungeon(gridSizeWidth, gridSizeLength, percentAreWalls, minRoomSizeWidth, minRoomSizeLength, seed) {
	this.seed = seed;
	this.gridSizeWidth = gridSizeWidth;
	this.gridSizeLength = gridSizeLength;
	this.percentAreWalls = percentAreWalls;
	this.minRoomSizeWidth = minRoomSizeWidth;
	this.minRoomSizeLength = minRoomSizeLength;
	this.walkableCells = 0;
	this.rooms = [];
	this.paths = [];
	this.grid = new Array(gridSizeLength).fill(0).map(() => new Array(gridSizeWidth).fill(0));
}

Dungeon.prototype.fillRandom = function () {
	for (let row = 0; row < this.gridSizeLength; row++) {
		for (let column = 0; column < this.gridSizeWidth; column++) {
			const rng = seedrandom(`${this.seed}-${this.gridSizeWidth}-${this.gridSizeLength}-${column}-${row}`);
			if (column === 0) {
				this.grid[row][column] = 1;
			} else if (row === 0) {
				this.grid[row][column] = 1;
			} else if (column === this.gridSizeWidth - 1) {
				this.grid[row][column] = 1;
			} else if (row === this.gridSizeLength - 1) {
				this.grid[row][column] = 1;
			} else if (this.isMiddleRoom(column, row)) {
				this.grid[row][column] = 2;
			} else if (rng() < this.percentAreWalls) {
				this.grid[row][column] = 1;
			}
		}
	}
};

Dungeon.prototype.fillRooms = function () {
	let counter = 3;
	this.rooms.forEach(room => {
		room.forEach(cell => {
			this.grid[cell.y][cell.x] = counter;
		});
		counter++;
	});
};

Dungeon.prototype.fillWalkable = function () {
	for (let row = 0; row < this.gridSizeLength; row++) {
		for (let column = 0; column < this.gridSizeWidth; column++) {
			if (this.grid[row][column] !== 1) {
				this.grid[row][column] = 0;
				this.walkableCells += 1;
			}
		}
	}
};

Dungeon.prototype.creatWall = function (x, y) {
	let value = this.grid[y][x];
	const numWalls = this.getAdjacentWalls(x, y);
	if (this.isOutOfBounds(x, y)) {
		value = 1;
	} else if (numWalls > 4) {
		value = 1;
	} else if (numWalls < 4) {
		value = 0;
	}
	return value;
};

Dungeon.prototype.createRooms = function () {
	const promises = [];
	for (let row = 0; row < this.gridSizeLength; row++) {
		for (let column = 0; column < this.gridSizeWidth; column++) {
			const p = new Promise(resolve => {
				if (this.grid[row][column] === 0 && this.isNotPartOfARoom(column, row)) {
					const roomWidth = this.getRoomWidth(column, row, 1);
					if (roomWidth >= this.minRoomSizeWidth) {
						const possibleLengths = [];
						for (let j = 0; j < roomWidth; j++) {
							possibleLengths.push(this.getRoomLength(column + j, row, 1));
						}
						let roomLength = this.gridSizeLength;
						possibleLengths.forEach(length => {
							if (length < roomLength) {
								roomLength = length;
							}
						});
						if (roomLength >= this.minRoomSizeLength && roomLength !== this.gridSizeLength) {
							const roomGrid = this.getRoomGrid(column, row, roomWidth, roomLength);
							resolve(roomGrid);
						}
					}
				}
				resolve(null);
			});
			promises.push(p);
		}
	}
	Promise.all(promises)
		.then(rooms => {
			this.rooms = rooms.filter(room => room !== null);
		})
		.catch(err => console.log(err));
};

Dungeon.prototype.creatWallAroundRooms = function (x, y) {
	let value = this.grid[y][x];
	if (value === 0) {
		const numWalls = this.getAdjacentWalls(x, y);
		if (numWalls > 2) {
			value = 1;
		}
	}
	return value;
};

Dungeon.prototype.removeRooms = function () {
	const midCell = {
		x: Math.floor((this.gridSizeWidth - 1) / 2),
		y: Math.floor((this.gridSizeLength - 1) / 2)
	}
	const grid = new pathfinding.Grid(this.grid);
	const finder = new pathfinding.AStarFinder({
		diagonalMovement: pathfinding.DiagonalMovement.Never
	});
	const promises = [];
	this.rooms.forEach((room, index) => {
		const p = new Promise(resolve => {
			const cell = room[Math.floor((room.length - 1) / 2)];
			const gridClone = grid.clone();
			const pathGrid = finder.findPath(cell.x, cell.y, midCell.x, midCell.y, gridClone);
			resolve({
				pathGrid,
				index
			});
		});
		promises.push(p);
	});
	Promise.all(promises)
		.then(paths => {
			const roomGrids = [];
			const pathGrids = [];
			paths.forEach(path => {
				if (path.pathGrid.length === 0) {
					const grid = this.rooms[path.index];
					grid.forEach(cell => {
						this.grid[cell.y][cell.x] = 1;
					});
				} else {
					roomGrids.push(this.rooms[path.index]);
					pathGrids.push(path.pathGrid);
				}
			});
			this.rooms = roomGrids;
			this.paths = pathGrids;
		})
		.catch(err => console.log(err));
};

Dungeon.prototype.smoothStep = function () {
	for (let row = 0; row < this.gridSizeLength; row++) {
		for (let column = 0; column < this.gridSizeWidth; column++) {
			this.grid[row][column] = this.creatWall(column, row);
		}
	}
};

Dungeon.prototype.smoothStepAroundRooms = function () {
	for (let row = 0; row < this.gridSizeLength; row++) {
		for (let column = 0; column < this.gridSizeWidth; column++) {
			this.grid[row][column] = this.creatWallAroundRooms(column, row);
		}
	}
};

Dungeon.prototype.isMiddleRoom = function (x, y) {
	const midX = Math.floor((this.gridSizeWidth - 1) / 2);
	const midY = Math.floor((this.gridSizeLength - 1) / 2);
	if (midX - this.minRoomSizeWidth <= x && x <= midX + this.minRoomSizeWidth) {
		if (midY - this.minRoomSizeLength <= y && y <= midY + this.minRoomSizeLength) {
			return true;
		}
	}
	return false;
};

Dungeon.prototype.isWall = function (x, y) {
	if (this.isOutOfBounds(x, y)) {
		return true;
	}
	if (this.grid[y][x] === 1) {
		return true;
	}
	return false;
};

Dungeon.prototype.isOutOfBounds = function (x, y) {
	if (x <= 0 || y <= 0) {
		return true;
	}
	if (x >= this.gridSizeWidth - 1 || y >= this.gridSizeLength - 1) {
		return true;
	}
	return false;
};

Dungeon.prototype.isNotPartOfARoom = function (x, y) {
	this.rooms.forEach(room => {
		room.forEach(cell => {
			if (cell.x === x && cell.y === y) {
				return false;
			}
		});
	});
	return true;
};

Dungeon.prototype.getAdjacentWalls = function (x, y) {
	let wallCounter = 0;
	if (this.isWall(x - 1, y - 1)) {
		wallCounter++;
	}
	if (this.isWall(x - 1, y)) {
		wallCounter++;
	}
	if (this.isWall(x - 1, y + 1)) {
		wallCounter++;
	}
	if (this.isWall(x, y - 1)) {
		wallCounter++;
	}
	if (this.isWall(x, y)) {
		wallCounter++;
	}
	if (this.isWall(x, y + 1)) {
		wallCounter++;
	}
	if (this.isWall(x + 1, y - 1)) {
		wallCounter++;
	}
	if (this.isWall(x + 1, y)) {
		wallCounter++;
	}
	if (this.isWall(x + 1, y + 1)) {
		wallCounter++;
	}
	return wallCounter;
};

Dungeon.prototype.getRoomWidth = function (x, y, counter) {
	if (this.isWall(x + 1, y)) {
		return counter;
	}
	return this.getRoomWidth(x + 1, y, counter + 1);
};

Dungeon.prototype.getRoomLength = function (x, y, counter) {
	if (this.isWall(x, y + 1)) {
		return counter;
	}
	return this.getRoomLength(x, y + 1, counter + 1);
};

Dungeon.prototype.getRoomGrid = function (x, y, width, length) {
	const roomGrid = [];
	for (let row = y; row < y + length; row++) {
		for (let column = x; column < x + width; column++) {
			roomGrid.push({
				x: column,
				y: row
			});
		}
	}
	return roomGrid;
};
