const easystarjs = require('easystarjs');
const seedrandom = require('seedrandom');

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
async function createDungeon(gridWidth, gridLength, percentWalls, minRoomWidth, minRoomLength, seed) {
  const passes = Math.floor((Math.sqrt(gridWidth) * Math.sqrt(gridLength)) / 2);
  const dungeon = new Dungeon(gridWidth, gridLength, percentWalls, minRoomWidth, minRoomLength, seed);
  dungeon.fillRandom();
  for (let i = 0; i < passes; i++) {
    dungeon.smoothStep();
  }

  await dungeon.createRooms();
  await dungeon.removeRooms();
  dungeon.fillRooms();
  for (let i = 0; i < passes; i++) {
    dungeon.smoothStepAroundRooms();
  }

  return dungeon;
}


Dungeon.prototype.fillRandom = () => {
  for (let row = 0; row < this.gridLength; row++) {
    for (let column = 0; column < this.gridWidth; column++) {
      const rng = seedrandom(`${this.seed}-${this.gridWidth}-${this.gridLength}-${column}-${row}`);
      if (column === 0 || row === 0 || column === this.gridWidth - 1 || row === this.gridLength - 1 || rng() <= this.percentWalls) {
        this.grid[row][column] = 1;
      }

      if (this.isMiddleRoom(column, row)) {
        this.grid[row][column] = 0;
      }
    }
  }
};

Dungeon.prototype.fillRooms = () => {
  this.rooms.forEach((room, index) => {
    room.forEach((cell) => {
      this.grid[cell.y][cell.x] = index + 2;
    });
  });
};

Dungeon.prototype.fillWalkable = () => {
  for (let row = 0; row < this.gridLength; row++) {
    for (let column = 0; column < this.gridWidth; column++) {
      if (this.grid[row][column] !== 1) {
        this.grid[row][column] = 0;
        this.walkableCells += 1;
      }
    }
  }
};

Dungeon.prototype.createRooms = async () => {
  const promises = [];
  for (let row = 0; row < this.gridLength; row++) {
    for (let column = 0; column < this.gridWidth; column++) {
      const p = new Promise((resolve) => {
        if (this.grid[row][column] !== 1) {
          const roomWidth = this.countRoomWidth(column, row, 1);
          if (roomWidth >= this.minRoomWidth) {
            const possibleLengths = [];
            for (let j = 0; j < roomWidth; j++) {
              possibleLengths.push(this.countRoomLength(column + j, row, 1));
            }

            let roomLength = this.gridLength;
            possibleLengths.forEach((length) => {
              if (length < roomLength) {
                roomLength = length;
              }
            });
            if (roomLength >= this.minRoomLength && roomLength !== this.gridLength) {
              const room = this.getRoomGrid(column, row, roomWidth, roomLength);
              resolve(room);
            }
          }
        }

        resolve(null);
      });
      promises.push(p);
    }
  }

  const rooms = await Promise.all(promises);
  this.rooms = rooms.filter(room => room !== null);
};

Dungeon.prototype.removeRooms = async () => {
  const midCell = {
    x: Math.floor((this.gridWidth - 1) / 2),
    y: Math.floor((this.gridLength - 1) / 2),
  };
  const easystar = new easystarjs.js();
  easystar.setGrid(this.grid);
  easystar.setAcceptableTiles([0]);
  const promises = [];
  this.rooms.forEach((room) => {
    const p = new Promise((resolve) => {
      const cell = room[Math.floor((room.length - 1) / 2)];
      easystar.findPath(cell.x, cell.y, midCell.x, midCell.y, (path) => {
        resolve(path);
      });
      easystar.calculate();
    });
    promises.push(p);
  });
  const rooms = [];
  const paths = await Promise.all(promises);
  paths.forEach((path, index) => {
    if (path) {
      this.paths.push(path);
      rooms.push(this.rooms[index]);
    }
  });
  this.rooms = rooms;
};

Dungeon.prototype.smoothStep = () => {
  for (let row = 0; row < this.gridLength; row++) {
    for (let column = 0; column < this.gridWidth; column++) {
      if (this.grid[row][column] <= 1) {
        this.grid[row][column] = this.creatWall(column, row);
      }
    }
  }
};

Dungeon.prototype.smoothStepAroundRooms = () => {
  for (let row = 0; row < this.gridLength; row++) {
    for (let column = 0; column < this.gridWidth; column++) {
      if (this.grid[row][column] <= 1) {
        this.grid[row][column] = this.creatWallAroundRooms(column, row);
      }
    }
  }
};

Dungeon.prototype.creatWall = (x, y) => {
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

Dungeon.prototype.creatWallAroundRooms = (x, y) => {
  let value = this.grid[y][x];
  const numWalls = this.countAdjacentWalls(x, y);
  if (numWalls > 2) {
    value = 1;
  }

  return value;
};

Dungeon.prototype.isMiddleRoom = (x, y) => {
  const midX = Math.floor((this.gridWidth - 1) / 2);
  const midY = Math.floor((this.gridLength - 1) / 2);
  if (midX - this.minRoomWidth <= x && x <= midX + this.minRoomWidth) {
    if (midY - this.minRoomLength <= y && y <= midY + this.minRoomLength) {
      return true;
    }
  }

  return false;
};

Dungeon.prototype.isWall = (x, y) => {
  if (this.isOutOfBounds(x, y)) {
    return true;
  }

  if (this.grid[y][x] === 1) {
    return true;
  }

  return false;
};

Dungeon.prototype.isOutOfBounds = (x, y) => {
  if (x <= 0 || y <= 0) {
    return true;
  }

  if (x >= this.gridWidth - 1 || y >= this.gridLength - 1) {
    return true;
  }

  return false;
};

Dungeon.prototype.countAdjacentWalls = (x, y) => {
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

Dungeon.prototype.countRoomWidth = (x, y, counter) => {
  if (this.isWall(x + 1, y)) {
    return counter;
  }

  return this.countRoomWidth(x + 1, y, counter + 1);
};

Dungeon.prototype.countRoomLength = (x, y, counter) => {
  if (this.isWall(x, y + 1)) {
    return counter;
  }

  return this.countRoomLength(x, y + 1, counter + 1);
};

Dungeon.prototype.getRoomGrid = (x, y, width, length) => {
  const room = [];
  for (let row = y; row < y + length; row++) {
    for (let column = x; column < x + width; column++) {
      room.push({
        x: column,
        y: row,
      });
    }
  }

  return room;
};

module.exports = createDungeon;
