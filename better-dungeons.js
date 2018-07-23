const pathfinding = require('pathfinding');
const seedrandom = require('seedrandom');

module.exports = createDungeon;

/**
 * Create a dungeon
 * @param {number} gridWidth
 * @param {number} gridLength
 * @param {number} percentWalls
 * @param {number} minRoomWidth
 * @param {number} minRoomLength
 * @param {string} seed
 */
function createDungeon(gridWidth, gridLength, percentWalls, minRoomWidth, minRoomLength, seed) {
	const passes = Math.floor((Math.sqrt(gridWidth) * Math.sqrt(gridLength)) / 2);
	return Promise.resolve(new Dungeon(gridWidth, gridLength, percentWalls, minRoomWidth, minRoomLength, seed))
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

function Dungeon(gridWidth, gridLength, percentWalls, minRoomWidth, minRoomLength, seed) {
	this.seed = seed;
	this.gridWidth = gridWidth;
	this.gridLength = gridLength;
	this.percentWalls = percentWalls;
	this.minRoomWidth = minRoomWidth;
	this.minRoomLength = minRoomLength;
	this.walkableCells = 0;
	this.rooms = [];
	this.paths = [];
	this.grid = new Array(gridLength).fill(0).map(() => new Array(gridWidth).fill(0));
}

Dungeon.prototype.fillRandom = function () {
	for (let row = 0; row < this.gridLength; row++) {
		for (let column = 0; column < this.gridWidth; column++) {
			const rng = seedrandom(`${this.seed}-${this.gridWidth}-${this.gridLength}-${column}-${row}`);
			if (column === 0) {
				this.grid[row][column] = 1;
			} else if (row === 0) {
				this.grid[row][column] = 1;
			} else if (column === this.gridWidth - 1) {
				this.grid[row][column] = 1;
			} else if (row === this.gridLength - 1) {
				this.grid[row][column] = 1;
			} else if (this.isMiddleRoom(column, row)) {
				this.grid[row][column] = 2;
			} else if (rng() < this.percentWalls) {
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
	for (let row = 0; row < this.gridLength; row++) {
		for (let column = 0; column < this.gridWidth; column++) {
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
	for (let row = 0; row < this.gridLength; row++) {
		for (let column = 0; column < this.gridWidth; column++) {
			const p = new Promise(resolve => {
				if (this.grid[row][column] === 0 && this.isNotPartOfARoom(column, row)) {
					const roomWidth = this.getRoomWidth(column, row, 1);
					if (roomWidth >= this.minRoomWidth) {
						const possibleLengths = [];
						for (let j = 0; j < roomWidth; j++) {
							possibleLengths.push(this.getRoomLength(column + j, row, 1));
						}
						let roomLength = this.gridLength;
						possibleLengths.forEach(length => {
							if (length < roomLength) {
								roomLength = length;
							}
						});
						if (roomLength >= this.minRoomLength && roomLength !== this.gridLength) {
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
		x: Math.floor((this.gridWidth - 1) / 2),
		y: Math.floor((this.gridLength - 1) / 2)
	};
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
	for (let row = 0; row < this.gridLength; row++) {
		for (let column = 0; column < this.gridWidth; column++) {
			this.grid[row][column] = this.creatWall(column, row);
		}
	}
};

Dungeon.prototype.smoothStepAroundRooms = function () {
	for (let row = 0; row < this.gridLength; row++) {
		for (let column = 0; column < this.gridWidth; column++) {
			this.grid[row][column] = this.creatWallAroundRooms(column, row);
		}
	}
};

Dungeon.prototype.isMiddleRoom = function (x, y) {
	const midX = Math.floor((this.gridWidth - 1) / 2);
	const midY = Math.floor((this.gridLength - 1) / 2);
	if (midX - this.minRoomWidth <= x && x <= midX + this.minRoomWidth) {
		if (midY - this.minRoomLength <= y && y <= midY + this.minRoomLength) {
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
	if (x >= this.gridWidth - 1 || y >= this.gridLength - 1) {
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
