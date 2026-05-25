import mulberry from "./utils/mulberry.js";
import hashString from "./utils/hash.js";
import aStar from "./utils/astar.js";

const TILE = {
  WALKABLE: 0,
  WALL: 1,
  ROOM: 2,
  HALLWAY: 3,
};

class Dungeon {
  /**
   * Initializes a new Dungeon instance and its internal state.
   * @param {number} gridWidth - The total width of the dungeon grid.
   * @param {number} gridLength - The total length (height) of the dungeon grid.
   * @param {number} percentWalls - The probability (0.0 to 1.0) of a cell initially becoming a wall.
   * @param {number} minRoomWidth - The minimum required width for a valid room.
   * @param {number} minRoomLength - The minimum required length for a valid room.
   * @param {string} seed - The string seed for the random number generator.
   */
  constructor(
    gridWidth,
    gridLength,
    percentWalls,
    minRoomWidth,
    minRoomLength,
    seed,
  ) {
    this.seed = seed;
    this.prng = mulberry(hashString(String(seed)));
    this.gridWidth = gridWidth;
    this.gridLength = gridLength;
    this.percentWalls = percentWalls;
    this.minRoomWidth = minRoomWidth;
    this.minRoomLength = minRoomLength;

    // Pre-calculate middle coordinates for performance
    this.midX = Math.floor((this.gridWidth - 1) / 2);
    this.midY = Math.floor((this.gridLength - 1) / 2);

    this.walkableCells = 0;
    this.rooms = [];
    this.roomCenters = [];
    this.connectedRooms = [];
    this.paths = [];
    this.grid = new Array(gridLength)
      .fill(TILE.WALKABLE)
      .map(() => new Array(gridWidth).fill(TILE.WALKABLE));
  }

  /**
   * Populates the grid with initial random noise and enforces borders and middle room.
   */
  fillRandom() {
    const nextGrid = this.grid.map((row) => [...row]);
    for (let row = 0; row < this.gridLength; row += 1) {
      for (let column = 0; column < this.gridWidth; column += 1) {
        if (
          column === 0 ||
          row === 0 ||
          column === this.gridWidth - 1 ||
          row === this.gridLength - 1 ||
          this.prng() <= this.percentWalls
        ) {
          nextGrid[row][column] = TILE.WALL;
        }
        if (this.isMiddleRoom(column, row)) {
          nextGrid[row][column] = TILE.WALKABLE;
        }
      }
    }
    this.grid = nextGrid;
  }

  /**
   * Applies the identified rooms back into the grid layout.
   */
  fillRooms() {
    const nextGrid = this.grid.map((row) => [...row]);
    this.rooms.forEach((room) => {
      room.forEach((cell) => {
        nextGrid[cell.y][cell.x] = TILE.ROOM;
      });
    });
    this.grid = nextGrid;
  }

  /**
   * Creates hallways so every room can become reachable from the main room.
   * @returns {void}
   */
  createHallways() {
    const roomCenters = this.getRoomCenters();
    this.roomCenters = roomCenters;

    const mainRoomIndex = this.getMainRoomIndex(roomCenters);
    if (mainRoomIndex === -1) {
      this.connectedRooms = [];
      this.paths = [];
      return;
    }

    const connectionPairs = this.getRoomConnectionPairs(
      mainRoomIndex,
      roomCenters,
    );
    const pathfinder = this.createHallwayPathfinder();
    const nextGrid = this.grid.map((row) => [...row]);
    const nextPaths = [];

    for (let i = 0; i < connectionPairs.length; i += 1) {
      const pair = connectionPairs[i];
      const fromCenter = roomCenters[pair.from];
      const toCenter = roomCenters[pair.to];
      const path = this.findPathBetweenPoints(pathfinder, fromCenter, toCenter);
      const widenedPath = this.carveWideHallway(nextGrid, path);
      if (widenedPath.length > 0) {
        nextPaths.push(widenedPath);
      }
    }

    this.grid = nextGrid;
    this.paths = nextPaths;
    this.connectedRooms = this.getConnectedRoomIndexes();
  }

  /**
   * Normalizes the grid by clearing any non-wall cells into basic walkable space.
   */
  fillWalkable() {
    let nextWalkableCells = 0;
    const nextGrid = this.grid.map((row) => [...row]);
    for (let row = 0; row < this.gridLength; row += 1) {
      for (let column = 0; column < this.gridWidth; column += 1) {
        if (nextGrid[row][column] !== TILE.WALL) {
          nextGrid[row][column] = TILE.WALKABLE;
          nextWalkableCells += 1;
        }
      }
    }
    this.walkableCells = nextWalkableCells;
    this.grid = nextGrid;
  }

  /**
   * Scans the grid for valid rectangular room areas and stores them.
   */
  createRooms() {
    const roomCandidates = [];
    for (let row = 0; row < this.gridLength; row += 1) {
      for (let column = 0; column < this.gridWidth; column += 1) {
        if (this.grid[row][column] !== TILE.WALL) {
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
            if (
              roomLength >= this.minRoomLength &&
              roomLength !== this.gridLength
            ) {
              roomCandidates.push({
                x: column,
                y: row,
                width: roomWidth,
                length: roomLength,
                area: roomWidth * roomLength,
              });
            }
          }
        }
      }
    }

    roomCandidates.sort((a, b) => {
      if (a.area !== b.area) {
        return b.area - a.area;
      }
      if (a.y !== b.y) {
        return a.y - b.y;
      }
      return a.x - b.x;
    });

    const occupied = new Set();
    const nextRooms = [];

    roomCandidates.forEach((candidate) => {
      let intersects = false;

      for (
        let roomRow = candidate.y;
        roomRow < candidate.y + candidate.length;
        roomRow += 1
      ) {
        for (
          let roomColumn = candidate.x;
          roomColumn < candidate.x + candidate.width;
          roomColumn += 1
        ) {
          const key = (roomColumn << 16) | (roomRow & 0xffff);
          if (occupied.has(key)) {
            intersects = true;
            break;
          }
        }

        if (intersects) {
          break;
        }
      }

      if (!intersects) {
        const room = getRoomGrid(
          candidate.x,
          candidate.y,
          candidate.width,
          candidate.length,
        );
        room.forEach((cell) => {
          const key = (cell.x << 16) | (cell.y & 0xffff);
          occupied.add(key);
        });
        nextRooms.push(room);
      }
    });

    this.rooms = nextRooms;
    this.roomCenters = [];
  }

  /**
   * Returns all non-wall cells connected to the middle tile using 4-way flood fill.
   * @returns {Set<number>} Set of coordinate keys connected to the main room.
   */
  getConnectedToMainRoom() {
    const coordKey = (x, y) => (x << 16) | (y & 0xffff);
    const connected = new Set();
    const visited = new Set();
    const stack = [{ x: this.midX, y: this.midY }];

    while (stack.length > 0) {
      const current = stack.pop();

      if (this.isOutOfBounds(current.x, current.y)) {
        continue;
      }

      const key = coordKey(current.x, current.y);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      if (this.grid[current.y][current.x] === TILE.WALL) {
        continue;
      }

      connected.add(key);

      stack.push({ x: current.x + 1, y: current.y });
      stack.push({ x: current.x - 1, y: current.y });
      stack.push({ x: current.x, y: current.y + 1 });
      stack.push({ x: current.x, y: current.y - 1 });
    }

    return connected;
  }

  /**
   * Culls isolated caverns and rooms by keeping only tiles connected to the middle room.
   * @returns {void}
   */
  removeRooms() {
    const coordKey = (x, y) => (x << 16) | (y & 0xffff);
    this.grid[this.midY][this.midX] = TILE.WALKABLE;
    const connectedToMainRoom = this.getConnectedToMainRoom();

    const nextGrid = this.grid.map((row) => [...row]);
    for (let y = 0; y < this.gridLength; y += 1) {
      for (let x = 0; x < this.gridWidth; x += 1) {
        if (
          this.grid[y][x] !== TILE.WALL &&
          !connectedToMainRoom.has(coordKey(x, y))
        ) {
          nextGrid[y][x] = TILE.WALL;
        }
      }
    }
    this.grid = nextGrid;

    const validRooms = [];
    this.rooms.forEach((room) => {
      if (room.length > 0) {
        const cell = room[0];
        if (connectedToMainRoom.has(coordKey(cell.x, cell.y))) {
          validRooms.push(room);
        }
      }
    });

    this.rooms = validRooms;
    this.roomCenters = this.getRoomCenters();
    this.connectedRooms = this.getConnectedRoomIndexes();
    this.paths = [];
  }

  /**
   * Applies one step of cellular automata smoothing across the entire grid.
   */
  smoothStep() {
    const nextGrid = this.grid.map((row) => [...row]);
    for (let row = 0; row < this.gridLength; row += 1) {
      for (let column = 0; column < this.gridWidth; column += 1) {
        if (this.grid[row][column] <= TILE.WALL) {
          nextGrid[row][column] = this.createWall(column, row);
        }
      }
    }
    this.grid = nextGrid;
  }

  /**
   * Applies one step of cellular automata smoothing specifically tailored for room boundaries.
   */
  smoothStepAroundRooms() {
    const nextGrid = this.grid.map((row) => [...row]);
    for (let row = 0; row < this.gridLength; row += 1) {
      for (let column = 0; column < this.gridWidth; column += 1) {
        if (this.grid[row][column] <= TILE.WALL) {
          nextGrid[row][column] = this.createWallAroundRooms(column, row);
        }
      }
    }
    this.grid = nextGrid;
  }

  /**
   * Determines the new state of a cell based on neighbor wall counts.
   * @param {number} x - The x coordinate.
   * @param {number} y - The y coordinate.
   * @returns {number} The new tile type.
   */
  createWall(x, y) {
    let value = this.grid[y][x];
    const numWalls = this.countAdjacentWalls(x, y);
    if (
      x === 0 ||
      y === 0 ||
      x === this.gridWidth - 1 ||
      y === this.gridLength - 1
    ) {
      value = TILE.WALL;
    } else if (numWalls > 4) {
      value = TILE.WALL;
    } else if (numWalls < 4) {
      value = TILE.WALKABLE;
    }
    return value;
  }

  /**
   * Determines the new state of a cell near rooms, prioritizing wall density.
   * @param {number} x - The x coordinate.
   * @param {number} y - The y coordinate.
   * @returns {number} The new tile type.
   */
  createWallAroundRooms(x, y) {
    let value = this.grid[y][x];
    const numWalls = this.countAdjacentWalls(x, y);
    if (
      x === 0 ||
      y === 0 ||
      x === this.gridWidth - 1 ||
      y === this.gridLength - 1
    ) {
      value = TILE.WALL;
    } else if (numWalls > 2) {
      value = TILE.WALL;
    }
    return value;
  }

  /**
   * Checks if a coordinate is within the designated middle room zone.
   * @param {number} x - The x coordinate.
   * @param {number} y - The y coordinate.
   * @returns {boolean} True if inside the middle room area.
   */
  isMiddleRoom(x, y) {
    if (
      this.midX - this.minRoomWidth <= x &&
      x <= this.midX + this.minRoomWidth
    ) {
      if (
        this.midY - this.minRoomLength <= y &&
        y <= this.midY + this.minRoomLength
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if a specific cell represents a wall or is out of grid bounds.
   * @param {number} x - The x coordinate.
   * @param {number} y - The y coordinate.
   * @returns {boolean} True if the cell is a wall or out of bounds.
   */
  isWall(x, y) {
    if (this.isOutOfBounds(x, y)) {
      return true;
    }
    if (this.grid[y][x] === TILE.WALL) {
      return true;
    }
    return false;
  }

  /**
   * Checks if a coordinate is strictly outside the array indices of the grid.
   * @param {number} x - The x coordinate.
   * @param {number} y - The y coordinate.
   * @returns {boolean} True if out of bounds.
   */
  isOutOfBounds(x, y) {
    if (x < 0 || y < 0) {
      return true;
    }
    if (x >= this.gridWidth || y >= this.gridLength) {
      return true;
    }
    return false;
  }

  /**
   * Counts how many neighboring cells around a given point are walls.
   * @param {number} x - The x coordinate.
   * @param {number} y - The y coordinate.
   * @returns {number} The amount of adjacent walls (0-8).
   */
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

  /**
   * Scans to the right to find the total un-interrupted width of a potential room.
   * @param {number} x - The starting x coordinate.
   * @param {number} y - The y coordinate.
   * @param {number} counter - The initial width counter.
   * @returns {number} The full width.
   */
  countRoomWidth(x, y, counter) {
    let currentX = x;
    let currentCounter = counter;
    while (!this.isWall(currentX + 1, y)) {
      currentX += 1;
      currentCounter += 1;
    }
    return currentCounter;
  }

  /**
   * Scans downwards to find the total un-interrupted length of a potential room.
   * @param {number} x - The x coordinate.
   * @param {number} y - The starting y coordinate.
   * @param {number} counter - The initial length counter.
   * @returns {number} The full length.
   */
  countRoomLength(x, y, counter) {
    let currentY = y;
    let currentCounter = counter;
    while (!this.isWall(x, currentY + 1)) {
      currentY += 1;
      currentCounter += 1;
    }
    return currentCounter;
  }

  /**
   * Finds the room index that best represents the middle room anchor.
   * @returns {number} The room index, or -1 when no room exists.
   */
  getMainRoomIndex(roomCenters) {
    if (this.rooms.length === 0) {
      return -1;
    }

    for (let index = 0; index < this.rooms.length; index += 1) {
      const room = this.rooms[index];
      for (let i = 0; i < room.length; i += 1) {
        const cell = room[i];
        if (cell.x === this.midX && cell.y === this.midY) {
          return index;
        }
      }
    }

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < roomCenters.length; index += 1) {
      const center = roomCenters[index];
      const dx = center.x - this.midX;
      const dy = center.y - this.midY;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }

    return nearestIndex;
  }

  /**
   * Computes deterministic room connections starting from the main room.
   * @param {number} mainRoomIndex - The main room index.
   * @returns {Array<{from: number, to: number}>} Selected room-to-room connection pairs.
   */
  getRoomConnectionPairs(mainRoomIndex, roomCenters) {
    const visited = new Array(this.rooms.length).fill(false);
    visited[mainRoomIndex] = true;
    let visitedCount = 1;
    const pairs = [];

    while (visitedCount < this.rooms.length) {
      let bestPair = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (
        let visitedIndex = 0;
        visitedIndex < this.rooms.length;
        visitedIndex += 1
      ) {
        if (!visited[visitedIndex]) {
          continue;
        }
        const visitedCenter = roomCenters[visitedIndex];
        for (
          let roomIndex = 0;
          roomIndex < roomCenters.length;
          roomIndex += 1
        ) {
          if (visited[roomIndex]) {
            continue;
          }
          const roomCenter = roomCenters[roomIndex];
          const dx = roomCenter.x - visitedCenter.x;
          const dy = roomCenter.y - visitedCenter.y;
          const distance = dx * dx + dy * dy;

          if (distance < bestDistance) {
            bestDistance = distance;
            bestPair = {
              from: visitedIndex,
              to: roomIndex,
            };
          }
        }
      }

      if (bestPair === null) {
        break;
      }

      visited[bestPair.to] = true;
      visitedCount += 1;
      pairs.push(bestPair);
    }

    return pairs;
  }

  /**
   * Calculates room centers for all discovered rooms.
   * @returns {Array<{x: number, y: number}>} Room center coordinates.
   */
  getRoomCenters() {
    const centers = [];
    for (let i = 0; i < this.rooms.length; i += 1) {
      centers.push(this.getRoomCenter(this.rooms[i]));
    }
    return centers;
  }

  /**
   * Creates and configures a pathfinder for hallway carving.
   * @returns {Object} Configured pathfinder instance.
   */
  createHallwayPathfinder() {
    const finder = new aStar.run();
    finder.enableSync();
    finder.enableDiagonals();
    finder.disableCornerCutting();
    finder.setGrid(this.grid);
    finder.setAcceptableTiles(this.getHallwayTraversalTiles());
    finder.setTileCost(TILE.WALKABLE, 3);
    finder.setTileCost(TILE.ROOM, 1);
    finder.setTileCost(TILE.HALLWAY, 1);
    return finder;
  }

  /**
   * Calculates the center point for a room.
   * @param {Array<{x: number, y: number}>} room - The room cell list.
   * @returns {{x: number, y: number}} The integer center coordinate.
   */
  getRoomCenter(room) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    room.forEach((cell) => {
      if (cell.x < minX) {
        minX = cell.x;
      }
      if (cell.x > maxX) {
        maxX = cell.x;
      }
      if (cell.y < minY) {
        minY = cell.y;
      }
      if (cell.y > maxY) {
        maxY = cell.y;
      }
    });

    return {
      x: Math.floor((minX + maxX) / 2),
      y: Math.floor((minY + maxY) / 2),
    };
  }

  /**
   * Finds a path between two room anchors using A* pathfinding.
   * @param {{x: number, y: number}} start - Start coordinate.
   * @param {{x: number, y: number}} end - End coordinate.
   * @returns {Array<{x: number, y: number}>} A path from start to end, or an empty array.
   */
  findPathBetweenPoints(finder, start, end) {
    let foundPath = null;
    finder.findPath(start.x, start.y, end.x, end.y, (path) => {
      foundPath = path;
    });
    finder.calculate();

    if (foundPath === null) {
      return [];
    }
    return foundPath;
  }

  /**
   * Collects all tile values that are currently traversable.
   * @returns {number[]} Unique traversable tile values in the current grid.
   */
  getHallwayTraversalTiles() {
    return [TILE.WALKABLE, TILE.ROOM, TILE.HALLWAY];
  }

  /**
   * Carves a path as a hallway that is at least two cells wide.
   * @param {number[][]} nextGrid - Target grid being carved.
   * @param {Array<{x: number, y: number}>} path - Path cells to widen and carve.
   * @returns {Array<{x: number, y: number}>} Unique hallway cells carved for this path.
   */
  carveWideHallway(nextGrid, path) {
    if (path.length === 0) {
      return [];
    }

    const carved = [];
    const carvedKeys = new Set();

    for (let i = 0; i < path.length; i += 1) {
      const point = path[i];
      const delta = this.getPathDelta(path, i);
      const cellsToCarve = this.getHallwayStampCells(point, delta);

      cellsToCarve.forEach((cell) => {
        if (!this.canCarveHallwayCell(cell.x, cell.y)) {
          return;
        }

        nextGrid[cell.y][cell.x] = TILE.HALLWAY;
        const key = (cell.x << 16) | (cell.y & 0xffff);
        if (!carvedKeys.has(key)) {
          carvedKeys.add(key);
          carved.push({ x: cell.x, y: cell.y });
        }
      });
    }

    return carved;
  }

  /**
   * Returns movement direction for a path point based on adjacent points.
   * @param {Array<{x: number, y: number}>} path - Full hallway path.
   * @param {number} index - Current index in the path.
   * @returns {{dx: number, dy: number}} Delta between neighboring path points.
   */
  getPathDelta(path, index) {
    if (path.length === 1) {
      return { dx: 1, dy: 0 };
    }

    const current = path[index];
    const next = index < path.length - 1 ? path[index + 1] : path[index - 1];
    return {
      dx: next.x - current.x,
      dy: next.y - current.y,
    };
  }

  /**
   * Computes the set of cells to stamp for a 2-wide hallway segment.
   * @param {{x: number, y: number}} point - Current path point.
   * @param {{dx: number, dy: number}} delta - Direction delta for this segment.
   * @returns {Array<{x: number, y: number}>} Cells to carve for this segment.
   */
  getHallwayStampCells(point, delta) {
    const cells = [{ x: point.x, y: point.y }];

    if (delta.dx !== 0 && delta.dy !== 0) {
      cells.push({ x: point.x + delta.dx, y: point.y });
      cells.push({ x: point.x, y: point.y + delta.dy });
      return cells;
    }

    if (delta.dx !== 0) {
      const offsetY = point.y + 1 < this.gridLength - 1 ? 1 : -1;
      cells.push({ x: point.x, y: point.y + offsetY });
      return cells;
    }

    const offsetX = point.x + 1 < this.gridWidth - 1 ? 1 : -1;
    cells.push({ x: point.x + offsetX, y: point.y });
    return cells;
  }

  /**
   * Checks whether a hallway cell can be carved without breaking border walls.
   * @param {number} x - X coordinate to carve.
   * @param {number} y - Y coordinate to carve.
   * @returns {boolean} True when the hallway cell is carveable.
   */
  canCarveHallwayCell(x, y) {
    if (this.isOutOfBounds(x, y)) {
      return false;
    }
    if (
      x === 0 ||
      y === 0 ||
      x === this.gridWidth - 1 ||
      y === this.gridLength - 1
    ) {
      return false;
    }
    return true;
  }

  /**
   * Computes which room indexes are currently reachable from the middle room.
   * @returns {number[]} Connected room indexes.
   */
  getConnectedRoomIndexes() {
    const coordKey = (x, y) => (x << 16) | (y & 0xffff);
    const connectedCells = this.getConnectedToMainRoom();
    const connectedRooms = [];

    this.rooms.forEach((room, index) => {
      let isConnected = false;
      for (let i = 0; i < room.length; i += 1) {
        const cell = room[i];
        if (connectedCells.has(coordKey(cell.x, cell.y))) {
          isConnected = true;
          break;
        }
      }

      if (isConnected) {
        connectedRooms.push(index);
      }
    });

    return connectedRooms;
  }
}

/**
 * Generates an array of point coordinates that construct a room's grid.
 * @param {number} x - The top-left x coordinate of the room.
 * @param {number} y - The top-left y coordinate of the room.
 * @param {number} width - The width of the room.
 * @param {number} length - The length of the room.
 * @returns {Array<{x: number, y: number}>} An array of coordinate objects.
 */
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
 * Generator function that yields the dungeon state at each step of generation.
 * @param {number} gridWidth - The total width of the dungeon grid.
 * @param {number} gridLength - The total length of the dungeon grid.
 * @param {number} percentWalls - The probability (0.0 to 1.0) of a cell initially becoming a wall.
 * @param {number} minRoomWidth - The minimum required width for a valid room.
 * @param {number} minRoomLength - The minimum required length for a valid room.
 * @param {string} seed - The string seed for the random number generator.
 * @yields {Dungeon} The current state of the dungeon.
 * @returns {Dungeon} The final state of the dungeon.
 */
export function* createDungeonSteps(
  gridWidth,
  gridLength,
  percentWalls,
  minRoomWidth,
  minRoomLength,
  seed,
) {
  const passes = Math.floor((Math.sqrt(gridWidth) * Math.sqrt(gridLength)) / 2);
  const dungeon = new Dungeon(
    gridWidth,
    gridLength,
    percentWalls,
    minRoomWidth,
    minRoomLength,
    seed,
  );
  dungeon.fillRandom();
  yield dungeon;
  for (let i = 0; i < passes; i += 1) {
    dungeon.smoothStep();
    yield dungeon;
  }
  dungeon.createRooms();
  dungeon.fillRooms();
  dungeon.createHallways();
  yield dungeon;
  for (let i = 0; i < passes; i += 1) {
    dungeon.smoothStepAroundRooms();
    yield dungeon;
  }
  return dungeon;
}

/**
 * Creates a dungeon synchronously.
 * @param {number} gridWidth - The total width of the dungeon grid.
 * @param {number} gridLength - The total length of the dungeon grid.
 * @param {number} percentWalls - The probability (0.0 to 1.0) of a cell initially becoming a wall.
 * @param {number} minRoomWidth - The minimum required width for a valid room.
 * @param {number} minRoomLength - The minimum required length for a valid room.
 * @param {string} seed - The string seed for the random number generator.
 * @returns {Dungeon} The final state of the dungeon.
 */
const createDungeon = (
  gridWidth,
  gridLength,
  percentWalls,
  minRoomWidth,
  minRoomLength,
  seed,
) => {
  const generator = createDungeonSteps(
    gridWidth,
    gridLength,
    percentWalls,
    minRoomWidth,
    minRoomLength,
    seed,
  );
  let result = generator.next();
  while (!result.done) {
    result = generator.next();
  }
  return result.value;
};

export default createDungeon;
