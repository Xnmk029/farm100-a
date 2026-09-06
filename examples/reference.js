// 人工参考解：行冒泡，再列冒泡。移动与测量均计费。
const n = get_size();
let x = 0, y = 0;
function go(tx, ty) {
  while (x < tx) { move(East); x++; }
  while (x > tx) { move(West); x--; }
  while (y < ty) { move(South); y++; }
  while (y > ty) { move(North); y--; }
}
for (let row = 0; row < n; row++) {
  for (let end = n - 1; end > 0; end--) {
    go(0, row);
    for (let col = 0; col < end; col++) {
      if (measure() > measure(East)) swap(East);
      if (col + 1 < end) { move(East); x++; }
    }
  }
}
for (let col = 0; col < n; col++) {
  for (let end = n - 1; end > 0; end--) {
    go(col, 0);
    for (let row = 0; row < end; row++) {
      if (measure() > measure(South)) swap(South);
      if (row + 1 < end) { move(South); y++; }
    }
  }
}
harvest();
