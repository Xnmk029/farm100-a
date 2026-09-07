// 第一课：种下一行小麦。可以反复执行，收获后会自动补种。
// North 向上，East 向右；农场边界不环绕。
function goHome() {
  while (get_position().x > 0) move(West);
  while (get_position().y > 0) move(North);
}
goHome();
for (let x = 0; x < get_size(); x++) {
  till();
  if (!inspect().crop) plant(Wheat);
  water();
  while (!inspect().ready) wait(50);
  harvest();
  plant(Wheat);
  if (x + 1 < get_size()) move(East);
}
goHome();
console.log('第一行小麦正在生长。打开研究页，用粮食解锁根菜。');
