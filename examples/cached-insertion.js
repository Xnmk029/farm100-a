// 人工改进解：先测量并缓存田块，再用相邻插入排序减少查询。
const n = get_size();
let x = 0, y = 0;
const cells = Array.from({length:n}, () => Array(n));
function go(tx, ty) {
  while (x < tx) { move(East); x++; }
  while (x > tx) { move(West); x--; }
  while (y < ty) { move(South); y++; }
  while (y > ty) { move(North); y--; }
}
for (let row=0; row<n; row++) {
  for (let t=0; t<n; t++) {
    const col = row%2 ? n-1-t : t;
    go(col,row); cells[row][col]=measure();
  }
}
for (let row=0; row<n; row++) {
  for (let i=1; i<n; i++) {
    for (let j=i; j>0 && cells[row][j-1]>cells[row][j]; j--) {
      go(j,row); swap(West);
      [cells[row][j-1],cells[row][j]]=[cells[row][j],cells[row][j-1]];
    }
  }
}
for (let col=0; col<n; col++) {
  for (let i=1; i<n; i++) {
    for (let j=i; j>0 && cells[j-1][col]>cells[j][col]; j--) {
      go(col,j); swap(North);
      [cells[j-1][col],cells[j][col]]=[cells[j][col],cells[j-1][col]];
    }
  }
}
harvest();
