export function renderHeader(active = "play") {
  return `
    <header class="site-header">
      <a href="#/" class="logo">
        <span class="logo-icon">⬡</span>
        <span>Settlers</span>
      </a>
      <nav>
        <a href="#/" class="${active === "play" ? "active" : ""}">Play</a>
        <button class="nav-link" type="button">Rooms</button>
        <button class="nav-link" type="button">Leaderboards</button>
        <button class="nav-link" type="button">Store</button>
      </nav>
      <div class="header-right">
        <button type="button" class="btn-login">Login</button>
      </div>
    </header>
  `;
}
