import { renderHome } from "./views/home.js";
import { renderLobby } from "./views/lobby.js";
import { renderGame } from "./views/game.js";

const app = document.getElementById("app");

const routes = {
  "/": renderHome,
  "/lobby": renderLobby,
  "/game": renderGame,
};

function getRoute() {
  const hash = location.hash.slice(1) || "/";
  return hash.split("?")[0];
}

function navigate() {
  const route = getRoute();
  const render = routes[route] || renderHome;
  window.removeEventListener("resize", () => {});
  render(app);
}

window.addEventListener("hashchange", navigate);
window.addEventListener("load", navigate);

if (!location.hash) {
  location.hash = "#/";
}
