const chartNS = 'http://www.w3.org/2000/svg';
function svgNode(tag, attrs = {}, text) {
  const node = document.createElementNS(chartNS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function chartBounds(rows, xKey, yKey) {
  const valid = rows.filter(r => Number.isFinite(r[xKey]) && Number.isFinite(r[yKey]));
  if (!valid.length) return null;
  let xmax = 0, ymin = Infinity, ymax = -Infinity;
  for (const r of valid) { xmax = Math.max(xmax, r[xKey]); ymin = Math.min(ymin, r[yKey]); ymax = Math.max(ymax, r[yKey]); }
  if (yKey === 'ph') { ymin = Math.min(0, ymin); ymax = Math.max(14, ymax); }
  else { const pad = Math.max(0.5, (ymax - ymin) * 0.15); ymin -= pad; ymax += pad; }
  return { valid, xmin: 0, xmax: Math.max(xKey === 'volume' ? 1 : 10, xmax * 1.04), ymin, ymax };
}
function drawChart(id, rows, xKey, yKey, xLabel, yLabel, color) {
  const target = document.querySelector('#' + id);
  const note = document.querySelector('#' + id + 'Note');
  target.replaceChildren();
  const bounds = chartBounds(rows, xKey, yKey);
  if (!bounds) {
    target.appendChild(svgNode('text', { x: 360, y: 150, 'text-anchor': 'middle', fill: '#526478', 'font-size': 18 }, xKey === 'volume' ? '측정점을 저장하면 그래프가 나타납니다.' : '기록을 시작하면 그래프가 나타납니다.'));
    note.textContent = '측정값 0개';
    return;
  }
  const { xmin, xmax, ymin, ymax, valid } = bounds;
  const left = 76, top = 30, width = 612, height = 226;
  const sx = n => left + (n - xmin) / (xmax - xmin) * width;
  const sy = n => top + height - (n - ymin) / (ymax - ymin) * height;
  const add = (tag, attrs, text) => target.appendChild(svgNode(tag, attrs, text));
  for (let i = 0; i <= 4; i++) {
    const y = ymin + (ymax - ymin) * i / 4, py = sy(y);
    add('line', { x1: left, y1: py, x2: left + width, y2: py, stroke: '#dce6f0' });
    add('text', { x: left - 10, y: py + 5, 'text-anchor': 'end', fill: '#526478', 'font-size': 15 }, y.toFixed(yKey === 'ph' ? 1 : 2));
    const x = xmin + (xmax - xmin) * i / 4, px = sx(x);
    add('line', { x1: px, y1: top, x2: px, y2: top + height, stroke: '#edf2f8' });
    add('text', { x: px, y: top + height + 25, 'text-anchor': 'middle', fill: '#526478', 'font-size': 15 }, x.toFixed(xKey === 'volume' ? 2 : 1));
  }
  add('line', { x1: left, y1: top + height, x2: left + width, y2: top + height, stroke: '#7b91a8' });
  add('text', { x: left, y: 20, fill: '#183047', 'font-size': 16 }, yLabel);
  add('text', { x: left + width / 2, y: 310, 'text-anchor': 'middle', fill: '#183047', 'font-size': 16 }, xLabel);
  let path = '', previous = null;
  for (const r of rows) {
    if (!Number.isFinite(r[xKey]) || !Number.isFinite(r[yKey])) { previous = null; continue; }
    const breakLine = !previous || (xKey === 'elapsed' && (r.segment !== previous.segment || r.elapsed - previous.elapsed > 6));
    path += (breakLine ? 'M' : 'L') + sx(r[xKey]).toFixed(2) + ',' + sy(r[yKey]).toFixed(2) + ' ';
    previous = r;
  }
  add('path', { d: path, fill: 'none', stroke: color, 'stroke-width': 2 });
  for (const r of valid) {
    const outside = yKey === 'ph' && (r.ph < 4 || r.ph > 10 || r.outside || (r.state || '').includes('보정 범위 밖'));
    const dot = svgNode('circle', { cx: sx(r[xKey]), cy: sy(r[yKey]), r: xKey === 'volume' ? 4 : 2.5, fill: outside ? '#a96300' : color });
    dot.appendChild(svgNode('title', {}, xLabel + ': ' + r[xKey].toFixed(xKey === 'volume' ? 2 : 1) + ' · ' + yLabel + ': ' + r[yKey].toFixed(2) + (outside ? ' · 보정 범위 밖 추정값' : '')));
    target.appendChild(dot);
  }
  const ys = valid.map(r => r[yKey]);
  let min = Infinity, max = -Infinity;
  for (const y of ys) { min = Math.min(min, y); max = Math.max(max, y); }
  note.textContent = '측정값 ' + valid.length + '개 · 최솟값 ' + min.toFixed(2) + ' · 최댓값 ' + max.toFixed(2) + (yKey === 'temperature' ? ' ℃ · 세로축 자동 조정' : ' · pH');
}
function renderTimeCharts() {
  drawChart('timeTemperature', records, 'elapsed', 'temperature', '기록 시작 후 경과 시간(초)', '온도(℃)', '#386d80');
  drawChart('timePH', records, 'elapsed', 'ph', '기록 시작 후 경과 시간(초)', 'pH', '#8a6599');
}
function renderVolumeCharts() {
  drawChart('volumePH', points, 'volume', 'ph', '누적 투입 부피(mL)', 'pH', '#8a6599');
  drawChart('volumeTemperature', points, 'volume', 'temperature', '누적 투입 부피(mL)', '온도(℃)', '#386d80');
}
renderTimeCharts();
renderVolumeCharts();
