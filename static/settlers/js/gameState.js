import { generateBoard } from "./board.js";

export const PLAYER_COLORS = ["#e74c3c", "#3498db", "#f39c12", "#9b59b6"];

export const PHASES = {
  SETUP_1: "setup_1",
  SETUP_2: "setup_2",
  ROLL: "roll",
  MAIN: "main",
  DONE: "done",
};

const BUILD_COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
};

function emptyHand() {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

function canAfford(hand, cost) {
  return Object.entries(cost).every(([r, n]) => (hand[r] || 0) >= n);
}

function pay(hand, cost) {
  const next = { ...hand };
  for (const [r, n] of Object.entries(cost)) {
    next[r] -= n;
  }
  return next;
}

export function createGame(playerCount = 4, randomizeBoard = false) {
  const board = generateBoard(randomizeBoard);
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: i,
    name: i === 0 ? "You" : `Bot ${i}`,
    color: PLAYER_COLORS[i],
    isHuman: i === 0,
    hand: emptyHand(),
    points: 0,
    ready: i === 0,
  }));

  return {
    board,
    players,
    currentPlayer: 0,
    phase: PHASES.SETUP_1,
    setupRound: 1,
    settlements: [],
    roads: [],
    lastRoll: null,
    log: ["Place your first settlement and road."],
    winner: null,
  };
}

function vertexKey(v) {
  return `${v.q},${v.r},${v.dir}`;
}

function adjacentVertices(v) {
  const dirs = [
    [0, 0, 1],
    [0, 0, 2],
    [1, -1, 4],
    [1, 0, 3],
    [0, 1, 5],
    [-1, 1, 0],
  ];
  const neighbors = [];
  const nextDir = (v.dir + 1) % 6;
  neighbors.push({ q: v.q, r: v.r, dir: nextDir });
  const prevDir = (v.dir + 5) % 6;
  neighbors.push({ q: v.q, r: v.r, dir: prevDir });
  const edgeOffsets = [
    [1, -1, 4],
    [1, 0, 3],
    [0, 1, 5],
    [-1, 1, 0],
    [-1, 0, 2],
    [0, 0, 1],
  ];
  const [dq, dr, nd] = edgeOffsets[v.dir];
  neighbors.push({ q: v.q + dq, r: v.r + dr, dir: nd });
  return neighbors;
}

export function getValidSettlementVertices(state, playerId) {
  const occupied = new Set(state.settlements.map((s) => vertexKey(s.vertex)));
  const verts = [];
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      for (let dir = 0; dir < 6; dir++) {
        const v = { q, r, dir };
        const key = vertexKey(v);
        if (occupied.has(key)) continue;
        let tooClose = false;
        for (const n of adjacentVertices(v)) {
          if (occupied.has(vertexKey(n))) tooClose = true;
        }
        if (tooClose) continue;
        if (state.phase === PHASES.SETUP_1 || state.phase === PHASES.SETUP_2) {
          if (state.setupRound === 2 && state.settlements.filter((s) => s.playerId === playerId).length === 1) {
            const hasRoad = state.roads.some((rd) => rd.playerId === playerId);
            if (!hasRoad) continue;
          }
          verts.push(v);
        } else {
          const playerRoads = state.roads.filter((rd) => rd.playerId === playerId);
          const connected = playerRoads.some(
            (rd) =>
              vertexKey(rd.from) === key ||
              vertexKey(rd.to) === key ||
              state.settlements.some(
                (s) =>
                  s.playerId === playerId &&
                  (vertexKey(s.vertex) === vertexKey(rd.from) || vertexKey(s.vertex) === vertexKey(rd.to))
              )
          );
          if (!connected && state.settlements.filter((s) => s.playerId === playerId).length > 0) continue;
          if (canAfford(state.players[playerId].hand, BUILD_COSTS.settlement)) verts.push(v);
        }
      }
    }
  }
  return verts;
}

export function placeSettlement(state, playerId, vertex) {
  const valid = getValidSettlementVertices(state, playerId);
  if (!valid.some((v) => vertexKey(v) === vertexKey(vertex))) {
    return { ok: false, message: "Invalid settlement placement." };
  }
  const players = state.players.map((p) => ({ ...p }));
  let hand = players[playerId].hand;
  if (state.phase === PHASES.MAIN) {
    if (!canAfford(hand, BUILD_COSTS.settlement)) return { ok: false, message: "Cannot afford." };
    hand = pay(hand, BUILD_COSTS.settlement);
    players[playerId].hand = hand;
  }
  const settlements = [...state.settlements, { playerId, vertex, city: false }];
  players[playerId].points += 1;
  let log = [...state.log, `${players[playerId].name} built a settlement.`];

  if (state.phase === PHASES.SETUP_2) {
    for (const tile of state.board) {
      if (tile.resource !== "desert" && touchesVertex(vertex, tile)) {
        players[playerId].hand[tile.resource]++;
        log.push(`${players[playerId].name} received 1 ${tile.resource}`);
      }
    }
  }

  let next = { ...state, players, settlements, log };
  next = advanceSetup(next);
  return { ok: true, state: next };
}

function touchesVertex(vertex, tile) {
  if (vertex.q === tile.q && vertex.r === tile.r) return true;
  const neighbors = [
    { q: tile.q + 1, r: tile.r - 1 },
    { q: tile.q + 1, r: tile.r },
    { q: tile.q, r: tile.r + 1 },
    { q: tile.q - 1, r: tile.r + 1 },
    { q: tile.q - 1, r: tile.r },
    { q: tile.q, r: tile.r - 1 },
  ];
  return neighbors.some((n) => n.q === vertex.q && n.r === vertex.r);
}

export function rollDice(state) {
  if (state.phase !== PHASES.ROLL) return { ok: false, message: "Not roll phase." };
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  const total = d1 + d2;
  const players = state.players.map((p) => ({ ...p, hand: { ...p.hand } }));
  const log = [...state.log, `Rolled ${d1} + ${d2} = ${total}.`];
  if (total !== 7) {
    for (const tile of state.board) {
      if (tile.number === total && tile.resource !== "desert") {
        for (const s of state.settlements) {
          const dist = hexDistance(s.vertex, tile);
          if (dist === 0) {
            const amt = s.city ? 2 : 1;
            players[s.playerId].hand[tile.resource] += amt;
            log.push(`${players[s.playerId].name} +${amt} ${tile.resource}`);
          }
        }
      }
    }
  }
  return {
    ok: true,
    state: {
      ...state,
      players,
      lastRoll: { d1, d2, total },
      phase: PHASES.MAIN,
      log,
    },
  };
}

function hexDistance(vertex, tile) {
  const { q, r } = tile;
  const vq = vertex.q;
  const vr = vertex.r;
  if (vq === q && vr === r) return 0;
  return 2;
}

export function endTurn(state) {
  const nextPlayer = (state.currentPlayer + 1) % state.players.length;
  return {
    ...state,
    currentPlayer: nextPlayer,
    phase: PHASES.ROLL,
    lastRoll: null,
    log: [...state.log, `${state.players[nextPlayer].name}'s turn.`],
  };
}

function advanceSetup(state) {
  if (state.phase !== PHASES.SETUP_1 && state.phase !== PHASES.SETUP_2) return state;
  const count = state.settlements.length;
  const perPlayer = Math.ceil(count / state.players.length);
  if (perPlayer < 1) return state;
  const allFirst = state.players.every(
    (p) => state.settlements.filter((s) => s.playerId === p.id).length >= 1
  );
  if (!allFirst) {
    const nextPlayer = (state.currentPlayer + 1) % state.players.length;
    return { ...state, currentPlayer: nextPlayer };
  }
  if (state.phase === PHASES.SETUP_1) {
    return {
      ...state,
      phase: PHASES.SETUP_2,
      setupRound: 2,
      currentPlayer: state.players.length - 1,
      log: [...state.log, "Setup round 2 — place second settlement."],
    };
  }
  const allSecond = state.players.every(
    (p) => state.settlements.filter((s) => s.playerId === p.id).length >= 2
  );
  if (allSecond) {
    return {
      ...state,
      phase: PHASES.ROLL,
      currentPlayer: 0,
      log: [...state.log, "Game started! Roll the dice."],
    };
  }
  const nextPlayer =
    state.setupRound === 2
      ? (state.currentPlayer - 1 + state.players.length) % state.players.length
      : (state.currentPlayer + 1) % state.players.length;
  return { ...state, currentPlayer: nextPlayer };
}

export function checkWinner(state) {
  const p = state.players.find((pl) => pl.points >= 10);
  if (p) return { ...state, phase: PHASES.DONE, winner: p.id, log: [...state.log, `${p.name} wins!`] };
  return state;
}
