/**
 *   Lightweight A* pathfinding inspired by AxStar.js
 *   API-compatible surface with performance-focused implementation.
 */

const AxStar = {};
export default AxStar;

// Node states
const CLOSED = 0;
const OPEN = 1;

// Movement costs
const STRAIGHT_COST = 1.0;
const DIAGONAL_COST = 1.4142135623730951; // sqrt(2) for accurate diagonal distance

// Direction constants for lookup
const DIRS = {
  '0,-1': 'TOP',
  '1,-1': 'TOP_RIGHT',
  '1,0': 'RIGHT',
  '1,1': 'BOTTOM_RIGHT',
  '0,1': 'BOTTOM',
  '-1,1': 'BOTTOM_LEFT',
  '-1,0': 'LEFT',
  '-1,-1': 'TOP_LEFT',
};

// Binary min-heap with decrease-key support
class MinHeap {
  constructor(compareFn) {
    this._heap = [];
    this._cmp = compareFn;
  }

  size() {
    return this._heap.length;
  }

  push(node) {
    node.heapIndex = this._heap.length;
    this._heap.push(node);
    this._siftUp(node.heapIndex);
  }

  pop() {
    const heap = this._heap;
    if (heap.length === 0) return undefined;

    const top = heap[0];
    const last = heap.pop();

    if (heap.length > 0) {
      heap[0] = last;
      last.heapIndex = 0;
      this._siftDown(0);
    }

    return top;
  }

  updateItem(node) {
    const idx = node.heapIndex;
    if (idx == null) return;
    this._siftUp(idx);
    this._siftDown(idx);
  }

  _swap(i, j) {
    const heap = this._heap;
    const tmp = heap[i];
    heap[i] = heap[j];
    heap[j] = tmp;
    heap[i].heapIndex = i;
    heap[j].heapIndex = j;
  }

  _siftUp(idx) {
    const heap = this._heap;
    const cmp = this._cmp;

    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (cmp(heap[idx], heap[parentIdx]) < 0) {
        this._swap(idx, parentIdx);
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  _siftDown(idx) {
    const heap = this._heap;
    const cmp = this._cmp;
    const len = heap.length;

    while (true) {
      const leftIdx = (idx << 1) + 1;
      const rightIdx = leftIdx + 1;
      let minIdx = idx;

      if (leftIdx < len && cmp(heap[leftIdx], heap[minIdx]) < 0) {
        minIdx = leftIdx;
      }
      if (rightIdx < len && cmp(heap[rightIdx], heap[minIdx]) < 0) {
        minIdx = rightIdx;
      }

      if (minIdx !== idx) {
        this._swap(idx, minIdx);
        idx = minIdx;
      } else {
        break;
      }
    }
  }
}

let nextInstanceId = 1;

AxStar.run = function () {
  // Configuration
  let syncEnabled = false;
  let diagonalsEnabled = false;
  let allowCornerCutting = true;
  let iterationsPerCalculation = Number.MAX_VALUE;

  // Grid data
  let collisionGrid;
  let gridWidth = 0;
  let gridHeight = 0;

  // Tile and cost configuration
  let acceptableTilesSet = null;
  const costMap = new Map(); // tile -> cost multiplier
  const pointsToCost = new Map(); // "x,y" -> cost
  const pointsToAvoid = new Set(); // "x,y"
  const directionalConditions = new Map(); // "x,y" -> [directions]

  // Path instances
  const instances = new Map();
  const instanceQueue = [];

  // Helper to create coordinate key
  const coordKey = (x, y) => `${x},${y}`;

  /**
   * Sets which tiles are walkable.
   * @param {Array|Number} tiles - Acceptable tile types
   */
  this.setAcceptableTiles = function (tiles) {
    if (Array.isArray(tiles)) {
      acceptableTilesSet = new Set(tiles);
    } else if (typeof tiles === 'number' && isFinite(tiles)) {
      acceptableTilesSet = new Set([tiles]);
    } else {
      throw new Error('setAcceptableTiles requires a number or an array of numbers');
    }
  };

  /**
   * Sets the collision grid.
   * @param {Array} grid - 2D array of tile types
   */
  this.setGrid = function (grid) {
    collisionGrid = grid;
    gridHeight = grid.length;
    gridWidth = gridHeight > 0 ? grid[0].length : 0;

    // Initialize default cost for each tile type
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const tileType = grid[y][x];
        if (!costMap.has(tileType)) {
          costMap.set(tileType, 1);
        }
      }
    }
  };

  /**
   * Sets the cost multiplier for a tile type.
   * @param {Number} tileType - The tile type
   * @param {Number} cost - Cost multiplier
   */
  this.setTileCost = function (tileType, cost) {
    costMap.set(tileType, cost);
  };

  /**
   * Sets additional cost for a specific point.
   * @param {Number} x - X coordinate
   * @param {Number} y - Y coordinate
   * @param {Number} cost - Cost multiplier
   */
  this.setAdditionalPointCost = function (x, y, cost) {
    pointsToCost.set(coordKey(x, y), cost);
  };

  /**
   * Removes additional cost for a specific point.
   * @param {Number} x - X coordinate
   * @param {Number} y - Y coordinate
   */
  this.removeAdditionalPointCost = function (x, y) {
    pointsToCost.delete(coordKey(x, y));
  };

  /**
   * Removes all additional point costs.
   */
  this.removeAllAdditionalPointCosts = function () {
    pointsToCost.clear();
  };

  /**
   * Sets directional condition for a point.
   * @param {Number} x - X coordinate
   * @param {Number} y - Y coordinate
   * @param {Array<String>} allowedDirections - Allowed approach directions
   */
  this.setDirectionalCondition = function (x, y, allowedDirections) {
    directionalConditions.set(coordKey(x, y), allowedDirections);
  };

  /**
   * Removes all directional conditions.
   */
  this.removeAllDirectionalConditions = function () {
    directionalConditions.clear();
  };

  /**
   * Sets iterations per calculate() call.
   * @param {Number} iterations - Number of iterations
   */
  this.setIterationsPerCalculation = function (iterations) {
    iterationsPerCalculation = iterations;
  };

  /**
   * Marks a point to avoid.
   * @param {Number} x - X coordinate
   * @param {Number} y - Y coordinate
   */
  this.avoidAdditionalPoint = function (x, y) {
    pointsToAvoid.add(coordKey(x, y));
  };

  /**
   * Stops avoiding a point.
   * @param {Number} x - X coordinate
   * @param {Number} y - Y coordinate
   */
  this.stopAvoidingAdditionalPoint = function (x, y) {
    pointsToAvoid.delete(coordKey(x, y));
  };

  /**
   * Stops avoiding all additional points.
   */
  this.stopAvoidingAllAdditionalPoints = function () {
    pointsToAvoid.clear();
  };

  this.enableSync = function () {
    syncEnabled = true;
  };

  this.disableSync = function () {
    syncEnabled = false;
  };

  this.enableDiagonals = function () {
    diagonalsEnabled = true;
  };

  this.disableDiagonals = function () {
    diagonalsEnabled = false;
  };

  this.enableCornerCutting = function () {
    allowCornerCutting = true;
  };

  this.disableCornerCutting = function () {
    allowCornerCutting = false;
  };

  this.disableCornerCutting = function () {
    allowCornerCutting = false;
  };

  /**
   * Find a path from start to end.
   * @param {Number} startX - Start X coordinate
   * @param {Number} startY - Start Y coordinate
   * @param {Number} endX - End X coordinate
   * @param {Number} endY - End Y coordinate
   * @param {Function} callback - Called with path array or null
   * @return {Number} Instance ID for this pathfinding request
   */
  this.findPath = function (startX, startY, endX, endY, callback) {
    // Validation
    if (!acceptableTilesSet) {
      throw new Error("You can't set a path without first calling setAcceptableTiles() on AxStar.");
    }
    if (!collisionGrid) {
      throw new Error("You can't set a path without first calling setGrid() on AxStar.");
    }
    if (
      startX < 0 ||
      startY < 0 ||
      endX < 0 ||
      endY < 0 ||
      startX >= gridWidth ||
      startY >= gridHeight ||
      endX >= gridWidth ||
      endY >= gridHeight
    ) {
      throw new Error('Your start or end point is outside the scope of your grid.');
    }

    // Wrapper for sync vs async callback
    const callbackWrapper = (result) => {
      if (syncEnabled) {
        callback(result);
      } else {
        setTimeout(() => callback(result), 0);
      }
    };

    // Early returns
    if (startX === endX && startY === endY) {
      callbackWrapper([]);
      return 0;
    }

    if (!acceptableTilesSet.has(collisionGrid[endY][endX])) {
      callbackWrapper(null);
      return 0;
    }

    // Create pathfinding instance
    const instanceId = nextInstanceId++;
    const nodeMap = new Map(); // "x,y" -> node

    const instance = {
      openList: new MinHeap((a, b) => a.f - b.f),
      nodeMap,
      startX,
      startY,
      endX,
      endY,
      callback: callbackWrapper,
    };

    // Create start node
    const startNode = {
      x: startX,
      y: startY,
      g: 0,
      h: heuristic(startX, startY, endX, endY),
      f: 0,
      parent: null,
      state: OPEN,
      heapIndex: -1,
    };
    startNode.f = startNode.g + startNode.h;

    nodeMap.set(coordKey(startX, startY), startNode);
    instance.openList.push(startNode);

    instances.set(instanceId, instance);
    instanceQueue.push(instanceId);

    return instanceId;
  };

  /**
   * Cancel a pathfinding request.
   * @param {Number} instanceId - The instance ID to cancel
   * @return {Boolean} True if cancelled
   */
  this.cancelPath = function (instanceId) {
    return instances.delete(instanceId);
  };

  /**
   * Process pathfinding calculations.
   * Call repeatedly until all paths are found.
   */
  this.calculate = function () {
    if (instanceQueue.length === 0 || !collisionGrid || !acceptableTilesSet) {
      return;
    }

    let iterations = 0;

    while (iterations < iterationsPerCalculation && instanceQueue.length > 0) {
      if (syncEnabled) {
        iterations = 0; // Reset for sync mode
      }

      const instanceId = instanceQueue[0];
      const instance = instances.get(instanceId);

      if (!instance) {
        // Cancelled
        instanceQueue.shift();
        continue;
      }

      const { openList, nodeMap, endX, endY, callback } = instance;

      if (openList.size() === 0) {
        // No path found
        callback(null);
        instances.delete(instanceId);
        instanceQueue.shift();
        continue;
      }

      const current = openList.pop();
      current.state = CLOSED;

      // Found the goal
      if (current.x === endX && current.y === endY) {
        const path = [];
        let node = current;
        while (node) {
          path.push({ x: node.x, y: node.y });
          node = node.parent;
        }
        path.reverse();
        callback(path);
        instances.delete(instanceId);
        instanceQueue.shift();
        continue;
      }

      // Explore neighbors
      exploreNeighbors(instance, current);
      iterations++;
    }
  };

  // Helper: Calculate heuristic distance
  function heuristic(x1, y1, x2, y2) {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);

    if (diagonalsEnabled) {
      // Octile distance: D * (dx + dy) + (D2 - 2*D) * min(dx, dy)
      // Where D = STRAIGHT_COST, D2 = DIAGONAL_COST
      const min = dx < dy ? dx : dy;
      const max = dx + dy - min;
      return DIAGONAL_COST * min + STRAIGHT_COST * max;
    } else {
      // Manhattan distance
      return STRAIGHT_COST * (dx + dy);
    }
  }

  // Helper: Get tile cost at position
  function getTileCost(x, y) {
    const key = coordKey(x, y);
    if (pointsToCost.has(key)) {
      return pointsToCost.get(key);
    }
    const tileType = collisionGrid[y][x];
    return costMap.get(tileType) || 1;
  }

  // Helper: Check if tile is walkable
  function isWalkable(x, y, fromX, fromY) {
    // Check if avoided
    if (pointsToAvoid.has(coordKey(x, y))) {
      return false;
    }

    // Check if acceptable tile
    if (!acceptableTilesSet.has(collisionGrid[y][x])) {
      return false;
    }

    // Check directional conditions
    const key = coordKey(x, y);
    if (directionalConditions.has(key)) {
      const allowed = directionalConditions.get(key);
      const direction = DIRS[`${fromX - x},${fromY - y}`];
      if (!allowed.includes(direction)) {
        return false;
      }
    }

    return true;
  }

  // Helper: Explore neighbors of current node
  function exploreNeighbors(instance, current) {
    const { x, y } = current;
    const { nodeMap, openList, endX, endY } = instance;

    // Define neighbor offsets: [dx, dy, cost]
    const neighbors = [
      [0, -1, STRAIGHT_COST], // Top
      [1, 0, STRAIGHT_COST], // Right
      [0, 1, STRAIGHT_COST], // Bottom
      [-1, 0, STRAIGHT_COST], // Left
    ];

    if (diagonalsEnabled) {
      neighbors.push(
        [-1, -1, DIAGONAL_COST], // Top-left
        [1, -1, DIAGONAL_COST], // Top-right
        [1, 1, DIAGONAL_COST], // Bottom-right
        [-1, 1, DIAGONAL_COST], // Bottom-left
      );
    }

    for (const [dx, dy, baseCost] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;

      // Bounds check
      if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) {
        continue;
      }

      // Diagonal corner cutting check
      if (diagonalsEnabled && dx !== 0 && dy !== 0 && !allowCornerCutting) {
        // Check if both adjacent tiles are walkable
        if (!isWalkable(x + dx, y, x, y) || !isWalkable(x, y + dy, x, y)) {
          continue;
        }
      }

      // Check walkability
      if (!isWalkable(nx, ny, x, y)) {
        continue;
      }

      const key = coordKey(nx, ny);
      const moveCost = baseCost * getTileCost(nx, ny);
      const tentativeG = current.g + moveCost;

      let neighbor = nodeMap.get(key);

      if (!neighbor) {
        // New node
        neighbor = {
          x: nx,
          y: ny,
          g: tentativeG,
          h: heuristic(nx, ny, endX, endY),
          f: 0,
          parent: current,
          state: OPEN,
          heapIndex: -1,
        };
        neighbor.f = neighbor.g + neighbor.h;
        nodeMap.set(key, neighbor);
        openList.push(neighbor);
      } else if (neighbor.state === CLOSED) {
        // Skip closed nodes
        continue;
      } else if (tentativeG < neighbor.g) {
        // Better path found
        neighbor.g = tentativeG;
        neighbor.f = neighbor.g + neighbor.h;
        neighbor.parent = current;
        openList.updateItem(neighbor);
      }
    }
  }
};

// Direction constants for API compatibility
AxStar.TOP = 'TOP';
AxStar.TOP_RIGHT = 'TOP_RIGHT';
AxStar.RIGHT = 'RIGHT';
AxStar.BOTTOM_RIGHT = 'BOTTOM_RIGHT';
AxStar.BOTTOM = 'BOTTOM';
AxStar.BOTTOM_LEFT = 'BOTTOM_LEFT';
AxStar.LEFT = 'LEFT';
AxStar.TOP_LEFT = 'TOP_LEFT';
