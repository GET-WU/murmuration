const _neighbors = new Int32Array(3000);

export { _neighbors };

export class SpatialGrid {
  constructor(width, height, cellSize, searchExtent = 2) {
    this.cellSize = cellSize;
    this.searchExtent = searchExtent;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.totalCells = this.cols * this.rows;
    this.cells = new Array(this.totalCells);
    for (let i = 0; i < this.totalCells; i++) {
      this.cells[i] = [];
    }
  }

  clear() {
    for (let i = 0; i < this.totalCells; i++) {
      this.cells[i].length = 0;
    }
  }

  insert(boid, index) {
    const col = Math.max(0, Math.min(this.cols - 1, Math.floor(boid.x / this.cellSize)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor(boid.y / this.cellSize)));
    this.cells[col + row * this.cols].push(index);
  }

  getNeighborCount(x, y) {
    const col = Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize)));
    const ext = this.searchExtent;

    const minCol = Math.max(0, col - ext);
    const maxCol = Math.min(this.cols - 1, col + ext);
    const minRow = Math.max(0, row - ext);
    const maxRow = Math.min(this.rows - 1, row + ext);

    let count = 0;
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = this.cells[c + r * this.cols];
        for (let i = 0; i < cell.length; i++) {
          _neighbors[count++] = cell[i];
        }
      }
    }
    return count;
  }

  resize(width, height) {
    this.cols = Math.ceil(width / this.cellSize);
    this.rows = Math.ceil(height / this.cellSize);
    this.totalCells = this.cols * this.rows;
    this.cells = new Array(this.totalCells);
    for (let i = 0; i < this.totalCells; i++) {
      this.cells[i] = [];
    }
  }
}
