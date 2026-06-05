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
   * Populates the grid with initial random noise while preserving border walls.
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
   * Creates hallways so every room becomes reachable from every other room.
   * @returns {void}
   */
  createHallways() {
    const roomCenters = this.getRoomCenters();
    this.roomCenters = roomCenters;

    if (roomCenters.length === 0) {
      this.connectedRooms = [];
      this.paths = [];
      return;
    }

    if (roomCenters.length === 1) {
      this.connectedRooms = [0];
      this.paths = [];
      return;
    }

    const startRoomIndex = this.getRandomIndex(roomCenters.length);
    const connectionPairs = this.getRoomConnectionPairs(
      startRoomIndex,
      roomCenters,
    );
    const nextGrid = this.grid.map((row) => [...row]);
    const nextPaths = [];

    for (let i = 0; i < connectionPairs.length; i += 1) {
      const pair = connectionPairs[i];
      const fromAnchor = this.getRandomRoomAnchor(this.rooms[pair.from]);
      const toAnchor = this.getRandomRoomAnchor(this.rooms[pair.to]);
      const pathfinder = this.createHallwayPathfinder(nextGrid);
      const path = this.findPathBetweenPoints(pathfinder, fromAnchor, toAnchor);
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
   * Converts any remaining walkable tiles into walls.
   */
  fillWalkable() {
    const nextGrid = this.grid.map((row) => [...row]);
    for (let row = 0; row < this.gridLength; row += 1) {
      for (let column = 0; column < this.gridWidth; column += 1) {
        if (nextGrid[row][column] === TILE.WALKABLE) {
          nextGrid[row][column] = TILE.WALL;
        }
      }
    }
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
        let room = getRoomGrid(
          candidate.x,
          candidate.y,
          candidate.width,
          candidate.length,
        );

        const maxOffsetX = candidate.width - this.minRoomWidth;
        const maxOffsetY = candidate.length - this.minRoomLength;

        const validOffsetsX = [];
        for (let x = 0; x <= maxOffsetX; x += 1) {
          if (x !== 1 && maxOffsetX - x !== 1) {
            validOffsetsX.push(x);
          }
        }

        const validOffsetsY = [];
        for (let y = 0; y <= maxOffsetY; y += 1) {
          if (y !== 1 && maxOffsetY - y !== 1) {
            validOffsetsY.push(y);
          }
        }

        const hasPlusTwoSpace = maxOffsetX >= 2 || maxOffsetY >= 2;

        // 50% chance to carve a negative space if there is enough room.
        // It enforces at least one +2 space on a side and never +1 space on any other side.
        if (
          hasPlusTwoSpace &&
          validOffsetsX.length > 0 &&
          validOffsetsY.length > 0 &&
          this.prng() > 0.5
        ) {
          const cutoutWidth = this.minRoomWidth;
          const cutoutLength = this.minRoomLength;

          // Randomly choose a valid offset
          const offsetX =
            validOffsetsX[Math.floor(this.prng() * validOffsetsX.length)];
          const offsetY =
            validOffsetsY[Math.floor(this.prng() * validOffsetsY.length)];

          const cutoutStartX = candidate.x + offsetX;
          const cutoutStartY = candidate.y + offsetY;

          // Filter out the negative space cells and turn them into walls
          room = room.filter((cell) => {
            const inCutout =
              cell.x >= cutoutStartX &&
              cell.x < cutoutStartX + cutoutWidth &&
              cell.y >= cutoutStartY &&
              cell.y < cutoutStartY + cutoutLength;

            if (inCutout) {
              this.grid[cell.y][cell.x] = TILE.WALL;
            }
            return !inCutout;
          });
        }

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
   * Returns all non-wall cells connected to the provided tile using 4-way flood fill.
   * @param {{x: number, y: number}} start - The coordinate to flood fill from.
   * @returns {Set<number>} Set of coordinate keys connected to the start tile.
   */
  getConnectedCellsFrom(start) {
    const coordKey = (x, y) => (x << 16) | (y & 0xffff);
    const connected = new Set();
    const visited = new Set();
    const stack = [start];

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
   * Culls isolated caverns and rooms by keeping only tiles connected to a room anchor.
   * @returns {void}
   */
  removeRooms() {
    const coordKey = (x, y) => (x << 16) | (y & 0xffff);
    const anchor = this.getConnectivityAnchor();
    if (anchor === null) {
      this.rooms = [];
      this.roomCenters = [];
      this.connectedRooms = [];
      this.paths = [];
      return;
    }

    const connectedCells = this.getConnectedCellsFrom(anchor);

    const nextGrid = this.grid.map((row) => [...row]);
    for (let y = 0; y < this.gridLength; y += 1) {
      for (let x = 0; x < this.gridWidth; x += 1) {
        if (
          this.grid[y][x] !== TILE.WALL &&
          !connectedCells.has(coordKey(x, y))
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
        if (connectedCells.has(coordKey(cell.x, cell.y))) {
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
   * Computes room connections starting from a random room while preserving full reachability.
   * @param {number} startRoomIndex - The room index selected to seed the connection tree.
   * @param {Array<{x: number, y: number}>} roomCenters - Center points for each room.
   * @returns {Array<{from: number, to: number}>} Selected room-to-room connection pairs.
   */
  getRoomConnectionPairs(startRoomIndex, roomCenters) {
    const visited = new Array(this.rooms.length).fill(false);
    visited[startRoomIndex] = true;
    let visitedCount = 1;
    const pairs = [];

    while (visitedCount < this.rooms.length) {
      const nextFromIndex = this.getRandomVisitedRoomIndex(visited);
      const nextToIndex = this.getClosestUnvisitedRoomIndex(
        nextFromIndex,
        visited,
        roomCenters,
      );
      const bestPair =
        nextToIndex === -1
          ? null
          : {
              from: nextFromIndex,
              to: nextToIndex,
            };

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
   * Returns a deterministic random index within the provided length.
   * @param {number} length - Upper bound for the index selection.
   * @returns {number} A random index between 0 and length - 1.
   */
  getRandomIndex(length) {
    return Math.floor(this.prng() * length);
  }

  /**
   * Returns a random cell within a room to be used as an anchor.
   * Prioritizes cells that do not touch any walls to ensure the 2x2 hallway
   * maker doesn't scrape walls or carve corners. Falls back to the safest
   * available middle cells for smaller rooms.
   * @param {Array<{x: number, y: number}>} room - Room cell list.
   * @returns {{x: number, y: number}} A valid coordinate inside the room.
   */
  getRandomRoomAnchor(room) {
    // Priority 1: Cells fully inside the room, not touching any walls.
    let validCells = room.filter(
      (cell) => this.countAdjacentWalls(cell.x, cell.y) === 0,
    );

    if (validCells.length > 0) {
      return validCells[this.getRandomIndex(validCells.length)];
    }

    // Priority 2: For smaller rooms, find cells where the 2x2 stamp
    // doesn't immediately carve a wall.
    validCells = room.filter((cell) => {
      const stampCells = this.getHallwayStampCells(cell);
      return stampCells.every(
        (stampCell) => this.isWall(stampCell.x, stampCell.y) === false,
      );
    });

    if (validCells.length > 0) {
      return this.getRoomMiddleAnchor(validCells);
    }

    // Ultimate fallback for extremely small or misshapen rooms.
    return this.getRoomMiddleAnchor(room);
  }

  /**
   * Returns the best middle anchor for a room, using a random tie-break when needed.
   * @param {Array<{x: number, y: number}>} room - Room cell list.
   * @returns {{x: number, y: number}} A coordinate near the room middle.
   */
  getRoomMiddleAnchor(room) {
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

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const middleCells = [];
    let bestDistance = Number.POSITIVE_INFINITY;

    room.forEach((cell) => {
      const dx = cell.x - centerX;
      const dy = cell.y - centerY;
      const distance = dx * dx + dy * dy;

      if (distance < bestDistance) {
        bestDistance = distance;
        middleCells.length = 0;
        middleCells.push(cell);
      } else if (distance === bestDistance) {
        middleCells.push(cell);
      }
    });

    return middleCells[this.getRandomIndex(middleCells.length)];
  }

  /**
   * Chooses a random already-visited room index from the connection tree.
   * @param {boolean[]} visited - Room visitation flags.
   * @returns {number} Random visited room index.
   */
  getRandomVisitedRoomIndex(visited) {
    const visitedIndexes = [];

    for (let index = 0; index < visited.length; index += 1) {
      if (visited[index]) {
        visitedIndexes.push(index);
      }
    }

    return visitedIndexes[this.getRandomIndex(visitedIndexes.length)];
  }

  /**
   * Finds the nearest unvisited room to the provided visited room index.
   * @param {number} fromIndex - Visited room index to connect from.
   * @param {boolean[]} visited - Room visitation flags.
   * @param {Array<{x: number, y: number}>} roomCenters - Center points for each room.
   * @returns {number} Closest unvisited room index, or -1 when none remain.
   */
  getClosestUnvisitedRoomIndex(fromIndex, visited, roomCenters) {
    const fromCenter = roomCenters[fromIndex];
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let roomIndex = 0; roomIndex < roomCenters.length; roomIndex += 1) {
      if (visited[roomIndex]) {
        continue;
      }

      const roomCenter = roomCenters[roomIndex];
      const dx = roomCenter.x - fromCenter.x;
      const dy = roomCenter.y - fromCenter.y;
      const distance = dx * dx + dy * dy;

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = roomIndex;
      }
    }

    return nearestIndex;
  }

  /**
   * Chooses a connectivity anchor from an existing room or open cell.
   * @returns {{x: number, y: number} | null} Coordinate to use for reachability checks.
   */
  getConnectivityAnchor() {
    if (this.rooms.length > 0) {
      const room = this.rooms[this.getRandomIndex(this.rooms.length)];
      return this.getRoomMiddleAnchor(room);
    }

    for (let y = 0; y < this.gridLength; y += 1) {
      for (let x = 0; x < this.gridWidth; x += 1) {
        if (this.grid[y][x] !== TILE.WALL) {
          return { x, y };
        }
      }
    }

    return null;
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
   * @param {number[][]} grid - Grid snapshot to use for traversal costs.
   * @returns {Object} Configured pathfinder instance.
   */
  createHallwayPathfinder(grid) {
    const finder = new aStar.run();
    finder.enableSync();
    finder.enableDiagonals();
    finder.disableCornerCutting();
    finder.setGrid(grid);
    finder.setAcceptableTiles(this.getHallwayTraversalTiles());

    for (let y = 0; y < this.gridLength; y += 1) {
      for (let x = 0; x < this.gridWidth; x += 1) {
        const stampCells = this.getHallwayStampCells({ x, y });
        let totalCost = 0;

        for (let i = 0; i < stampCells.length; i += 1) {
          const cell = stampCells[i];
          if (this.isOutOfBounds(cell.x, cell.y)) {
            totalCost += 1000;
          } else {
            const tile = grid[cell.y][cell.x];
            if (tile === TILE.HALLWAY) {
              totalCost += 1;
            } else if (tile === TILE.ROOM) {
              totalCost += 10;
            } else if (tile === TILE.WALKABLE) {
              totalCost += 100;
            } else if (tile === TILE.WALL) {
              totalCost += 1000;
            }
          }
        }

        finder.setAdditionalPointCost(x, y, totalCost);
      }
    }

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
    return [TILE.WALKABLE, TILE.ROOM, TILE.HALLWAY, TILE.WALL];
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
    const cells = [];
    const offsetX = point.x + 1 < this.gridWidth - 1 ? 1 : -1;
    const offsetY = point.y + 1 < this.gridLength - 1 ? 1 : -1;

    cells.push({ x: point.x, y: point.y });
    cells.push({ x: point.x + offsetX, y: point.y });
    cells.push({ x: point.x, y: point.y + offsetY });
    cells.push({ x: point.x + offsetX, y: point.y + offsetY });

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
   * Computes which room indexes are currently reachable from a room anchor.
   * @returns {number[]} Connected room indexes.
   */
  getConnectedRoomIndexes() {
    if (this.rooms.length === 0) {
      return [];
    }

    const coordKey = (x, y) => (x << 16) | (y & 0xffff);
    const connectedCells = this.getConnectedCellsFrom(
      this.getConnectivityAnchor(),
    );
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
  dungeon.fillWalkable();
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
