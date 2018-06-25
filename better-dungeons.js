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
    var passes = Math.floor(Math.sqrt(gridSizeWidth) * Math.sqrt(gridSizeLength) / 2);
    return Promise.resolve(new Dungeon(gridSizeWidth, gridSizeLength, percentAreWalls, minRoomSizeWidth, minRoomSizeLength, seed))
        .then(dungeon => {
            dungeon.fillRandom();
            return dungeon;
        })
        .then(dungeon => {
            for (var i = 0; i < passes; i++) {
                dungeon.smoothStep();
            }
            return dungeon;
        })
        .then(dungeon => {
            dungeon.createRooms();
            return dungeon;
        })
        .then(dungeon => {
            for (var i = 0; i < passes; i++) {
                dungeon.smoothStepHarder();
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
            dungeon.removeRoomsNotConnected();
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
    this.roomGrids = [];
    this.walkableArea = 0;
    this.gridArray = new Array(gridSizeLength).fill(0).map(() => new Array(gridSizeWidth).fill(0));
}

Dungeon.prototype.fillRandom = function () {
    for (var row = 0; row < this.gridSizeLength; row++) {
        for (var column = 0; column < this.gridSizeWidth; column++) {
            var rng = seedrandom(`${this.seed}-${this.gridSizeWidth}-${this.gridSizeLength}-${column}-${row}`);
            if (column == 0)
                this.gridArray[row][column] = 1;
            else if (row == 0)
                this.gridArray[row][column] = 1;
            else if (column == this.gridSizeWidth - 1)
                this.gridArray[row][column] = 1;
            else if (row == this.gridSizeLength - 1)
                this.gridArray[row][column] = 1;
            else if (this.isMiddleRoom(column, row))
                this.gridArray[row][column] = 2;
            else if (rng() < this.percentAreWalls)
                this.gridArray[row][column] = 1;
        }
    }
};

Dungeon.prototype.fillRooms = function () {
    var counter = 3;
    this.roomGrids.forEach(grid => {
        grid.forEach(point => {
            this.gridArray[point.y][point.x] = counter;
        });
        counter++;
    });
};

Dungeon.prototype.fillWalkable = function () {
    for (var row = 0; row < this.gridSizeLength; row++) {
        for (var column = 0; column < this.gridSizeWidth; column++) {
            if (this.gridArray[row][column] != 1) {
                this.gridArray[row][column] = 0;
                this.walkableArea += 1;
            }
        }
    }
};

Dungeon.prototype.creatWall = function (x, y) {
    var value = this.gridArray[y][x];
    if (value == 0 || value == 1) {
        var numWalls = this.getAdjacentWalls(x, y);
        if (this.isOutOfBounds(x, y)) {
            value = 1;
        } else if (numWalls > 4) {
            value = 1;
        } else if (numWalls < 4) {
            value = 0;
        }
    }
    return value;
};

Dungeon.prototype.creatWallHarder = function (x, y) {
    var value = this.gridArray[y][x];
    if (value == 0) {
        var numWalls = this.getAdjacentWalls(x, y);
        if (numWalls > 2) {
            value = 1;
        }
    }
    return value;
};

Dungeon.prototype.createRooms = function () {
    var promises = [];
    for (var row = 0; row < this.gridSizeLength; row++) {
        for (var column = 0; column < this.gridSizeWidth; column++) {
            var p = new Promise(resolve => {
                if (this.gridArray[row][column] == 0 && this.isNotPartOfARoom(column, row)) {
                    var roomWidth = this.getRoomWidth(column, row, 1);
                    if (roomWidth >= this.minRoomSizeWidth) {
                        var possibleLengths = [];
                        for (var j = 0; j < roomWidth; j++) {
                            possibleLengths.push(this.getRoomLength(column + j, row, 1));
                        }
                        var roomLength = this.gridSizeLength;
                        possibleLengths.forEach(length => {
                            if (length < roomLength) {
                                roomLength = length;
                            }
                        });
                        if (roomLength >= this.minRoomSizeLength && roomLength != this.gridSizeLength) {
                            var roomGrid = this.getRoomGrid(column, row, roomWidth, roomLength);
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
        .then(roomGrids => {
            this.roomGrids = roomGrids.filter(room => room != null);
        })
        .catch(err => console.log(err));
};

Dungeon.prototype.removeRoomsNotConnected = function () {
    var midX = Math.floor((this.gridSizeWidth - 1) / 2);
    var midY = Math.floor((this.gridSizeLength - 1) / 2);
    var grid = new pathfinding.Grid(this.gridArray);
    var finder = new pathfinding.AStarFinder({
        diagonalMovement: pathfinding.DiagonalMovement.Never
    });
    var promises = [];
    this.roomGrids.forEach((room, index) => {
        var p = new Promise(resolve => {
            var cell = room[0];
            var copy = grid.clone();
            var path = finder.findPath(cell.x, cell.y, midX, midY, copy);
            resolve({
                path: path,
                index: index
            });
        });
        promises.push(p);
    });
    Promise.all(promises)
        .then(pathsArray => {
            var newRoomGrids = [];
            pathsArray.forEach(pathInfo => {
                if (pathInfo.path.length == 0) {
                    var grid = this.roomGrids[pathInfo.index];
                    grid.forEach(point => {
                        this.gridArray[point.y][point.x] = 1;
                    });
                } else {
                    newRoomGrids.push(this.roomGrids[pathInfo.index]);
                }
            });
            this.roomGrids = newRoomGrids;
        })
        .catch(err => console.log(err));
};

Dungeon.prototype.smoothStep = function () {
    var mapOld = this.gridArray;
    for (var row = 0; row < this.gridSizeLength; row++) {
        for (var column = 0; column < this.gridSizeWidth; column++) {
            mapOld[row][column] = this.creatWall(column, row);
        }
    }
    this.gridArray = mapOld;
};

Dungeon.prototype.smoothStepHarder = function () {
    var mapOld = this.gridArray;
    for (var row = 0; row < this.gridSizeLength; row++) {
        for (var column = 0; column < this.gridSizeWidth; column++) {
            mapOld[row][column] = this.creatWallHarder(column, row);
        }
    }
    this.gridArray = mapOld;
};

Dungeon.prototype.isMiddleRoom = function (x, y) {
    var midX = Math.floor((this.gridSizeWidth - 1) / 2);
    var midY = Math.floor((this.gridSizeLength - 1) / 2);
    if (midX - this.minRoomSizeWidth <= x && x <= midX + this.minRoomSizeWidth) {
        if (midY - this.minRoomSizeLength <= y && y <= midY + this.minRoomSizeLength) {
            return true;
        }
    }
    return false;
};

Dungeon.prototype.isWall = function (x, y) {
    if (this.isOutOfBounds(x, y))
        return true;
    if (this.gridArray[y][x] == 1)
        return true;
    return false;
};

Dungeon.prototype.isPartOfARoom = function (x, y) {
    if (this.isOutOfBounds(x, y))
        return true;
    if (this.gridArray[y][x] == 2)
        return true;
    return false;
};

Dungeon.prototype.isOutOfBounds = function (x, y) {
    if (x <= 0 || y <= 0)
        return true;
    if (x >= this.gridSizeWidth - 1 || y >= this.gridSizeLength - 1)
        return true;
    return false;
};

Dungeon.prototype.isNotPartOfARoom = function (x, y) {
    this.roomGrids.forEach(room => {
        room.forEach(point => {
            if (point.x == x && point.y == y) {
                return false;
            }
        });
    });
    return true;
};

Dungeon.prototype.getAdjacentWalls = function (x, y) {
    var wallCounter = 0;
    if (this.isWall(x - 1, y - 1))
        wallCounter++;
    if (this.isWall(x - 1, y))
        wallCounter++;
    if (this.isWall(x - 1, y + 1))
        wallCounter++;
    if (this.isWall(x, y - 1))
        wallCounter++;
    if (this.isWall(x, y))
        wallCounter++;
    if (this.isWall(x, y + 1))
        wallCounter++;
    if (this.isWall(x + 1, y - 1))
        wallCounter++;
    if (this.isWall(x + 1, y))
        wallCounter++;
    if (this.isWall(x + 1, y + 1))
        wallCounter++;
    return wallCounter;
};

Dungeon.prototype.getRoomWidth = function (x, y, counter) {
    if (this.isWall(x + 1, y)) {
        return counter;
    } else {
        return this.getRoomWidth(x + 1, y, counter + 1);
    }
};

Dungeon.prototype.getRoomLength = function (x, y, counter) {
    if (this.isWall(x, y + 1)) {
        return counter;
    } else {
        return this.getRoomLength(x, y + 1, counter + 1);
    }
};

Dungeon.prototype.getRoomGrid = function (x, y, width, length) {
    var roomGrid = [];
    for (var row = y; row < y + length; row++) {
        for (var column = x; column < x + width; column++) {
            roomGrid.push({
                x: column,
                y: row
            });
        }
    }
    return roomGrid;
};