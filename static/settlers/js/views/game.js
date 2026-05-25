import { renderHeader } from "./header.js";
import { renderBoard, getVertexPixel } from "../board.js";
import {
  createGame,
  PHASES,
  placeSettlement,
  rollDice,
  endTurn,
  checkWinner,
  getValidSettlementVertices,
} from "../gameState.js";

let gameState = null;
let boardRender = null;

export function renderGame(root) {
  const settings = JSON.parse(sessionStorage.getItem("lobbySettings") || "{}");
  const playerCount = settings.players || 4;
  gameState = createGame(playerCount, settings.randomize);

  root.innerHTML = `
    <div class="view game-view">
      ${renderHeader("play")}
      <div class="game-layout">
        <div class="game-board-wrap">
          <canvas id="game-board" width="900" height="700"></canvas>
        </div>
        <aside class="game-sidebar">
          <div class="game-sidebar-section">
            <h3>Players</h3>
            <div id="player-list"></div>
          </div>
          <div class="game-sidebar-section">
            <h3>Your Hand</h3>
            <div class="resource-hand" id="resource-hand"></div>
          </div>
          <div class="game-sidebar-section" style="flex:1;display:flex;flex-direction:column;min-height:0">
            <h3>Log</h3>
            <div class="log-feed" id="game-log"></div>
          </div>
        </aside>
        <div class="game-action-bar">
          <div class="dice-display" id="dice-display"></div>
          <span class="phase-label" id="phase-label"></span>
          <div class="actions">
            <button type="button" class="btn-action" id="btn-roll">Roll Dice</button>
            <button type="button" class="btn-action primary" id="btn-end-turn" disabled>End Turn</button>
            <button type="button" class="btn-secondary" id="btn-exit" style="padding:10px 16px">Exit</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const canvas = root.querySelector("#game-board");
  canvas.addEventListener("click", (e) => onBoardClick(e, canvas));
  window.addEventListener("resize", draw);

  root.querySelector("#btn-roll").addEventListener("click", () => {
    const res = rollDice(gameState);
    if (res.ok) {
      gameState = res.state;
      showToast(`Rolled ${gameState.lastRoll.total}`);
      updateUI(root);
    } else showToast(res.message);
  });

  root.querySelector("#btn-end-turn").addEventListener("click", () => {
    gameState = endTurn(gameState);
    updateUI(root);
  });

  root.querySelector("#btn-exit").addEventListener("click", () => {
    location.hash = "#/";
  });

  updateUI(root);
}

function onBoardClick(e, canvas) {
  if (!gameState || gameState.currentPlayer !== 0 || !boardRender) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const valid = getValidSettlementVertices(gameState, 0);
  if (!valid.length) return;

  let best = null;
  let bestDist = 28;
  for (const v of valid) {
    const p = getVertexPixel(v, boardRender.offsetX, boardRender.offsetY);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  if (!best) return;

  const res = placeSettlement(gameState, 0, best);
  if (res.ok) {
    gameState = checkWinner(res.state);
    updateUI(document.getElementById("app"));
    showToast("Settlement placed!");
  } else showToast(res.message);
}

function draw() {
  const canvas = document.getElementById("game-board");
  if (!canvas || !gameState) return;
  const settlements = gameState.settlements.map((s) => ({
    vertex: s.vertex,
    color: gameState.players[s.playerId].color,
  }));
  boardRender = renderBoard(canvas, gameState.board, {
    settlements,
    roads: gameState.roads,
  });
}

function updateUI(root) {
  draw();
  const phaseEl = root.querySelector("#phase-label");
  const diceEl = root.querySelector("#dice-display");
  const logEl = root.querySelector("#game-log");
  const playerList = root.querySelector("#player-list");
  const handEl = root.querySelector("#resource-hand");

  const phaseNames = {
    [PHASES.SETUP_1]: "Setup — place first settlement (click board)",
    [PHASES.SETUP_2]: "Setup — place second settlement (click board)",
    [PHASES.ROLL]: "Roll dice",
    [PHASES.MAIN]: "Main phase",
    [PHASES.DONE]: "Game over",
  };
  phaseEl.textContent = phaseNames[gameState.phase] || gameState.phase;

  if (gameState.lastRoll) {
    diceEl.innerHTML = `
      <span class="die">${gameState.lastRoll.d1}</span>
      <span class="die">${gameState.lastRoll.d2}</span>
      <span>= ${gameState.lastRoll.total}</span>
    `;
  } else {
    diceEl.innerHTML = "";
  }

  logEl.innerHTML = gameState.log
    .slice(-12)
    .map((l) => `<div>${l}</div>`)
    .join("");
  logEl.scrollTop = logEl.scrollHeight;

  playerList.innerHTML = gameState.players
    .map(
      (p, i) => `
    <div class="player-summary ${i === gameState.currentPlayer ? "active" : ""}">
      <span style="width:14px;height:14px;border-radius:50%;background:${p.color}"></span>
      <span>${p.name}</span>
      <span style="margin-left:auto">${p.points} VP</span>
    </div>`
    )
    .join("");

  const human = gameState.players[0];
  handEl.innerHTML =
    ["wood", "brick", "sheep", "wheat", "ore"]
      .filter((r) => human.hand[r] > 0)
      .map(
        (r) => `
    <div class="resource-card" style="background:${getResourceColor(r)}">
      <span class="count">${human.hand[r]}</span>
      ${r.slice(0, 2).toUpperCase()}
    </div>`
      )
      .join("") || '<span style="color:var(--text-muted);font-size:0.85rem">No cards</span>';

  const isHumanTurn = gameState.currentPlayer === 0;
  root.querySelector("#btn-roll").disabled =
    !isHumanTurn || gameState.phase !== PHASES.ROLL;
  root.querySelector("#btn-end-turn").disabled =
    !isHumanTurn || gameState.phase !== PHASES.MAIN;

  if (gameState.winner != null) {
    showToast(`${gameState.players[gameState.winner].name} wins!`);
  } else if (!isHumanTurn) {
    setTimeout(runBotTurn, 600);
  }
}

function getResourceColor(r) {
  const map = {
    wood: "#2d6a3e",
    brick: "#8b3a2a",
    sheep: "#6b9e4a",
    wheat: "#c9a227",
    ore: "#5a6a7a",
  };
  return map[r] || "#555";
}

function runBotTurn() {
  if (!gameState || gameState.currentPlayer === 0 || gameState.phase === PHASES.DONE) {
    return;
  }
  const pid = gameState.currentPlayer;

  if (gameState.phase === PHASES.SETUP_1 || gameState.phase === PHASES.SETUP_2) {
    const valid = getValidSettlementVertices(gameState, pid);
    if (valid.length) {
      const pick = valid[Math.floor(Math.random() * valid.length)];
      const res = placeSettlement(gameState, pid, pick);
      if (res.ok) gameState = checkWinner(res.state);
    }
    updateUI(document.getElementById("app"));
    return;
  }

  if (gameState.phase === PHASES.ROLL) {
    const res = rollDice(gameState);
    if (res.ok) gameState = res.state;
    updateUI(document.getElementById("app"));
    setTimeout(() => {
      if (gameState && gameState.currentPlayer === pid) {
        gameState = endTurn(gameState);
        updateUI(document.getElementById("app"));
      }
    }, 800);
    return;
  }

  if (gameState.phase === PHASES.MAIN) {
    gameState = endTurn(gameState);
    updateUI(document.getElementById("app"));
  }
}

function showToast(msg) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}
