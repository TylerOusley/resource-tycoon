import { renderHeader } from "./header.js";
import { generateBoard, renderBoard } from "../board.js";
import { PLAYER_COLORS } from "../gameState.js";

export function renderLobby(root) {
  const settings = JSON.parse(sessionStorage.getItem("lobbySettings") || "{}");
  const mode = settings.mode || "bots";
  const players = settings.players || 4;

  root.innerHTML = `
    <div class="view lobby-view">
      ${renderHeader("play")}
      <div class="lobby-layout">
        <main class="lobby-main">
          <div class="lobby-map-preview">
            <canvas id="lobby-map" width="480" height="480"></canvas>
          </div>
        </main>
        <aside class="lobby-sidebar">
          <div class="lobby-sidebar-header">Room — ${mode}</div>
          <div class="lobby-settings panel" style="margin:12px;border:none;box-shadow:none;background:transparent">
            <div class="select-row">
              <label>Game Mode</label>
              <select id="lobby-mode">
                <option value="bots" ${mode === "bots" ? "selected" : ""}>vs Bots</option>
                <option value="casual" ${mode === "casual" ? "selected" : ""}>Casual</option>
                <option value="ranked" ${mode === "ranked" ? "selected" : ""}>Ranked</option>
              </select>
            </div>
            <div class="select-row">
              <label>Map</label>
              <select id="lobby-map-type">
                <option value="classic">Classic 4P</option>
                <option value="random">Random</option>
              </select>
            </div>
            <div class="select-row">
              <label>Turn Timer</label>
              <select id="lobby-timer">
                <option value="none">None</option>
                <option value="standard" selected>Standard (90s)</option>
                <option value="fast">Fast (45s)</option>
              </select>
            </div>
            <div class="select-row">
              <label>Max Players</label>
              <select id="lobby-players">
                ${[2, 3, 4].map((n) => `<option value="${n}" ${n === players ? "selected" : ""}>${n}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="lobby-players">
            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px">PLAYERS</div>
            ${Array.from({ length: 4 }, (_, i) => `
              <div class="player-slot ${i < players ? "ready" : "hidden"}" data-slot="${i}">
                <span class="player-color" style="background:${PLAYER_COLORS[i]}"></span>
                <span>${i === 0 ? "You" : `Bot ${i}`}</span>
                <span class="player-status" style="margin-left:auto;font-size:0.8rem">${i < players ? "Ready" : ""}</span>
              </div>
            `).join("")}
          </div>
          <div class="lobby-actions">
            <button type="button" class="btn-secondary" id="lobby-ready">I'm Ready</button>
            <button type="button" class="btn-primary" id="lobby-start">Start Game</button>
            <button type="button" class="btn-secondary" id="lobby-back">Back</button>
          </div>
          <div class="lobby-chat">
            <div class="lobby-chat-messages" id="lobby-chat-msg">
              <div>Welcome to the room.</div>
            </div>
            <div class="lobby-chat-input">
              <input type="text" placeholder="Type a message..." id="lobby-chat-in" />
              <button type="button" id="lobby-chat-send">Send</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  `;

  const randomize = () => document.getElementById("lobby-map-type")?.value === "random";
  const canvas = root.querySelector("#lobby-map");
  const draw = () => renderBoard(canvas, generateBoard(randomize()));
  draw();

  document.getElementById("lobby-map-type")?.addEventListener("change", draw);
  document.getElementById("lobby-players")?.addEventListener("change", (e) => {
    const n = +e.target.value;
    root.querySelectorAll(".player-slot").forEach((slot, i) => {
      slot.classList.toggle("hidden", i >= n);
    });
  });

  document.getElementById("lobby-chat-send")?.addEventListener("click", () => {
    const input = document.getElementById("lobby-chat-in");
    const msg = input?.value.trim();
    if (!msg) return;
    const box = document.getElementById("lobby-chat-msg");
    box.innerHTML += `<div><strong>You:</strong> ${escapeHtml(msg)}</div>`;
    input.value = "";
    box.scrollTop = box.scrollHeight;
  });

  document.getElementById("lobby-back")?.addEventListener("click", () => {
    location.hash = "#/";
  });

  document.getElementById("lobby-start")?.addEventListener("click", () => {
    const s = {
      mode: document.getElementById("lobby-mode").value,
      map: document.getElementById("lobby-map-type").value,
      timer: document.getElementById("lobby-timer").value,
      players: +document.getElementById("lobby-players").value,
      randomize: randomize(),
    };
    sessionStorage.setItem("lobbySettings", JSON.stringify(s));
    location.hash = "#/game";
  });
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
