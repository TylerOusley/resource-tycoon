export function renderHeader(active = "play") {
  return `
    <header class="site-header">
      <div class="header-left">
        <a href="/" class="portal-back">← Portal</a>
        <a href="#/" class="logo">
          <span class="logo-icon">⬡</span>
          <span>Settlers of Catan</span>
        </a>
      </div>
      <nav class="header-nav" aria-label="Game sections">
        <a href="#/" class="nav-link ${active === "play" ? "active" : ""}">Play</a>
      </nav>
      <div class="header-right">
        <span class="header-badge">Beta</span>
      </div>
    </header>
  `;
}
