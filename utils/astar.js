/**
 *   Lightweight A* pathfinding inspired by aStar.js
 *   API-compatible surface with performance-focused implementation.
 */

const aStar = {};
export default aStar;

// Node states
const CLOSED = 0;
const OPEN = 1;

// Movement costs
const STRAIGHT_COST = 1.0;
const DIAGONAL_COST = 1.4142135623730951; // sqrt(2) for accurate diagonal distance
const DIAGONAL_ADJUSTMENT = DIAGONAL_COST - 2 * STRAIGHT_COST;

// Direction constants for lookup
const DIRS = [
  "TOP_LEFT",
  "TOP",
  "TOP_RIGHT",
  "LEFT",
  "",
  "RIGHT",
  "BOTTOM_LEFT",
  "BOTTOM",
  "BOTTOM_RIGHT",
];

// Binary min-heap with decrease-key support
class MinHeap {
  /**
   * Initializes a new, empty binary min-heap.
   */
  constructor() {
    this._heap = [];
  }

  /**
   * Gets the number of elements in the heap.
   * @returns {number} The size of the heap.
   */
  size() {
    return this._heap.length;
  }

  /**
   * Pushes a new node onto the heap.
   * @param {Object} node - The node to add to the heap.
   */
  push(node) {
    node.heapIndex = this._heap.length;
    this._heap.push(node);
    this._siftUp(node.heapIndex);
  }

  /**
   * Pops and returns the node with the lowest cost.
   * @returns {Object|undefined} The node with the lowest cost, or undefined if empty.
   */
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

  /**
   * Updates a node's position in the heap after its cost changes.
   * @param {Object} node - The node to update.
   */
  updateItem(node) {
    const idx = node.heapIndex;
    if (idx === null || idx === undefined || idx === -1) return;
    this._siftUp(idx);
    this._siftDown(idx);
  }

  /**
   * Swaps two nodes in the heap.
   * @param {number} i - First index.
   * @param {number} j - Second index.
   */
  _swap(i, j) {
    const heap = this._heap;
    const tmp = heap[i];
    heap[i] = heap[j];
    heap[j] = tmp;
    heap[i].heapIndex = i;
    heap[j].heapIndex = j;
  }

  /**
   * Sifts a node up the heap to restore the heap property.
   * @param {number} idx - The index of the node to sift up.
   */
  _siftUp(idx) {
    const heap = this._heap;

    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (heap[idx].f < heap[parentIdx].f) {
        this._swap(idx, parentIdx);
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  /**
   * Sifts a node down the heap to restore the heap property.
   * @param {number} idx - The index of the node to sift down.
   */
  _siftDown(idx) {
    const heap = this._heap;
    const len = heap.length;

    while (true) {
      const leftIdx = (idx << 1) + 1;
      const rightIdx = leftIdx + 1;
      let minIdx = idx;

      if (leftIdx < len && heap[leftIdx].f < heap[minIdx].f) {
        minIdx = leftIdx;
      }
      if (rightIdx < len && heap[rightIdx].f < heap[minIdx].f) {
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

/**
 * Main pathfinding system constructor.
 */
aStar.run = function () {
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

  const neighbors4 = [
    [0, -1, STRAIGHT_COST, false], // Top
    [1, 0, STRAIGHT_COST, false], // Right
    [0, 1, STRAIGHT_COST, false], // Bottom
    [-1, 0, STRAIGHT_COST, false], // Left
  ];

  const neighbors8 = [
    ...neighbors4,
    [-1, -1, DIAGONAL_COST, true], // Top-left
    [1, -1, DIAGONAL_COST, true], // Top-right
    [1, 1, DIAGONAL_COST, true], // Bottom-right
    [-1, 1, DIAGONAL_COST, true], // Bottom-left
  ];

  // Helper to create coordinate key (much faster than string interpolation)
  const coordKey = (x, y) => (x << 16) | (y & 0xffff);

  /**
   * Sets which tiles are walkable.
   * @param {Array|Number} tiles - Acceptable tile types
   */
  this.setAcceptableTiles = function (tiles) {
    if (Array.isArray(tiles)) {
      acceptableTilesSet = new Set(tiles);
    } else if (typeof tiles === "number" && isFinite(tiles)) {
      acceptableTilesSet = new Set([tiles]);
    } else {
      throw new Error(
        "setAcceptableTiles requires a number or an array of numbers",
      );
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

  /**
   * Enables synchronous pathfinding callbacks.
   */
  this.enableSync = function () {
    syncEnabled = true;
  };

  /**
   * Disables synchronous pathfinding callbacks.
   */
  this.disableSync = function () {
    syncEnabled = false;
  };

  /**
   * Enables diagonal movement.
   */
  this.enableDiagonals = function () {
    diagonalsEnabled = true;
  };

  /**
   * Disables diagonal movement.
   */
  this.disableDiagonals = function () {
    diagonalsEnabled = false;
  };

  /**
   * Enables diagonal movement passing through corners.
   */
  this.enableCornerCutting = function () {
    allowCornerCutting = true;
  };

  /**
   * Disables diagonal movement passing through corners.
   */
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
      throw new Error(
        "You can't set a path without first calling setAcceptableTiles() on aStar.",
      );
    }
    if (!collisionGrid) {
      throw new Error(
        "You can't set a path without first calling setGrid() on aStar.",
      );
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
      throw new Error(
        "Your start or end point is outside the scope of your grid.",
      );
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
      openList: new MinHeap(),
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
      // Octile distance
      const min = dx < dy ? dx : dy;
      return STRAIGHT_COST * (dx + dy) + DIAGONAL_ADJUSTMENT * min;
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
    const key = coordKey(x, y);

    // Check if avoided
    if (pointsToAvoid.has(key)) {
      return false;
    }

    // Check if acceptable tile
    if (!acceptableTilesSet.has(collisionGrid[y][x])) {
      return false;
    }

    // Check directional conditions
    if (directionalConditions.has(key)) {
      const allowed = directionalConditions.get(key);
      const direction = DIRS[fromX - x + 1 + (fromY - y + 1) * 3];
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

    const neighbors = diagonalsEnabled ? neighbors8 : neighbors4;

    for (let i = 0; i < neighbors.length; i++) {
      const [dx, dy, baseCost, isDiagonal] = neighbors[i];
      const nx = x + dx;
      const ny = y + dy;

      // Bounds check
      if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) {
        continue;
      }

      // Diagonal corner cutting check
      if (isDiagonal && !allowCornerCutting) {
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
        const h = heuristic(nx, ny, endX, endY);
        neighbor = {
          x: nx,
          y: ny,
          g: tentativeG,
          h: h,
          f: tentativeG + h,
          parent: current,
          state: OPEN,
          heapIndex: -1,
        };
        nodeMap.set(key, neighbor);
        openList.push(neighbor);
      } else if (neighbor.state === CLOSED) {
        // Skip closed nodes
        continue;
      } else if (tentativeG < neighbor.g) {
        // Better path found
        neighbor.g = tentativeG;
        neighbor.f = tentativeG + neighbor.h;
        neighbor.parent = current;
        openList.updateItem(neighbor);
      }
    }
  }
};

// Direction constants for API compatibility
aStar.TOP = "TOP";
aStar.TOP_RIGHT = "TOP_RIGHT";
aStar.RIGHT = "RIGHT";
aStar.BOTTOM_RIGHT = "BOTTOM_RIGHT";
aStar.BOTTOM = "BOTTOM";
aStar.BOTTOM_LEFT = "BOTTOM_LEFT";
aStar.LEFT = "LEFT";
aStar.TOP_LEFT = "TOP_LEFT";
