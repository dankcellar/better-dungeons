const pathfinding = require('pathfinding');
const seedrandom = require('seedrandom');

module.exports = createDungeon;

/**
 * Create a dungeon
 * @param {Number} gridWidth
 * @param {Number} gridLength
 * @param {Number} percentWalls
 * @param {Number} minRoomWidth
 * @param {Number} minRoomLength
 * @param {String} seed
 * @return {Promise<Dungeon>}
 */
function createDungeon(gridWidth, gridLength, percentWalls, minRoomWidth, minRoomLength, seed) {
	const passes = Math.floor((Math.sqrt(gridWidth) * Math.sqrt(gridLength)) / 2);
	const dungeon = new Dungeon(gridWidth, gridLength, percentWalls, minRoomWidth, minRoomLength, seed);
	dungeon.fillRandom();
	for (let i = 0; i < passes; i++) {
		dungeon.smoothStep(dungeon.grid);
	}
	dungeon.createRooms();
	dungeon.removeRooms();
	for (let i = 0; i < passes; i++) {
		dungeon.smoothStepAroundRooms(dungeon.grid);
	}
	return dungeon;
}

function Dungeon(gridWidth, gridLength, percentWalls, minRoomWidth, minRoomLength, seed) {
	this.seed = seed;
	this.gridWidth = gridWidth;
	this.gridLength = gridLength;
	this.percentWalls = percentWalls;
	this.minRoomWidth = minRoomWidth;
	this.minRoomLength = minRoomLength;
	this.usedCells = [];
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
				this.grid[row][column] = 0;
			} else if (rng() < this.percentWalls) {
				this.grid[row][column] = 1;
			}
		}
	}
};
/*
Dungeon.prototype.fillRooms = function () {
	this.rooms.forEach((room, index) => {
		room.forEach(cell => {
			this.grid[cell.y][cell.x] = index + 2;
		});
	});
};
*/
Dungeon.prototype.fillWalkable = function () {
	for (let row = 0; row < this.gridLength; row++) {
		for (let column = 0; column < this.gridWidth; column++) {
			if (this.grid[row][column] !== 1) {
				this.grid[row][column] = 0;
			}
		}
	}
};

Dungeon.prototype.createRooms = function () {
	for (let row = 0; row < this.gridLength; row++) {
		for (let column = 0; column < this.gridWidth; column++) {
			if (this.grid[row][column] === 0 && this.isNotPartOfARoom(column, row)) {
				const roomWidth = this.countRoomWidth(column, row, 1);
				if (roomWidth >= this.minRoomWidth) {
					const possibleLengths = [];
					for (let j = 0; j < roomWidth; j++) {
						possibleLengths.push(this.countRoomLength(column + j, row, 1));
					}
					let roomLength = this.gridLength;
					possibleLengths.forEach(length => {
						if (length < roomLength) {
							roomLength = length;
						}
					});
					if (roomLength >= this.minRoomLength) {
						const room = this.getRoomArray(column, row, roomWidth, roomLength);
						this.rooms.push(room);
					}
				}
			}
		}
	}
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

	this.rooms.forEach(room => {
		const cell = room[Math.floor((room.length - 1) / 2)];
		const clone = grid.clone();
		const path = finder.findPath(cell.x, cell.y, midCell.x, midCell.y, clone);
		if (path.length === 0) {
			room.forEach(cell => {
				this.grid[cell.y][cell.x] = 1;
			});
		} else {
			this.paths.push(path);
		}
	});
};

Dungeon.prototype.smoothStep = function (grid) {
	for (let row = 0; row < this.gridLength; row++) {
		for (let column = 0; column < this.gridWidth; column++) {
			grid[row][column] = this.checkCell(column, row);
		}
	}
	this.grid = grid;
};

Dungeon.prototype.smoothStepAroundRooms = function (grid) {
	for (let row = 0; row < this.gridLength; row++) {
		for (let column = 0; column < this.gridWidth; column++) {
			grid[row][column] = this.checkCellAroundRooms(column, row);
		}
	}
	this.grid = grid;
};

Dungeon.prototype.checkCell = function (x, y) {
	let value = this.grid[y][x];
	const numWalls = this.countAdjacentWalls(x, y);
	if (this.isOutOfBounds(x, y)) {
		value = 1;
	} else if (numWalls > 4) {
		value = 1;
	} else if (numWalls < 4) {
		value = 0;
	}
	return value;
};

Dungeon.prototype.checkCellAroundRooms = function (x, y) {
	let value = this.grid[y][x];
	if (value === 0) {
		const numWalls = this.countAdjacentWalls(x, y);
		if (numWalls > 2) {
			value = 1;
		}
	}
	return value;
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
	return !this.usedCells.includes({ x, y });
};

Dungeon.prototype.countAdjacentWalls = function (x, y) {
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

Dungeon.prototype.countRoomWidth = function (x, y, counter) {
	if (this.isWall(x + 1, y)) {
		return counter;
	}
	return this.countRoomWidth(x + 1, y, counter + 1);
};

Dungeon.prototype.countRoomLength = function (x, y, counter) {
	if (this.isWall(x, y + 1)) {
		return counter;
	}
	return this.countRoomLength(x, y + 1, counter + 1);
};

Dungeon.prototype.getRoomArray = function (x, y, width, length) {
	const room = [];
	for (let row = y; row < y + length; row++) {
		for (let column = x; column < x + width; column++) {
			const cell = {
				x: column,
				y: row
			};
			room.push(cell);
			if (!this.usedCells.includes(cell)) {
				this.usedCells.push(cell);
			}
		}
	}
	return room;
};
