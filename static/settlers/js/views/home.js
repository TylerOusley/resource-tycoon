import { renderHeader } from "./header.js";
import { generateBoard, renderBoard } from "../board.js";

let previewAnim;

export function renderHome(root) {
  const online = 4200 + Math.floor(Math.random() * 2000);
  const gamesToday = 180000 + Math.floor(Math.random() * 40000);

  root.innerHTML = `
    <div class="view home-view">
      ${renderHeader("play")}
      <section class="home-hero">
        <div class="home-map-bg">
          <canvas id="home-map-canvas" width="700" height="500"></canvas>
        </div>
        <div class="home-content">
          <h1>#1 Free Online Settlers of Catan Alternative</h1>
          <div class="home-stats">
            <span><strong>${online.toLocaleString()}</strong> online</span>
            <span><strong>${gamesToday.toLocaleString()}</strong> games today</span>
          </div>
          <div class="home-mode-tabs">
            <button type="button" class="mode-tab active" data-mode="bots">Bots</button>
            <button type="button" class="mode-tab" data-mode="casual">Casual</button>
            <button type="button" class="mode-tab" data-mode="ranked">Ranked</button>
          </div>
          <div class="home-actions">
            <button type="button" class="btn-secondary" id="btn-friends">Play with Friends</button>
            <button type="button" class="btn-secondary" id="btn-online">Play Online</button>
          </div>
          <div class="home-start-wrap">
            <button type="button" class="btn-primary" id="btn-start">Start Game</button>
          </div>
        </div>
        <footer class="home-footer">
          <a href="#">Rules</a> | <a href="#">Privacy</a> | © 2026 Settlers
        </footer>
      </section>
    </div>
  `;

  const canvas = root.querySelector("#home-map-canvas");
  const tiles = generateBoard(false);
  renderBoard(canvas, tiles);

  let mode = "bots";
  root.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      root.querySelectorAll(".mode-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      mode = tab.dataset.mode;
    });
  });

  const goLobby = () => {
    sessionStorage.setItem(
      "lobbySettings",
      JSON.stringify({ mode, players: 4, map: "classic", timer: "standard", randomize: mode === "casual" })
    );
    location.hash = "#/lobby";
  };

  root.querySelector("#btn-start").addEventListener("click", goLobby);
  root.querySelector("#btn-friends").addEventListener("click", goLobby);
  root.querySelector("#btn-online").addEventListener("click", goLobby);

  cancelAnimationFrame(previewAnim);
}
