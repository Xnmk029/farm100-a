// 人工农场示例：先生产小麦，再用部分粮食种植胡萝卜。
// 共 8 轮生产；每个动作由模拟时钟推进，可独立回放。
const n = get_size();
let {x, y} = get_position();
function go(tx, ty) {
  while (x < tx) { move(East); x++; }
  while (x > tx) { move(West); x--; }
  while (y < ty) { move(South); y++; }
  while (y > ty) { move(North); y--; }
}
for (let cycle = 0; cycle < 8; cycle++) {
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const tx = row % 2 ? n - 1 - col : col;
      go(tx, row);
      const cell = inspect();
      if (cell.crop) {
        while (!inspect().ready) wait(20);
        harvest();
      }
      if (!cell.soil) till();
      const crop = cycle > 0 && tx >= n / 2 ? Carrot : Wheat;
      plant(crop);
      if (!water()) { refill(); water(); }
    }
  }
  console.log('完成播种轮次', cycle + 1);
}
// 收获最后一轮，使本次记录包含完整的生产周期。
for (let row = 0; row < n; row++) {
  for (let col = 0; col < n; col++) {
    go(row % 2 ? n - 1 - col : col, row);
    while (!inspect().ready) wait(20);
    harvest();
  }
}
