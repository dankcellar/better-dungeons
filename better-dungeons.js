const easystarjs = require('easystarjs');
const seedrandom = require('seedrandom');

class Dungeon {
  constructor(gridWidth, gridLength, percentWalls, minRoomWidth, minRoomLength, seed) {
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

  fillRandom() {
    for (let row = 0; row < this.gridLength; row += 1) {
      for (let column = 0; column < this.gridWidth; column += 1) {
        const prng = seedrandom(`${this.seed}-${this.gridWidth}-${this.gridLength}-${column}-${row}`);
        if (
          column === 0 ||
          row === 0 ||
          column === this.gridWidth - 1 ||
          row === this.gridLength - 1 ||
          prng() <= this.percentWalls
        ) {
          this.grid[row][column] = 1;
        }
        if (this.isMiddleRoom(column, row)) {
          this.grid[row][column] = 0;
        }
      }
    }
  }

  fillRooms() {
    this.rooms.forEach((room, index) => {
      room.forEach((cell) => {
        this.grid[cell.y][cell.x] = index + 2;
      });
    });
  }

  fillWalkable() {
    for (let row = 0; row < this.gridLength; row += 1) {
      for (let column = 0; column < this.gridWidth; column += 1) {
        if (this.grid[row][column] !== 1) {
          this.grid[row][column] = 0;
          this.walkableCells += 1;
        }
      }
    }
  }

  async createRooms() {
    const promises = [];
    for (let row = 0; row < this.gridLength; row += 1) {
      for (let column = 0; column < this.gridWidth; column += 1) {
        const p = new Promise((resolve) => {
          if (this.grid[row][column] !== 1) {
            const roomWidth = this.countRoomWidth(column, row, 1);
            if (roomWidth >= this.minRoomWidth) {
              const possibleLengths = [];
              for (let j = 0; j < roomWidth; j += 1) {
                possibleLengths.push(this.countRoomLength(column + j, row, 1));
              }
              let roomLength = this.gridLength;
              possibleLengths.forEach((length) => {
                if (length < roomLength) {
                  roomLength = length;
                }
              });
              if (roomLength >= this.minRoomLength && roomLength !== this.gridLength) {
                resolve(getRoomGrid(column, row, roomWidth, roomLength));
              }
            }
          }
          resolve(null);
        });
        promises.push(p);
      }
    }
    const rooms = await Promise.all(promises);
    this.rooms = rooms.filter((room) => room !== null);
  }

  async removeRooms() {
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
  }

  smoothStep() {
    for (let row = 0; row < this.gridLength; row += 1) {
      for (let column = 0; column < this.gridWidth; column += 1) {
        if (this.grid[row][column] <= 1) {
          this.grid[row][column] = this.creatWall(column, row);
        }
      }
    }
  }

  smoothStepAroundRooms() {
    for (let row = 0; row < this.gridLength; row += 1) {
      for (let column = 0; column < this.gridWidth; column += 1) {
        if (this.grid[row][column] <= 1) {
          this.grid[row][column] = this.creatWallAroundRooms(column, row);
        }
      }
    }
  }

  creatWall(x, y) {
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
  }

  creatWallAroundRooms(x, y) {
    let value = this.grid[y][x];
    const numWalls = this.countAdjacentWalls(x, y);
    if (numWalls > 2) {
      value = 1;
    }
    return value;
  }

  isMiddleRoom(x, y) {
    const midX = Math.floor((this.gridWidth - 1) / 2);
    const midY = Math.floor((this.gridLength - 1) / 2);
    if (midX - this.minRoomWidth <= x && x <= midX + this.minRoomWidth) {
      if (midY - this.minRoomLength <= y && y <= midY + this.minRoomLength) {
        return true;
      }
    }
    return false;
  }

  isWall(x, y) {
    if (this.isOutOfBounds(x, y)) {
      return true;
    }
    if (this.grid[y][x] === 1) {
      return true;
    }
    return false;
  }

  isOutOfBounds(x, y) {
    if (x <= 0 || y <= 0) {
      return true;
    }
    if (x >= this.gridWidth - 1 || y >= this.gridLength - 1) {
      return true;
    }
    return false;
  }

  countAdjacentWalls(x, y) {
    let wallCounter = 0;
    if (this.isWall(x - 1, y - 1)) {
      wallCounter += 1;
    }
    if (this.isWall(x - 1, y)) {
      wallCounter += 1;
    }
    if (this.isWall(x - 1, y + 1)) {
      wallCounter += 1;
    }
    if (this.isWall(x, y - 1)) {
      wallCounter += 1;
    }
    if (this.isWall(x, y)) {
      wallCounter += 1;
    }
    if (this.isWall(x, y + 1)) {
      wallCounter += 1;
    }
    if (this.isWall(x + 1, y - 1)) {
      wallCounter += 1;
    }
    if (this.isWall(x + 1, y)) {
      wallCounter += 1;
    }
    if (this.isWall(x + 1, y + 1)) {
      wallCounter += 1;
    }
    return wallCounter;
  }

  countRoomWidth(x, y, counter) {
    if (this.isWall(x + 1, y)) {
      return counter;
    }
    return this.countRoomWidth(x + 1, y, counter + 1);
  }

  countRoomLength(x, y, counter) {
    if (this.isWall(x, y + 1)) {
      return counter;
    }
    return this.countRoomLength(x, y + 1, counter + 1);
  }
}

function getRoomGrid(x, y, width, length) {
  const roomGrid = [];
  for (let row = y; row < y + length; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      roomGrid.push({
        x: column,
        y: row,
      });
    }
  }
  return roomGrid;
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
const createDungeon = async (gridWidth, gridLength, percentWalls, minRoomWidth, minRoomLength, seed) => {
  const passes = Math.floor((Math.sqrt(gridWidth) * Math.sqrt(gridLength)) / 2);
  const dungeon = new Dungeon(gridWidth, gridLength, percentWalls, minRoomWidth, minRoomLength, seed);
  dungeon.fillRandom();
  for (let i = 0; i < passes; i += 1) {
    dungeon.smoothStep();
  }
  await dungeon.createRooms();
  await dungeon.removeRooms();
  dungeon.fillRooms();
  for (let i = 0; i < passes; i += 1) {
    dungeon.smoothStepAroundRooms();
  }
  return dungeon;
};

module.exports = createDungeon;
// createDungeon(100, 100, 1 / 3, 5, 5, Date.now());
