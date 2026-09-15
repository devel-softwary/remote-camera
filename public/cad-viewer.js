export function parseDxf(text) {
  const rows = text.replace(/\r/g, '').split('\n');
  const pairs = [];
  for (let i = 0; i + 1 < rows.length; i += 2) pairs.push([rows[i].trim(), rows[i + 1].trim()]);
  const entities = [];
  let entity = null;
  for (const [code, value] of pairs) {
    if (code === '0') { if (entity) entities.push(entity); entity = ['LINE', 'CIRCLE', 'LWPOLYLINE', 'POINT'].includes(value) ? { type: value, data: {} } : null; continue; }
    if (entity) (entity.data[code] ||= []).push(Number(value));
  }
  if (entity) entities.push(entity);
  return entities.flatMap(entity => {
    const d = entity.data;
    if (entity.type === 'LINE' && d[10] && d[20] && d[11] && d[21]) return [{ type: 'line', x1: d[10][0], y1: d[20][0], x2: d[11][0], y2: d[21][0] }];
    if (entity.type === 'CIRCLE' && d[10] && d[20] && d[40]) return [{ type: 'circle', x: d[10][0], y: d[20][0], r: d[40][0] }];
    if (entity.type === 'POINT' && d[10] && d[20]) return [{ type: 'point', x: d[10][0], y: d[20][0] }];
    if (entity.type === 'LWPOLYLINE' && d[10]?.length > 1 && d[20]?.length > 1) return [{ type: 'polyline', points: d[10].map((x, i) => [x, d[20][i]]).filter(([, y]) => Number.isFinite(y)) }];
    return [];
  });
}

export function drawingBounds(shapes) {
  const values = shapes.flatMap(shape => shape.type === 'line' ? [[shape.x1, shape.y1], [shape.x2, shape.y2]] : shape.type === 'circle' ? [[shape.x - shape.r, shape.y - shape.r], [shape.x + shape.r, shape.y + shape.r]] : shape.type === 'polyline' ? shape.points : [[shape.x, shape.y]]);
  if (!values.length) return { x: 0, y: 0, width: 100, height: 100 };
  const xs = values.map(([x]) => x); const ys = values.map(([, y]) => y);
  const x = Math.min(...xs); const y = Math.min(...ys); const width = Math.max(...xs) - x || 100; const height = Math.max(...ys) - y || 100;
  const pad = Math.max(width, height) * 0.05;
  return { x: x - pad, y: y - pad, width: width + 2 * pad, height: height + 2 * pad };
}

export function createPhotoPoint(points, x, y) {
  return { id: crypto.randomUUID(), label: `Punto foto ${points.length + 1}`, x, y };
}
