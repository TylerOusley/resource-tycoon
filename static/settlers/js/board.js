import { axialToPixel, drawHex, HEX_SIZE } from "./hex.js";

export const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore", "desert"];

export const RESOURCE_COLORS = {
  wood: "var(--hex-wood)",
  brick: "var(--hex-brick)",
  sheep: "var(--hex-sheep)",
  wheat: "var(--hex-wheat)",
  ore: "var(--hex-ore)",
  desert: "var(--hex-desert)",
};

export const RESOURCE_LABELS = {
  wood: "🌲",
  brick: "🧱",
  sheep: "🐑",
  wheat: "🌾",
  ore: "⛏",
  desert: "🏜",
};

/** Standard 19-hex Catan layout (axial coords) */
const STANDARD_TILES = [
  { q: 0, r: 0, resource: "desert", number: null },
  { q: 1, r: -1, resource: "wood", number: 2 },
  { q: 2, r: -2, resource: "sheep", number: 9 },
  { q: 0, r: -1, resource: "brick", number: 12 },
  { q: -1, r: 0, resource: "wheat", number: 10 },
  { q: 1, r: 0, resource: "ore", number: 6 },
  { q: 2, r: -1, resource: "wood", number: 4 },
  { q: 0, r: 1, resource: "sheep", number: 11 },
  { q: -2, r: 1, resource: "brick", number: 3 },
  { q: -1, r: 1, resource: "wheat", number: 8 },
  { q: 1, r: 1, resource: "ore", number: 5 },
  { q: 2, r: 0, resource: "sheep", number: 10 },
  { q: -2, r: 2, resource: "wood", number: 9 },
  { q: -1, r: 2, resource: "brick", number: 4 },
  { q: 0, r: 2, resource: "wheat", number: 5 },
  { q: 1, r: 2, resource: "ore", number: 3 },
  { q: 2, r: 1, resource: "wood", number: 8 },
  { q: -2, r: 0, resource: "sheep", number: 6 },
  { q: -1, r: -1, resource: "wheat", number: 11 },
];

const RESOURCE_DECK = [
  ...Array(4).fill("wood"),
  ...Array(3).fill("brick"),
  ...Array(4).fill("sheep"),
  ...Array(4).fill("wheat"),
  ...Array(3).fill("ore"),
];

const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateBoard(randomize = false) {
  if (!randomize) {
    return STANDARD_TILES.map((t) => ({ ...t }));
  }
  const coords = STANDARD_TILES.map(({ q, r }) => ({ q, r }));
  const resources = shuffle(RESOURCE_DECK);
  const numbers = shuffle(NUMBER_TOKENS);
  let ni = 0;
  const tiles = coords.map(({ q, r }, i) => {
    const resource = resources[i];
    if (resource === "desert") {
      return { q, r, resource: "desert", number: null };
    }
    return { q, r, resource, number: numbers[ni++] };
  });
  return tiles;
}

/** Vertices for placement (simplified key: q,r,dir 0-5) */
export function getVertices(tiles) {
  const verts = new Map();
  for (const tile of tiles) {
    for (let d = 0; d < 6; d++) {
      const key = `${tile.q},${tile.r},${d}`;
      if (!verts.has(key)) {
        verts.set(key, { key, q: tile.q, r: tile.r, dir: d, tile });
      }
    }
  }
  return [...verts.values()];
}

export function getVertexPixel(v, offsetX, offsetY) {
  const { x, y } = axialToPixel(v.q, v.r);
  const angle = (Math.PI / 180) * (60 * v.dir - 30);
  const vx = offsetX + x + HEX_SIZE * 0.92 * Math.cos(angle);
  const vy = offsetY + y + HEX_SIZE * 0.92 * Math.sin(angle);
  return { x: vx, y: vy };
}

export function renderBoard(canvas, tiles, options = {}) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600;
  const h = canvas.clientHeight || 600;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const t of tiles) {
    const { x, y } = axialToPixel(t.q, t.r);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const offsetX = w / 2 - (minX + maxX) / 2;
  const offsetY = h / 2 - (minY + maxY) / 2;

  ctx.clearRect(0, 0, w, h);

  const style = getComputedStyle(document.documentElement);
  for (const tile of tiles) {
    const { x, y } = axialToPixel(tile.q, tile.r);
    const cx = offsetX + x;
    const cy = offsetY + y;
    const colorVar = RESOURCE_COLORS[tile.resource];
    const fill =
      colorVar.startsWith("var")
        ? style.getPropertyValue(colorVar.slice(4, -1)).trim() || "#555"
        : colorVar;
    drawHex(ctx, cx, cy, fill);

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "22px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(RESOURCE_LABELS[tile.resource] || "", cx, cy - 8);

    if (tile.number != null) {
      const isHigh = tile.number === 6 || tile.number === 8;
      ctx.beginPath();
      ctx.arc(cx, cy + 18, 14, 0, Math.PI * 2);
      ctx.fillStyle = isHigh ? "#c0392b" : "#f5f5f5";
      ctx.fill();
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = isHigh ? "#fff" : "#222";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(String(tile.number), cx, cy + 18);
    }
  }

  if (options.settlements) {
    for (const s of options.settlements) {
      const v = s.vertex;
      const { x, y } = getVertexPixel(v, offsetX, offsetY);
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  if (options.roads) {
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (const r of options.roads) {
      const a = getVertexPixel(r.from, offsetX, offsetY);
      const b = getVertexPixel(r.to, offsetX, offsetY);
      ctx.strokeStyle = r.color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  return { offsetX, offsetY, width: w, height: h };
}
