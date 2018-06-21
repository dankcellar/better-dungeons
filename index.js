const pathfinding = require('pathfinding')
const seedrandom = require('seedrandom')

module.exports = generate
module.exports.CreateDungeon = CreateDungeon

function generate(sizeX, sizeY, percent, minX, minY, seed) {
    return Promise.resolve(new CreateDungeon(sizeX, sizeY, percent, minX, minY, seed))
        .then(dungeon => {
            dungeon.FillRandom()
            return dungeon
        })
        .then(dungeon => {
            for (var i = 0; i < 10; i++) {
                dungeon.SmoothStep()
            }
            return dungeon
        })
        .then(dungeon => {
            dungeon.CreateRooms()
            return dungeon
        })
        .then(dungeon => {
            for (var i = 0; i < 10; i++) {
                dungeon.SmoothStepHarder()
            }
            return dungeon
        })
        .then(dungeon => {
            dungeon.FillRooms()
            return dungeon
        })
        .then(dungeon => {
            dungeon.FillWalkable()
            return dungeon
        })
        .then(dungeon => {
            dungeon.RemoveRoomsNotConnected()
            return dungeon
        })
        .catch(err => {
            throw err
        })
}

// TODO: Enforce max grid size based off minRoomSize
function CreateDungeon(mapWidth, mapLength, percentAreWalls, minSizeWidth, minSizeLength, seed) {
    this.seed = seed
    this.mapWidth = mapWidth
    this.mapLength = mapLength
    this.percentAreWalls = percentAreWalls
    this.minSizeWidth = minSizeWidth
    this.minSizeLength = minSizeLength
    this.roomGrids = []
    this.walkableArea = 0
    this.gridArray = new Array(mapLength).fill(0).map(() => new Array(mapWidth).fill(0))
}

CreateDungeon.prototype.FillRandom = function () {
    for (var row = 0; row < this.mapLength; row++) {
        for (var column = 0; column < this.mapWidth; column++) {
            var rng = seedrandom(`${this.seed}-${this.mapWidth}-${this.mapLength}-${column}-${row}`)
            if (column == 0)
                this.gridArray[row][column] = 1
            else if (row == 0)
                this.gridArray[row][column] = 1
            else if (column == this.mapWidth - 1)
                this.gridArray[row][column] = 1
            else if (row == this.mapLength - 1)
                this.gridArray[row][column] = 1
            else if (this.IsMiddleRoom(column, row))
                this.gridArray[row][column] = 2
            else if (rng() < this.percentAreWalls)
                this.gridArray[row][column] = 1
        }
    }
}

CreateDungeon.prototype.FillRooms = function () {
    var counter = 3
    this.roomGrids.forEach(grid => {
        grid.forEach(point => {
            this.gridArray[point.y][point.x] = counter
        })
        counter++
    })
}

CreateDungeon.prototype.FillWalkable = function () {
    for (var row = 0; row < this.mapLength; row++) {
        for (var column = 0; column < this.mapWidth; column++) {
            if (this.gridArray[row][column] != 1) {
                this.gridArray[row][column] = 0
                this.walkableArea += 1
            }
        }
    }
}

CreateDungeon.prototype.CreatWall = function (x, y) {
    var value = this.gridArray[y][x]
    if (value == 0 || value == 1) {
        var numWalls = this.GetAdjacentWalls(x, y)
        if (this.IsOutOfBounds(x, y)) {
            value = 1
        } else if (numWalls > 4) {
            value = 1
        } else if (numWalls < 4) {
            value = 0
        }
    }
    return value
}

CreateDungeon.prototype.CreatWallHarder = function (x, y) {
    var value = this.gridArray[y][x]
    if (value == 0) {
        var numWalls = this.GetAdjacentWalls(x, y)
        if (numWalls > 2) {
            value = 1
        }
    }
    return value
}

CreateDungeon.prototype.CreateRooms = function () {
    var start = Date.now()
    var promises = []
    for (var row = 0; row < this.mapLength; row++) {
        for (var column = 0; column < this.mapWidth; column++) {
            var p = new Promise(resolve => {
                if (this.gridArray[row][column] == 0 && this.IsNotPartOfARoom(column, row)) {
                    var roomWidth = this.GetRoomWidth(column, row, 1)
                    if (roomWidth >= this.minSizeWidth) {
                        var possibleLengths = []
                        for (var j = 0; j < roomWidth; j++) {
                            possibleLengths.push(this.GetRoomLength(column + j, row, 1))
                        }
                        var roomLength = this.mapLength
                        possibleLengths.forEach(length => {
                            if (length < roomLength) {
                                roomLength = length
                            }
                        })
                        if (roomLength >= this.minSizeLength && roomLength != this.mapLength) {
                            var roomGrid = this.GetRoomGrid(column, row, roomWidth, roomLength)
                            resolve(roomGrid)
                        }
                    }
                }
                resolve(null)
            })
            promises.push(p)
        }
    }
    Promise.all(promises)
        .then(roomGrids => {
            this.roomGrids = roomGrids.filter(room => room != null)
            console.log(Date.now() - start)
        })
        .catch(err => console.log(err))
}

CreateDungeon.prototype.RemoveRoomsNotConnected = function () {
    var midX = Math.floor((this.mapWidth - 1) / 2)
    var midY = Math.floor((this.mapLength - 1) / 2)
    var grid = new pathfinding.Grid(this.gridArray)
    var finder = new pathfinding.AStarFinder({
        diagonalMovement: pathfinding.DiagonalMovement.Never
    })
    var promises = []
    this.roomGrids.forEach((room, index) => {
        var p = new Promise(resolve => {
            var cell = room[0]
            var copy = grid.clone()
            var path = finder.findPath(cell.x, cell.y, midX, midY, copy)
            resolve({
                path: path,
                index: index
            })
        })
        promises.push(p)
    })
    Promise.all(promises)
        .then(pathsArray => {
            var newRoomGrids = []
            pathsArray.forEach(pathInfo => {
                if (pathInfo.path.length == 0) {
                    var grid = this.roomGrids[pathInfo.index]
                    grid.forEach(point => {
                        this.gridArray[point.y][point.x] = 1
                    })
                } else {
                    newRoomGrids.push(this.roomGrids[pathInfo.index])
                }
            })
            this.roomGrids = newRoomGrids
        })
        .catch(err => console.log(err))
}

CreateDungeon.prototype.SmoothStep = function () {
    var mapOld = this.gridArray
    for (var row = 0; row < this.mapLength; row++) {
        for (var column = 0; column < this.mapWidth; column++) {
            mapOld[row][column] = this.CreatWall(column, row)
        }
    }
    this.gridArray = mapOld
}

CreateDungeon.prototype.SmoothStepHarder = function () {
    var mapOld = this.gridArray
    for (var row = 0; row < this.mapLength; row++) {
        for (var column = 0; column < this.mapWidth; column++) {
            mapOld[row][column] = this.CreatWallHarder(column, row)
        }
    }
    this.gridArray = mapOld
}

CreateDungeon.prototype.IsMiddleRoom = function (x, y) {
    var midX = Math.floor((this.mapWidth - 1) / 2)
    var midY = Math.floor((this.mapLength - 1) / 2)
    if (midX - this.minSizeWidth <= x && x <= midX + this.minSizeWidth) {
        if (midY - this.minSizeLength <= y && y <= midY + this.minSizeLength) {
            return true
        }
    }
    return false
}

CreateDungeon.prototype.IsWall = function (x, y) {
    if (this.IsOutOfBounds(x, y))
        return true
    if (this.gridArray[y][x] == 1)
        return true
    return false
}

CreateDungeon.prototype.IsRoom = function (x, y) {
    if (this.IsOutOfBounds(x, y))
        return true
    if (this.gridArray[y][x] == 2)
        return true
    return false
}

CreateDungeon.prototype.IsOutOfBounds = function (x, y) {
    if (x <= 0 || y <= 0)
        return true
    if (x >= this.mapWidth - 1 || y >= this.mapLength - 1)
        return true
    return false
}

CreateDungeon.prototype.IsNotPartOfARoom = function (x, y) {
    this.roomGrids.forEach(room => {
        room.forEach(point => {
            if (point.x == x && point.y == y) {
                return false
            }
        })
    })
    return true
}

CreateDungeon.prototype.GetAdjacentWalls = function (x, y) {
    var wallCounter = 0
    if (this.IsWall(x - 1, y - 1))
        wallCounter++;
    if (this.IsWall(x - 1, y))
        wallCounter++;
    if (this.IsWall(x - 1, y + 1))
        wallCounter++;
    if (this.IsWall(x, y - 1))
        wallCounter++;
    if (this.IsWall(x, y))
        wallCounter++;
    if (this.IsWall(x, y + 1))
        wallCounter++;
    if (this.IsWall(x + 1, y - 1))
        wallCounter++;
    if (this.IsWall(x + 1, y))
        wallCounter++;
    if (this.IsWall(x + 1, y + 1))
        wallCounter++;
    return wallCounter
}

CreateDungeon.prototype.GetRoomWidth = function (x, y, counter) {
    if (this.IsWall(x + 1, y)) {
        return counter
    } else {
        return this.GetRoomWidth(x + 1, y, counter + 1)
    }
}

CreateDungeon.prototype.GetRoomLength = function (x, y, counter) {
    if (this.IsWall(x, y + 1)) {
        return counter
    } else {
        return this.GetRoomLength(x, y + 1, counter + 1)
    }
}

CreateDungeon.prototype.GetRoomGrid = function (x, y, width, length) {
    var roomGrid = []
    for (var row = y; row < y + length; row++) {
        for (var column = x; column < x + width; column++) {
            roomGrid.push({
                x: column,
                y: row
            })
        }
    }
    return roomGrid
}