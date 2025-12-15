// Castle Defenders Online - Game Client

const socket = io();

// Socket connection debugging
socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Socket disconnected');
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

// Game State
let playerId = null;
let playerProfile = null;
let gameState = null;
let selectedTower = null;
let selectedPlot = null;
let towerTypes = {};
let perks = {};
let unlockedTowers = {};
let xpForNextLevel = 100;
let myGold = 0;  // Track current player's gold directly

// Canvas
let canvas, ctx;
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;

// UI Elements
const screens = {
  login: document.getElementById('login-screen'),
  lobby: document.getElementById('lobby-screen'),
  game: document.getElementById('game-screen')
};

// Generate or retrieve player ID
function getPlayerId() {
  let id = localStorage.getItem('castleDefendersPlayerId');
  if (!id) {
    id = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('castleDefendersPlayerId', id);
  }
  return id;
}

// Screen management
function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[screenName].classList.add('active');
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Make closeModal globally available
window.closeModal = closeModal;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  
  setupEventListeners();
  
  // Check if returning player
  const savedName = localStorage.getItem('castleDefendersPlayerName');
  if (savedName) {
    document.getElementById('player-name').value = savedName;
  }
});

function setupEventListeners() {
  // Login
  document.getElementById('play-btn').addEventListener('click', handleLogin);
  document.getElementById('player-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  
  // Lobby - Game Creation/Joining
  document.getElementById('create-game-btn').addEventListener('click', () => {
    socket.emit('cd:createGame');
  });
  
  document.getElementById('join-game-btn').addEventListener('click', () => {
    // Show open games panel
    document.getElementById('open-games-panel').classList.remove('hidden');
    socket.emit('cd:getOpenGames');
  });
  
  document.getElementById('quick-join-btn').addEventListener('click', () => {
    // Quick join finds or creates a game automatically
    socket.emit('cd:joinGame');
  });
  
  document.getElementById('close-games-btn').addEventListener('click', () => {
    document.getElementById('open-games-panel').classList.add('hidden');
  });
  
  document.getElementById('perks-btn').addEventListener('click', () => {
    renderPerksModal();
    openModal('perks-modal');
  });
  
  document.getElementById('towers-btn').addEventListener('click', () => {
    renderTowersModal();
    openModal('towers-modal');
  });
  
  // Game
  document.getElementById('start-wave-btn').addEventListener('click', () => {
    socket.emit('cd:startWave');
  });
  
  document.getElementById('sell-tower-btn').addEventListener('click', handleSellTower);
  document.getElementById('cancel-select-btn').addEventListener('click', () => {
    selectedPlot = null;
    selectedTower = null;
    updateTowerPanel();
  });
  
  // Chat
  document.getElementById('chat-send-btn').addEventListener('click', sendChat);
  document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
  });
  
  // Game over
  document.getElementById('return-lobby-btn').addEventListener('click', () => {
    closeModal('gameover-modal');
    showScreen('lobby');
    // Refresh profile
    socket.emit('cd:login', {
      playerId: getPlayerId(),
      playerName: playerProfile.name
    });
  });
  
  // Canvas click
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('mousemove', handleCanvasHover);
  
  // Close modals on outside click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });
}

function handleLogin() {
  const nameInput = document.getElementById('player-name');
  const name = nameInput.value.trim() || 'Defender';
  const playBtn = document.getElementById('play-btn');
  
  // Visual feedback
  playBtn.textContent = '⏳ Connecting...';
  playBtn.disabled = true;
  
  localStorage.setItem('castleDefendersPlayerName', name);
  
  console.log('Attempting login with name:', name, 'and playerId:', getPlayerId());
  console.log('Socket connected:', socket.connected, 'Socket ID:', socket.id);
  
  if (!socket.connected) {
    console.error('Socket not connected! Attempting to reconnect...');
    playBtn.textContent = '🔄 Reconnecting...';
    socket.connect();
    // Wait a moment and try again
    setTimeout(() => {
      if (socket.connected) {
        socket.emit('cd:login', {
          playerId: getPlayerId(),
          playerName: name
        });
      } else {
        playBtn.innerHTML = '<span class="btn-icon">⚔️</span> Enter the Realm';
        playBtn.disabled = false;
        alert('Could not connect to server. Please check your internet connection and try again.');
      }
    }, 2000);
    return;
  }
  
  socket.emit('cd:login', {
    playerId: getPlayerId(),
    playerName: name
  });
  
  // Reset button after timeout if no response
  setTimeout(() => {
    if (!playerProfile) {
      playBtn.innerHTML = '<span class="btn-icon">⚔️</span> Enter the Realm';
      playBtn.disabled = false;
      console.error('No login response received after 5 seconds');
    }
  }, 5000);
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (message) {
    socket.emit('cd:chat', { message });
    input.value = '';
  }
}

function handleCanvasClick(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  if (!gameState) {
    console.log('No game state');
    return;
  }
  
  // Check if clicked on a plot
  for (const plot of gameState.plots) {
    const dx = x - plot.x;
    const dy = y - plot.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 30) {
      console.log('Clicked plot:', plot.id, 'tower:', plot.tower, 'selectedTower:', selectedTower);
      
      if (plot.tower) {
        // Select existing tower
        const tower = gameState.towers.find(t => t.id === plot.tower);
        if (tower && tower.ownerId === playerId) {
          selectedPlot = plot;
          selectedTower = null;
          updateTowerPanel();
          addChatMessage('System', `📍 Selected your ${towerTypes[tower.type]?.name || 'tower'}`);
        } else if (tower) {
          addChatMessage('System', `ℹ️ This tower belongs to ${tower.ownerName}`);
        }
      } else if (selectedTower) {
        // Place tower
        console.log('Placing tower:', selectedTower, 'on plot:', plot.id);
        socket.emit('cd:placeTower', {
          plotId: plot.id,
          towerType: selectedTower
        });
        selectedTower = null;
        updateTowerPanel();
      } else {
        // Empty plot, no tower selected
        selectedPlot = plot;
        updateTowerPanel();
        addChatMessage('System', '💡 Select a tower from the panel, then click here to build!');
      }
      return;
    }
  }
  
  // Clicked elsewhere, deselect
  selectedPlot = null;
  selectedTower = null;
  updateTowerPanel();
}

function handleCanvasHover(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  if (!gameState) return;
  
  // Check if hovering over a plot
  let hovering = false;
  for (const plot of gameState.plots) {
    const dx = x - plot.x;
    const dy = y - plot.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 30) {
      canvas.style.cursor = 'pointer';
      hovering = true;
      break;
    }
  }
  
  if (!hovering) {
    canvas.style.cursor = 'default';
  }
}

function handleSellTower() {
  if (selectedPlot && selectedPlot.tower) {
    socket.emit('cd:sellTower', { plotId: selectedPlot.id });
    selectedPlot = null;
    updateTowerPanel();
  }
}

function updateTowerPanel() {
  const sellBtn = document.getElementById('sell-tower-btn');
  const cancelBtn = document.getElementById('cancel-select-btn');
  const upgradePanel = document.getElementById('tower-upgrade-panel') || createUpgradePanel();
  
  if (selectedPlot && selectedPlot.tower && selectedPlot.owner === playerId) {
    sellBtn.classList.remove('hidden');
    cancelBtn.classList.remove('hidden');
    
    // Show upgrade panel for owned tower
    const tower = gameState?.towers?.find(t => t.id === selectedPlot.tower);
    if (tower) {
      showUpgradePanel(tower);
    } else {
      upgradePanel.classList.add('hidden');
    }
  } else if (selectedTower) {
    sellBtn.classList.add('hidden');
    cancelBtn.classList.remove('hidden');
    upgradePanel.classList.add('hidden');
  } else {
    sellBtn.classList.add('hidden');
    cancelBtn.classList.add('hidden');
    upgradePanel.classList.add('hidden');
  }
  
  // Update tower buttons to show selected state (don't recreate, just update class)
  document.querySelectorAll('.tower-btn').forEach(btn => {
    if (btn.dataset.type === selectedTower) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
  
  renderTowerButtons();
}

function createUpgradePanel() {
  const panel = document.createElement('div');
  panel.id = 'tower-upgrade-panel';
  panel.className = 'tower-upgrade-panel hidden';
  panel.innerHTML = `
    <h4>🔧 Upgrade Tower</h4>
    <div class="upgrade-buttons">
      <button class="upgrade-btn" data-type="damage">
        <span class="upgrade-icon">⚔️</span>
        <span class="upgrade-name">Damage</span>
        <span class="upgrade-level">Lv.1</span>
        <span class="upgrade-cost">50g</span>
      </button>
      <button class="upgrade-btn" data-type="range">
        <span class="upgrade-icon">📏</span>
        <span class="upgrade-name">Range</span>
        <span class="upgrade-level">Lv.1</span>
        <span class="upgrade-cost">40g</span>
      </button>
      <button class="upgrade-btn" data-type="speed">
        <span class="upgrade-icon">⚡</span>
        <span class="upgrade-name">Speed</span>
        <span class="upgrade-level">Lv.1</span>
        <span class="upgrade-cost">60g</span>
      </button>
    </div>
  `;
  
  // Add click handlers
  panel.querySelectorAll('.upgrade-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tower = gameState?.towers?.find(t => t.id === selectedPlot?.tower);
      if (tower) {
        socket.emit('cd:upgradeTower', {
          towerId: tower.id,
          upgradeType: btn.dataset.type
        });
      }
    });
  });
  
  // Insert after sell button
  const towerPanel = document.querySelector('.tower-panel');
  towerPanel.appendChild(panel);
  return panel;
}

function showUpgradePanel(tower) {
  const panel = document.getElementById('tower-upgrade-panel');
  if (!panel) return;
  
  panel.classList.remove('hidden');
  
  // Use myGold which is kept in sync
  const playerGold = myGold;
  
  const upgradeTypes = ['damage', 'range', 'speed'];
  upgradeTypes.forEach(type => {
    const btn = panel.querySelector(`.upgrade-btn[data-type="${type}"]`);
    if (!btn) return;
    
    const levelKey = type + 'Level';
    const level = tower[levelKey] || 1;
    const cost = tower.upgradeCosts?.[type];
    const maxed = cost === null || cost === undefined;
    
    btn.querySelector('.upgrade-level').textContent = `Lv.${level}${maxed ? ' MAX' : ''}`;
    btn.querySelector('.upgrade-cost').textContent = maxed ? 'MAXED' : `${cost}g`;
    
    btn.disabled = maxed || playerGold < cost;
    btn.classList.toggle('maxed', maxed);
    btn.classList.toggle('affordable', !maxed && playerGold >= cost);
  });
}

function renderTowerButtons() {
  const container = document.getElementById('tower-buttons');
  container.innerHTML = '';
  
  // Use myGold which is kept in sync
  const playerGold = myGold;
  
  const towerIcons = {
    cannon: '💣',
    archer: '🏹',
    mortar: '💥',
    wizard: '🔮',
    frost: '❄️',
    barracks: '⚔️',
    goldmine: '💰',
    tesla: '⚡',
    dragon: '🐉',
    sniper: '🎯',
    necromancer: '💀',
    shrine: '✨'
  };
  
  for (const [type, tower] of Object.entries(towerTypes)) {
    const isUnlocked = playerProfile && playerProfile.level >= tower.unlockLevel;
    const canAfford = playerGold >= tower.cost;
    
    const btn = document.createElement('button');
    btn.className = 'tower-btn';
    btn.dataset.type = type;
    
    if (!isUnlocked) btn.classList.add('locked');
    if (!canAfford && isUnlocked) btn.classList.add('too-expensive');
    if (selectedTower === type) btn.classList.add('selected');
    
    btn.innerHTML = `
      <div class="tower-btn-icon" style="background: ${tower.color}">
        ${towerIcons[type] || '🗼'}
      </div>
      <div class="tower-btn-info">
        <div class="tower-btn-name">${tower.name}</div>
        <div class="tower-btn-cost">💰 ${tower.cost}${!isUnlocked ? ' • Lv.' + tower.unlockLevel : ''}</div>
      </div>
    `;
    
    // Add click handler for all unlocked towers (even if too expensive, for feedback)
    if (isUnlocked) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!canAfford) {
          addChatMessage('System', `⚠️ Not enough gold for ${tower.name}!`);
          return;
        }
        
        selectedTower = type;
        selectedPlot = null;
        updateTowerPanel();
        addChatMessage('System', `🗼 Selected ${tower.name} - Click an empty plot to build!`);
      });
    }
    
    container.appendChild(btn);
  }
}

function renderPerksModal() {
  const container = document.getElementById('perks-grid');
  container.innerHTML = '';
  
  document.getElementById('modal-perk-points').textContent = playerProfile?.perkPoints || 0;
  
  for (const [perkId, perk] of Object.entries(perks)) {
    const currentLevel = playerProfile?.perks?.[perkId] || 0;
    const isMaxed = currentLevel >= perk.maxLevel;
    
    const card = document.createElement('div');
    card.className = 'perk-card' + (isMaxed ? ' maxed' : '');
    
    card.innerHTML = `
      <div class="perk-name">${perk.name}</div>
      <div class="perk-level">Level ${currentLevel} / ${perk.maxLevel}</div>
      <div class="perk-desc">${perk.description}</div>
    `;
    
    if (!isMaxed && playerProfile?.perkPoints > 0) {
      card.addEventListener('click', () => {
        socket.emit('cd:buyPerk', { perkId });
      });
    }
    
    container.appendChild(card);
  }
}

function renderTowersModal() {
  const container = document.getElementById('towers-grid');
  container.innerHTML = '';
  
  const towerIcons = {
    cannon: '💣',
    archer: '🏹',
    mortar: '💥',
    wizard: '🔮',
    frost: '❄️',
    barracks: '⚔️',
    goldmine: '💰',
    tesla: '⚡',
    dragon: '🐉',
    sniper: '🎯',
    necromancer: '💀',
    shrine: '✨'
  };
  
  for (const [type, tower] of Object.entries(towerTypes)) {
    const isUnlocked = playerProfile && playerProfile.level >= tower.unlockLevel;
    
    const card = document.createElement('div');
    card.className = 'tower-card' + (isUnlocked ? '' : ' locked');
    
    card.innerHTML = `
      <div class="tower-card-header">
        <div class="tower-icon" style="background: ${tower.color}">${towerIcons[type] || '🗼'}</div>
        <div>
          <div class="tower-name">${tower.name}</div>
          <div class="tower-cost">💰 ${tower.cost}</div>
        </div>
      </div>
      <div class="tower-stats">
        ${tower.damage > 0 ? `<span>⚔️ ${tower.damage}</span>` : ''}
        ${tower.range > 0 ? `<span>📏 ${tower.range}</span>` : ''}
        ${tower.fireRate > 0 ? `<span>⏱️ ${(tower.fireRate/1000).toFixed(1)}s</span>` : ''}
      </div>
      <div class="tower-desc">${tower.description}</div>
      ${!isUnlocked ? `<div class="tower-unlock">🔒 Unlock at Level ${tower.unlockLevel}</div>` : ''}
    `;
    
    container.appendChild(card);
  }
}

function updateProfileUI() {
  if (!playerProfile) return;
  
  document.getElementById('profile-name').textContent = playerProfile.name;
  document.getElementById('profile-level').textContent = playerProfile.level;
  
  const xpPercent = (playerProfile.xp / xpForNextLevel) * 100;
  document.getElementById('profile-xp-bar').style.width = xpPercent + '%';
  document.getElementById('profile-xp-text').textContent = `${playerProfile.xp} / ${xpForNextLevel} XP`;
  
  document.querySelector('#perk-points-display .points-count').textContent = playerProfile.perkPoints;
  
  document.getElementById('stat-games').textContent = playerProfile.totalGamesPlayed;
  document.getElementById('stat-waves').textContent = playerProfile.totalWavesSurvived;
  document.getElementById('stat-kills').textContent = playerProfile.totalEnemiesKilled;
  document.getElementById('stat-best').textContent = playerProfile.highestWave;
}

// Track last gold to avoid unnecessary re-renders
let lastPlayerGold = 0;

function updateGameUI() {
  if (!gameState) return;
  
  // Castle health
  const healthPercent = (gameState.castleHealth / gameState.maxCastleHealth) * 100;
  document.getElementById('castle-health-bar').style.width = healthPercent + '%';
  document.getElementById('castle-health-text').textContent = 
    `${Math.floor(gameState.castleHealth)} / ${gameState.maxCastleHealth}`;
  
  // Wave
  document.getElementById('wave-number').textContent = gameState.wave;
  
  // Player resources - use myGold which is kept in sync
  const player = gameState.players?.find(p => p.id === playerId);
  document.getElementById('player-gold').textContent = Math.floor(myGold);
  document.getElementById('player-score').textContent = player?.score || 0;
  
  // Only re-render tower buttons if gold changed significantly
  if (Math.floor(myGold) !== Math.floor(lastPlayerGold)) {
    lastPlayerGold = myGold;
    renderTowerButtons();
  }
  
  // Players list
  const playersList = document.getElementById('players-list');
  playersList.innerHTML = '';
  for (const p of gameState.players) {
    const tag = document.createElement('div');
    tag.className = 'player-tag';
    tag.innerHTML = `
      <div class="player-level-badge">${p.level}</div>
      <span>${p.name}</span>
      <span style="color: var(--gold)">💰${Math.floor(p.gold)}</span>
    `;
    playersList.appendChild(tag);
  }
  
  // Wave button
  const waveBtn = document.getElementById('start-wave-btn');
  if (gameState.waveInProgress) {
    waveBtn.disabled = true;
    waveBtn.textContent = 'Wave in Progress...';
  } else {
    waveBtn.disabled = false;
    waveBtn.textContent = `Start Wave ${gameState.wave + 1}`;
  }
}

// Pre-generate background elements for performance
let backgroundGenerated = false;
let backgroundCanvas = null;

function generateBackground() {
  backgroundCanvas = document.createElement('canvas');
  backgroundCanvas.width = CANVAS_WIDTH;
  backgroundCanvas.height = CANVAS_HEIGHT;
  const bgCtx = backgroundCanvas.getContext('2d');
  
  // Base grass gradient
  const grassGrad = bgCtx.createRadialGradient(
    CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0,
    CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH
  );
  grassGrad.addColorStop(0, '#2d5a27');
  grassGrad.addColorStop(0.5, '#1e4a1a');
  grassGrad.addColorStop(1, '#153515');
  bgCtx.fillStyle = grassGrad;
  bgCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  
  // Add grass texture patches
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * CANVAS_WIDTH;
    const y = Math.random() * CANVAS_HEIGHT;
    const size = 15 + Math.random() * 30;
    const alpha = 0.1 + Math.random() * 0.15;
    
    bgCtx.fillStyle = Math.random() > 0.5 
      ? `rgba(45, 100, 39, ${alpha})` 
      : `rgba(20, 60, 18, ${alpha})`;
    bgCtx.beginPath();
    bgCtx.ellipse(x, y, size, size * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
    bgCtx.fill();
  }
  
  // Add small grass tufts
  bgCtx.strokeStyle = '#3a6b35';
  bgCtx.lineWidth = 2;
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * CANVAS_WIDTH;
    const y = Math.random() * CANVAS_HEIGHT;
    const height = 5 + Math.random() * 10;
    
    bgCtx.beginPath();
    bgCtx.moveTo(x, y);
    bgCtx.lineTo(x - 3, y - height);
    bgCtx.moveTo(x, y);
    bgCtx.lineTo(x + 2, y - height * 0.8);
    bgCtx.moveTo(x, y);
    bgCtx.lineTo(x + 4, y - height * 0.6);
    bgCtx.stroke();
  }
  
  // Add some flowers/plants
  const flowerColors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff8fab'];
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * CANVAS_WIDTH;
    const y = Math.random() * CANVAS_HEIGHT;
    const color = flowerColors[Math.floor(Math.random() * flowerColors.length)];
    
    bgCtx.fillStyle = color;
    bgCtx.beginPath();
    bgCtx.arc(x, y, 2 + Math.random() * 3, 0, Math.PI * 2);
    bgCtx.fill();
  }
  
  // Add rocks
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * CANVAS_WIDTH;
    const y = Math.random() * CANVAS_HEIGHT;
    const size = 5 + Math.random() * 12;
    
    bgCtx.fillStyle = '#4a4a4a';
    bgCtx.beginPath();
    bgCtx.ellipse(x, y, size, size * 0.7, 0, 0, Math.PI * 2);
    bgCtx.fill();
    
    bgCtx.fillStyle = '#5a5a5a';
    bgCtx.beginPath();
    bgCtx.ellipse(x - size * 0.2, y - size * 0.2, size * 0.5, size * 0.3, 0, 0, Math.PI * 2);
    bgCtx.fill();
  }
  
  // Add trees around the edges
  const treePositions = [
    {x: 30, y: 50}, {x: 80, y: 520}, {x: 850, y: 80}, {x: 870, y: 550},
    {x: 50, y: 250}, {x: 870, y: 200}, {x: 400, y: 30}, {x: 500, y: 570}
  ];
  
  for (const pos of treePositions) {
    // Tree shadow
    bgCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    bgCtx.beginPath();
    bgCtx.ellipse(pos.x + 5, pos.y + 35, 20, 10, 0, 0, Math.PI * 2);
    bgCtx.fill();
    
    // Tree trunk
    bgCtx.fillStyle = '#5d4037';
    bgCtx.fillRect(pos.x - 5, pos.y, 10, 30);
    
    // Tree foliage (layered circles)
    bgCtx.fillStyle = '#2e7d32';
    bgCtx.beginPath();
    bgCtx.arc(pos.x, pos.y - 15, 25, 0, Math.PI * 2);
    bgCtx.fill();
    
    bgCtx.fillStyle = '#388e3c';
    bgCtx.beginPath();
    bgCtx.arc(pos.x - 10, pos.y - 5, 18, 0, Math.PI * 2);
    bgCtx.fill();
    
    bgCtx.beginPath();
    bgCtx.arc(pos.x + 12, pos.y - 8, 16, 0, Math.PI * 2);
    bgCtx.fill();
    
    bgCtx.fillStyle = '#43a047';
    bgCtx.beginPath();
    bgCtx.arc(pos.x, pos.y - 25, 15, 0, Math.PI * 2);
    bgCtx.fill();
  }
  
  backgroundGenerated = true;
}

function render() {
  if (!gameState || !ctx) return;
  
  // Generate background once
  if (!backgroundGenerated) {
    generateBackground();
  }
  
  // Draw pre-rendered background
  if (backgroundCanvas) {
    ctx.drawImage(backgroundCanvas, 0, 0);
  } else {
    ctx.fillStyle = '#1e4a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  // Draw path with better styling
  if (gameState.path && gameState.path.length > 1) {
    // Outer border (dark)
    ctx.strokeStyle = '#2a1a0a';
    ctx.lineWidth = 48;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(gameState.path[0].x, gameState.path[0].y);
    for (let i = 1; i < gameState.path.length; i++) {
      ctx.lineTo(gameState.path[i].x, gameState.path[i].y);
    }
    ctx.stroke();
    
    // Main path (dirt)
    ctx.strokeStyle = '#6b5344';
    ctx.lineWidth = 42;
    ctx.beginPath();
    ctx.moveTo(gameState.path[0].x, gameState.path[0].y);
    for (let i = 1; i < gameState.path.length; i++) {
      ctx.lineTo(gameState.path[i].x, gameState.path[i].y);
    }
    ctx.stroke();
    
    // Inner highlight
    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 32;
    ctx.beginPath();
    ctx.moveTo(gameState.path[0].x, gameState.path[0].y);
    for (let i = 1; i < gameState.path.length; i++) {
      ctx.lineTo(gameState.path[i].x, gameState.path[i].y);
    }
    ctx.stroke();
    
    // Center line (lighter)
    ctx.strokeStyle = '#9a8465';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(gameState.path[0].x, gameState.path[0].y);
    for (let i = 1; i < gameState.path.length; i++) {
      ctx.lineTo(gameState.path[i].x, gameState.path[i].y);
    }
    ctx.stroke();
  }
  
  // Draw castle (improved)
  const castleX = canvas.width - 50;
  const castleY = 300;
  
  // Castle platform
  ctx.fillStyle = '#4a4a4a';
  ctx.beginPath();
  ctx.ellipse(castleX, castleY + 50, 70, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Castle shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(castleX + 8, castleY + 55, 60, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Castle wall base
  ctx.fillStyle = '#6a6a7a';
  ctx.fillRect(castleX - 45, castleY - 20, 90, 65);
  
  // Castle wall gradient
  const wallGrad = ctx.createLinearGradient(castleX - 45, 0, castleX + 45, 0);
  wallGrad.addColorStop(0, '#5a5a6a');
  wallGrad.addColorStop(0.5, '#7a7a8a');
  wallGrad.addColorStop(1, '#5a5a6a');
  ctx.fillStyle = wallGrad;
  ctx.fillRect(castleX - 42, castleY - 17, 84, 59);
  
  // Battlements
  ctx.fillStyle = '#5a5a6a';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(castleX - 40 + i * 20, castleY - 30, 12, 15);
  }
  
  // Left tower
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(castleX - 55, castleY - 55, 30, 100);
  ctx.fillStyle = '#5a5a6a';
  ctx.fillRect(castleX - 52, castleY - 52, 24, 94);
  
  // Right tower
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(castleX + 25, castleY - 55, 30, 100);
  ctx.fillStyle = '#5a5a6a';
  ctx.fillRect(castleX + 28, castleY - 52, 24, 94);
  
  // Tower roofs
  ctx.fillStyle = '#b91c1c';
  ctx.beginPath();
  ctx.moveTo(castleX - 60, castleY - 55);
  ctx.lineTo(castleX - 40, castleY - 85);
  ctx.lineTo(castleX - 20, castleY - 55);
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(castleX + 20, castleY - 55);
  ctx.lineTo(castleX + 40, castleY - 85);
  ctx.lineTo(castleX + 60, castleY - 55);
  ctx.fill();
  
  // Roof highlights
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(castleX - 55, castleY - 55);
  ctx.lineTo(castleX - 40, castleY - 80);
  ctx.lineTo(castleX - 40, castleY - 55);
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(castleX + 25, castleY - 55);
  ctx.lineTo(castleX + 40, castleY - 80);
  ctx.lineTo(castleX + 40, castleY - 55);
  ctx.fill();
  
  // Flags
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(castleX - 40, castleY - 85);
  ctx.lineTo(castleX - 40, castleY - 100);
  ctx.lineTo(castleX - 25, castleY - 92);
  ctx.lineTo(castleX - 40, castleY - 85);
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(castleX + 40, castleY - 85);
  ctx.lineTo(castleX + 40, castleY - 100);
  ctx.lineTo(castleX + 55, castleY - 92);
  ctx.lineTo(castleX + 40, castleY - 85);
  ctx.fill();
  
  // Flag poles
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(castleX - 40, castleY - 85);
  ctx.lineTo(castleX - 40, castleY - 102);
  ctx.moveTo(castleX + 40, castleY - 85);
  ctx.lineTo(castleX + 40, castleY - 102);
  ctx.stroke();
  
  // Castle gate
  ctx.fillStyle = '#3d2817';
  ctx.beginPath();
  ctx.moveTo(castleX - 18, castleY + 45);
  ctx.lineTo(castleX - 18, castleY + 5);
  ctx.quadraticCurveTo(castleX, castleY - 10, castleX + 18, castleY + 5);
  ctx.lineTo(castleX + 18, castleY + 45);
  ctx.fill();
  
  // Gate details
  ctx.strokeStyle = '#2a1a0a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(castleX, castleY + 45);
  ctx.lineTo(castleX, castleY + 5);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(castleX - 15, castleY + 20);
  ctx.lineTo(castleX + 15, castleY + 20);
  ctx.stroke();
  
  // Tower windows
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(castleX - 47, castleY - 35, 8, 12);
  ctx.fillRect(castleX - 47, castleY - 10, 8, 12);
  ctx.fillRect(castleX + 39, castleY - 35, 8, 12);
  ctx.fillRect(castleX + 39, castleY - 10, 8, 12);
  
  // Window glow
  ctx.fillStyle = 'rgba(255, 200, 100, 0.3)';
  ctx.fillRect(castleX - 46, castleY - 34, 6, 10);
  ctx.fillRect(castleX - 46, castleY - 9, 6, 10);
  ctx.fillRect(castleX + 40, castleY - 34, 6, 10);
  ctx.fillRect(castleX + 40, castleY - 9, 6, 10);
  
  // Draw plots
  for (const plot of gameState.plots) {
    const isSelected = selectedPlot && selectedPlot.id === plot.id;
    const canBuild = selectedTower && !plot.tower;
    
    if (plot.tower) {
      // Draw tower
      const tower = gameState.towers.find(t => t.id === plot.tower);
      if (tower) {
        drawTower(tower, plot, isSelected);
      }
    } else {
      // Draw empty plot - stone platform
      ctx.fillStyle = '#4a4a4a';
      ctx.beginPath();
      ctx.ellipse(plot.x, plot.y + 5, 28, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#5a5a5a';
      ctx.beginPath();
      ctx.ellipse(plot.x, plot.y, 26, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#6a6a6a';
      ctx.beginPath();
      ctx.ellipse(plot.x, plot.y - 3, 22, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Highlight when can build or selected
      if (isSelected) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(plot.x, plot.y, 30, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
        ctx.beginPath();
        ctx.arc(plot.x, plot.y, 28, 0, Math.PI * 2);
        ctx.fill();
      } else if (canBuild) {
        // Glow effect when tower is selected
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(plot.x, plot.y, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
        ctx.beginPath();
        ctx.arc(plot.x, plot.y, 28, 0, Math.PI * 2);
        ctx.fill();
        
        // Plus icon
        ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
        ctx.fillRect(plot.x - 8, plot.y - 2, 16, 4);
        ctx.fillRect(plot.x - 2, plot.y - 8, 4, 16);
      }
    }
  }
  
  // Draw troops
  for (const troop of gameState.troops || []) {
    ctx.fillStyle = troop.type === 'skeleton' ? '#d4d4d4' : '#4a8b4a';
    ctx.beginPath();
    ctx.arc(troop.x, troop.y, 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#2a4a2a';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  
  // Draw enemies
  for (const enemy of gameState.enemies) {
    drawEnemy(enemy);
  }
  
  // Draw projectiles with unique graphics per type
  for (const proj of gameState.projectiles) {
    const target = gameState.enemies.find(e => e.id === proj.targetId);
    let angle = 0;
    if (target) {
      angle = Math.atan2(target.y - proj.y, target.x - proj.x);
    }
    
    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.rotate(angle);
    
    switch(proj.type) {
      case 'archer':
        // Arrow
        ctx.fillStyle = '#8b4513';
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-8, -2);
        ctx.lineTo(-8, 2);
        ctx.fill();
        // Arrow head
        ctx.fillStyle = '#757575';
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(10, -3);
        ctx.lineTo(10, 3);
        ctx.fill();
        // Feathers
        ctx.fillStyle = '#f44336';
        ctx.beginPath();
        ctx.moveTo(-8, -2);
        ctx.lineTo(-12, -5);
        ctx.lineTo(-6, -1);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-8, 2);
        ctx.lineTo(-12, 5);
        ctx.lineTo(-6, 1);
        ctx.fill();
        break;
        
      case 'cannon':
        // Cannonball
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a4a4a';
        ctx.beginPath();
        ctx.arc(-2, -2, 3, 0, Math.PI * 2);
        ctx.fill();
        // Smoke trail
        ctx.fillStyle = 'rgba(100, 100, 100, 0.4)';
        ctx.beginPath();
        ctx.arc(-10, 0, 4, 0, Math.PI * 2);
        ctx.arc(-16, 2, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'mortar':
        // Explosive shell
        ctx.fillStyle = '#5d4037';
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8d6e63';
        ctx.beginPath();
        ctx.ellipse(-2, -2, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Fuse spark
        ctx.fillStyle = '#ff9800';
        ctx.beginPath();
        ctx.arc(8, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath();
        ctx.arc(8, 0, 1.5, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'wizard':
      case 'chain':
        // Magic bolt
        ctx.fillStyle = '#e040fb';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-6, -5);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-6, 5);
        ctx.fill();
        // Magic glow
        ctx.fillStyle = 'rgba(224, 64, 251, 0.4)';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        // Sparkles
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(5, -3, 1.5, 0, Math.PI * 2);
        ctx.arc(-2, 4, 1, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'frost':
        // Ice shard
        ctx.fillStyle = '#4dd0e1';
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-4, -6);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-4, 6);
        ctx.fill();
        ctx.fillStyle = '#80deea';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-2, -4);
        ctx.lineTo(-2, 4);
        ctx.fill();
        // Frost particles
        ctx.fillStyle = 'rgba(77, 208, 225, 0.5)';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(-8 - i * 5, (i - 1) * 4, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
        
      case 'tesla':
        // Lightning bolt
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(-4, -4);
        ctx.lineTo(2, 2);
        ctx.lineTo(10, 0);
        ctx.stroke();
        // Glow
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
        ctx.lineWidth = 8;
        ctx.stroke();
        break;
        
      case 'dragon':
        // Fireball
        ctx.fillStyle = '#ff5722';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff9800';
        ctx.beginPath();
        ctx.arc(2, -2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath();
        ctx.arc(3, -1, 3, 0, Math.PI * 2);
        ctx.fill();
        // Fire trail
        ctx.fillStyle = 'rgba(255, 87, 34, 0.5)';
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.quadraticCurveTo(-15, -8, -20, 0);
        ctx.quadraticCurveTo(-15, 8, -5, 0);
        ctx.fill();
        break;
        
      case 'sniper':
        // Bullet with tracer
        ctx.fillStyle = '#ffc107';
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff5722';
        ctx.beginPath();
        ctx.ellipse(-8, 0, 6, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Muzzle flash remnant
        ctx.fillStyle = 'rgba(255, 235, 59, 0.3)';
        ctx.beginPath();
        ctx.arc(-15, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'necromancer':
        // Soul orb
        ctx.fillStyle = 'rgba(75, 0, 130, 0.8)';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9c27b0';
        ctx.beginPath();
        ctx.arc(2, -2, 4, 0, Math.PI * 2);
        ctx.fill();
        // Ghostly trail
        ctx.fillStyle = 'rgba(156, 39, 176, 0.3)';
        ctx.beginPath();
        ctx.ellipse(-10, 0, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Skull face
        ctx.fillStyle = '#e0e0e0';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a0080';
        ctx.beginPath();
        ctx.arc(-1, -1, 1, 0, Math.PI * 2);
        ctx.arc(1, -1, 1, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      default:
        // Generic projectile
        ctx.fillStyle = proj.color || '#ffff00';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(-2, -2, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
  }
  
  // Draw selected tower range
  if (selectedPlot && selectedPlot.tower) {
    const tower = gameState.towers.find(t => t.id === selectedPlot.tower);
    if (tower) {
      const towerType = towerTypes[tower.type];
      if (towerType && towerType.range > 0) {
        ctx.strokeStyle = 'rgba(212, 168, 75, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, towerType.range, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(212, 168, 75, 0.1)';
        ctx.fill();
      }
    }
  }
  
  // Show tower range when selecting tower type
  if (selectedTower) {
    const towerType = towerTypes[selectedTower];
    if (towerType && towerType.range > 0) {
      for (const plot of gameState.plots) {
        if (!plot.tower) {
          ctx.strokeStyle = 'rgba(212, 168, 75, 0.2)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(plot.x, plot.y, towerType.range, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }
  
  requestAnimationFrame(render);
}

function drawTower(tower, plot, isSelected) {
  const towerType = towerTypes[tower.type];
  const x = plot.x;
  const y = plot.y;
  
  // Stone base platform
  ctx.fillStyle = '#4a4a4a';
  ctx.beginPath();
  ctx.ellipse(x, y + 8, 26, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a5a5a';
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 24, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  
  switch(tower.type) {
    case 'cannon':
      // Cannon base - wooden platform
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(x - 18, y - 8, 36, 16);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(x - 16, y - 6, 32, 12);
      
      // Cannon body
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.ellipse(x, y - 8, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Cannon barrel
      ctx.fillStyle = '#3a3a3a';
      ctx.save();
      ctx.translate(x, y - 8);
      ctx.rotate(-0.3);
      ctx.fillRect(-5, -25, 10, 22);
      ctx.fillStyle = '#4a4a4a';
      ctx.beginPath();
      ctx.ellipse(0, -25, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      
      // Wheels
      ctx.fillStyle = '#5d4037';
      ctx.beginPath();
      ctx.arc(x - 14, y + 2, 8, 0, Math.PI * 2);
      ctx.arc(x + 14, y + 2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a3028';
      ctx.beginPath();
      ctx.arc(x - 14, y + 2, 4, 0, Math.PI * 2);
      ctx.arc(x + 14, y + 2, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'archer':
      // Wooden tower
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(x - 14, y - 35, 28, 45);
      ctx.fillStyle = '#6d5047';
      ctx.fillRect(x - 12, y - 33, 24, 41);
      
      // Wood grain lines
      ctx.strokeStyle = '#4a3028';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 10, y - 30 + i * 10);
        ctx.lineTo(x + 10, y - 30 + i * 10);
        ctx.stroke();
      }
      
      // Roof
      ctx.fillStyle = '#1b5e20';
      ctx.beginPath();
      ctx.moveTo(x - 20, y - 35);
      ctx.lineTo(x, y - 55);
      ctx.lineTo(x + 20, y - 35);
      ctx.fill();
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.moveTo(x - 18, y - 35);
      ctx.lineTo(x, y - 50);
      ctx.lineTo(x, y - 35);
      ctx.fill();
      
      // Archer figure
      ctx.fillStyle = '#8d6e63';
      ctx.beginPath();
      ctx.arc(x, y - 28, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(x - 3, y - 23, 6, 10);
      
      // Bow
      ctx.strokeStyle = '#8b4513';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 8, y - 20, 12, -Math.PI * 0.7, Math.PI * 0.7);
      ctx.stroke();
      ctx.strokeStyle = '#d4a574';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 8, y - 30);
      ctx.lineTo(x + 8, y - 10);
      ctx.stroke();
      break;
      
    case 'mortar':
      // Heavy stone base
      ctx.fillStyle = '#5a5a5a';
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6a6a6a';
      ctx.beginPath();
      ctx.arc(x, y - 3, 18, 0, Math.PI * 2);
      ctx.fill();
      
      // Mortar tube
      ctx.fillStyle = '#3a3a3a';
      ctx.save();
      ctx.translate(x, y - 5);
      ctx.rotate(-0.5);
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-8, -28);
      ctx.lineTo(8, -28);
      ctx.lineTo(10, 0);
      ctx.fill();
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.ellipse(0, -28, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      
      // Metal bands
      ctx.strokeStyle = '#8b7355';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 20, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      break;
      
    case 'wizard':
      // Mystical tower
      ctx.fillStyle = '#4a148c';
      ctx.fillRect(x - 12, y - 30, 24, 40);
      ctx.fillStyle = '#6a1b9a';
      ctx.fillRect(x - 10, y - 28, 20, 36);
      
      // Magical swirl decoration
      ctx.strokeStyle = '#ab47bc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 10, 8, 0, Math.PI * 1.5);
      ctx.stroke();
      
      // Pointed roof with crystal
      ctx.fillStyle = '#7b1fa2';
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 30);
      ctx.lineTo(x, y - 55);
      ctx.lineTo(x + 16, y - 30);
      ctx.fill();
      
      // Glowing crystal on top
      ctx.fillStyle = '#e040fb';
      ctx.beginPath();
      ctx.moveTo(x, y - 55);
      ctx.lineTo(x - 6, y - 45);
      ctx.lineTo(x + 6, y - 45);
      ctx.fill();
      
      // Crystal glow
      ctx.fillStyle = 'rgba(224, 64, 251, 0.4)';
      ctx.beginPath();
      ctx.arc(x, y - 50, 12, 0, Math.PI * 2);
      ctx.fill();
      
      // Magic particles
      const time = Date.now() / 500;
      for (let i = 0; i < 3; i++) {
        const angle = time + i * 2.1;
        const px = x + Math.cos(angle) * 15;
        const py = y - 30 + Math.sin(angle) * 10;
        ctx.fillStyle = '#e040fb';
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
      
    case 'frost':
      // Ice crystal tower
      ctx.fillStyle = '#4dd0e1';
      ctx.beginPath();
      ctx.moveTo(x, y - 45);
      ctx.lineTo(x - 18, y + 5);
      ctx.lineTo(x + 18, y + 5);
      ctx.fill();
      
      ctx.fillStyle = '#80deea';
      ctx.beginPath();
      ctx.moveTo(x, y - 45);
      ctx.lineTo(x, y + 5);
      ctx.lineTo(x + 15, y + 5);
      ctx.fill();
      
      // Ice shards
      ctx.fillStyle = '#b2ebf2';
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 20);
      ctx.lineTo(x - 20, y - 30);
      ctx.lineTo(x - 5, y - 25);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 8, y - 20);
      ctx.lineTo(x + 20, y - 30);
      ctx.lineTo(x + 5, y - 25);
      ctx.fill();
      
      // Frost aura
      ctx.fillStyle = 'rgba(77, 208, 225, 0.3)';
      ctx.beginPath();
      ctx.arc(x, y - 15, 25, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'barracks':
      // Military tent/building
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(x - 22, y - 15, 44, 25);
      ctx.fillStyle = '#6d5047';
      ctx.fillRect(x - 20, y - 13, 40, 21);
      
      // Roof
      ctx.fillStyle = '#8b4513';
      ctx.beginPath();
      ctx.moveTo(x - 28, y - 15);
      ctx.lineTo(x, y - 35);
      ctx.lineTo(x + 28, y - 15);
      ctx.fill();
      ctx.fillStyle = '#a0522d';
      ctx.beginPath();
      ctx.moveTo(x - 25, y - 15);
      ctx.lineTo(x, y - 30);
      ctx.lineTo(x, y - 15);
      ctx.fill();
      
      // Door
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(x - 6, y - 5, 12, 15);
      
      // Flag
      ctx.fillStyle = '#c62828';
      ctx.beginPath();
      ctx.moveTo(x + 15, y - 35);
      ctx.lineTo(x + 15, y - 50);
      ctx.lineTo(x + 30, y - 42);
      ctx.fill();
      ctx.strokeStyle = '#5d4037';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 15, y - 35);
      ctx.lineTo(x + 15, y - 52);
      ctx.stroke();
      
      // Soldiers
      ctx.fillStyle = '#7cb342';
      ctx.beginPath();
      ctx.arc(x - 10, y - 2, 4, 0, Math.PI * 2);
      ctx.arc(x + 10, y - 2, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'goldmine':
      // Mine entrance
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(x - 20, y - 20, 40, 30);
      ctx.fillStyle = '#4e342e';
      ctx.beginPath();
      ctx.arc(x, y - 5, 12, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(x, y - 3, 10, Math.PI, 0);
      ctx.fill();
      
      // Wooden frame
      ctx.strokeStyle = '#8b4513';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - 12, y + 5);
      ctx.lineTo(x - 12, y - 15);
      ctx.lineTo(x + 12, y - 15);
      ctx.lineTo(x + 12, y + 5);
      ctx.stroke();
      
      // Gold piles
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(x - 8, y + 5, 5, 0, Math.PI * 2);
      ctx.arc(x + 6, y + 7, 4, 0, Math.PI * 2);
      ctx.arc(x, y + 3, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.arc(x - 5, y + 2, 3, 0, Math.PI * 2);
      ctx.arc(x + 3, y + 4, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'tesla':
      // Metal base
      ctx.fillStyle = '#455a64';
      ctx.fillRect(x - 15, y - 5, 30, 15);
      ctx.fillStyle = '#546e7a';
      ctx.fillRect(x - 12, y - 3, 24, 11);
      
      // Tesla coil
      ctx.fillStyle = '#37474f';
      ctx.fillRect(x - 6, y - 40, 12, 40);
      ctx.fillStyle = '#455a64';
      ctx.fillRect(x - 4, y - 38, 8, 36);
      
      // Coil rings
      ctx.strokeStyle = '#00bcd4';
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(x, y - 35 + i * 8, 12 - i, 5 - i * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      // Electric orb on top
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(x, y - 45, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Electric glow
      ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(x, y - 45, 14, 0, Math.PI * 2);
      ctx.fill();
      
      // Lightning bolts
      const t = Date.now() / 100;
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const angle = t + i * 3;
        ctx.beginPath();
        ctx.moveTo(x, y - 45);
        ctx.lineTo(x + Math.cos(angle) * 20, y - 45 + Math.sin(angle) * 20);
        ctx.stroke();
      }
      break;
      
    case 'dragon':
      // Dragon nest
      ctx.fillStyle = '#5d4037';
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 22, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8d6e63';
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Dragon body
      ctx.fillStyle = '#c62828';
      ctx.beginPath();
      ctx.ellipse(x, y - 15, 16, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Dragon head
      ctx.fillStyle = '#d32f2f';
      ctx.beginPath();
      ctx.ellipse(x + 12, y - 22, 10, 8, 0.3, 0, Math.PI * 2);
      ctx.fill();
      
      // Dragon eye
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.arc(x + 16, y - 24, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x + 17, y - 24, 1.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Wings
      ctx.fillStyle = '#b71c1c';
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 18);
      ctx.quadraticCurveTo(x - 25, y - 40, x - 5, y - 30);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 5, y - 18);
      ctx.quadraticCurveTo(x + 20, y - 45, x + 5, y - 30);
      ctx.fill();
      
      // Fire breath
      const fireTime = Date.now() / 200;
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.moveTo(x + 20, y - 22);
      ctx.quadraticCurveTo(x + 35 + Math.sin(fireTime) * 3, y - 25, x + 40, y - 22);
      ctx.quadraticCurveTo(x + 35, y - 20, x + 20, y - 22);
      ctx.fill();
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.moveTo(x + 20, y - 22);
      ctx.quadraticCurveTo(x + 30, y - 23, x + 32, y - 22);
      ctx.quadraticCurveTo(x + 28, y - 21, x + 20, y - 22);
      ctx.fill();
      break;
      
    case 'sniper':
      // Tall sniper tower
      ctx.fillStyle = '#37474f';
      ctx.fillRect(x - 8, y - 50, 16, 60);
      ctx.fillStyle = '#455a64';
      ctx.fillRect(x - 6, y - 48, 12, 56);
      
      // Platform at top
      ctx.fillStyle = '#546e7a';
      ctx.fillRect(x - 14, y - 55, 28, 8);
      
      // Sniper figure
      ctx.fillStyle = '#4caf50';
      ctx.beginPath();
      ctx.arc(x, y - 48, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 3, y - 43, 6, 8);
      
      // Sniper rifle
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(x + 5, y - 48, 18, 3);
      
      // Scope
      ctx.fillStyle = '#263238';
      ctx.beginPath();
      ctx.ellipse(x + 12, y - 50, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Scope glint
      ctx.fillStyle = '#f44336';
      ctx.beginPath();
      ctx.arc(x + 23, y - 47, 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Ladder
      ctx.strokeStyle = '#5d4037';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 6, y + 8);
      ctx.lineTo(x - 6, y - 45);
      ctx.moveTo(x + 6, y + 8);
      ctx.lineTo(x + 6, y - 45);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 6, y - i * 10);
        ctx.lineTo(x + 6, y - i * 10);
        ctx.stroke();
      }
      break;
      
    case 'necromancer':
      // Dark tower
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(x - 12, y - 35, 24, 45);
      ctx.fillStyle = '#252545';
      ctx.fillRect(x - 10, y - 33, 20, 41);
      
      // Skull decoration
      ctx.fillStyle = '#e0e0e0';
      ctx.beginPath();
      ctx.arc(x, y - 45, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#bdbdbd';
      ctx.beginPath();
      ctx.arc(x, y - 42, 8, Math.PI * 0.2, Math.PI * 0.8);
      ctx.fill();
      
      // Eye sockets
      ctx.fillStyle = '#7c4dff';
      ctx.beginPath();
      ctx.arc(x - 4, y - 47, 3, 0, Math.PI * 2);
      ctx.arc(x + 4, y - 47, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Glowing eyes
      ctx.fillStyle = 'rgba(124, 77, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(x - 4, y - 47, 6, 0, Math.PI * 2);
      ctx.arc(x + 4, y - 47, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Dark aura
      ctx.fillStyle = 'rgba(75, 0, 130, 0.3)';
      ctx.beginPath();
      ctx.arc(x, y - 20, 30, 0, Math.PI * 2);
      ctx.fill();
      
      // Floating souls
      const soulTime = Date.now() / 800;
      for (let i = 0; i < 3; i++) {
        const angle = soulTime + i * 2.1;
        const sx = x + Math.cos(angle) * 20;
        const sy = y - 20 + Math.sin(angle * 0.5) * 15;
        ctx.fillStyle = 'rgba(124, 77, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
      
    case 'shrine':
      // Stone altar base
      ctx.fillStyle = '#9e9e9e';
      ctx.fillRect(x - 20, y - 5, 40, 15);
      ctx.fillStyle = '#bdbdbd';
      ctx.fillRect(x - 18, y - 3, 36, 11);
      
      // Pillar
      ctx.fillStyle = '#e0e0e0';
      ctx.fillRect(x - 8, y - 35, 16, 35);
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(x - 6, y - 33, 12, 31);
      
      // Holy symbol
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y - 25);
      ctx.lineTo(x, y - 15);
      ctx.moveTo(x - 5, y - 20);
      ctx.lineTo(x + 5, y - 20);
      ctx.stroke();
      
      // Glowing orb
      ctx.fillStyle = '#fff59d';
      ctx.beginPath();
      ctx.arc(x, y - 42, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffee58';
      ctx.beginPath();
      ctx.arc(x, y - 42, 7, 0, Math.PI * 2);
      ctx.fill();
      
      // Divine glow
      ctx.fillStyle = 'rgba(255, 235, 59, 0.3)';
      ctx.beginPath();
      ctx.arc(x, y - 42, 25, 0, Math.PI * 2);
      ctx.fill();
      
      // Light rays
      ctx.strokeStyle = 'rgba(255, 235, 59, 0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * 12, y - 42 + Math.sin(angle) * 12);
        ctx.lineTo(x + Math.cos(angle) * 22, y - 42 + Math.sin(angle) * 22);
        ctx.stroke();
      }
      break;
      
    default:
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();
  }
  
  // Selection ring
  if (isSelected) {
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(x, y, 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  
  // Owner indicator (small crown for your towers)
  if (tower.ownerId === playerId) {
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(x + 20, y - 25);
    ctx.lineTo(x + 16, y - 18);
    ctx.lineTo(x + 18, y - 22);
    ctx.lineTo(x + 20, y - 18);
    ctx.lineTo(x + 22, y - 22);
    ctx.lineTo(x + 24, y - 18);
    ctx.lineTo(x + 20, y - 25);
    ctx.fill();
  }
}

function drawEnemy(enemy) {
  const x = enemy.x;
  const y = enemy.y;
  const size = enemy.size;
  
  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + size, size * 0.8, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw enemy based on type
  switch(enemy.type) {
    case 'grunt':
      // Goblin-like creature
      ctx.fillStyle = '#8B0000';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      // Face
      ctx.fillStyle = '#5a0000';
      ctx.beginPath();
      ctx.arc(x - size * 0.3, y - size * 0.2, size * 0.2, 0, Math.PI * 2);
      ctx.arc(x + size * 0.3, y - size * 0.2, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Angry eyes
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.arc(x - size * 0.3, y - size * 0.2, size * 0.12, 0, Math.PI * 2);
      ctx.arc(x + size * 0.3, y - size * 0.2, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
      // Teeth
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - size * 0.3, y + size * 0.2, size * 0.15, size * 0.2);
      ctx.fillRect(x + size * 0.15, y + size * 0.2, size * 0.15, size * 0.2);
      break;
      
    case 'runner':
      // Fast wolf-like creature
      ctx.fillStyle = '#FF6347';
      // Body (elongated)
      ctx.beginPath();
      ctx.ellipse(x, y, size * 1.3, size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(x + size * 0.8, y - size * 0.2, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      // Ears
      ctx.fillStyle = '#cc4030';
      ctx.beginPath();
      ctx.moveTo(x + size * 0.9, y - size * 0.6);
      ctx.lineTo(x + size * 1.1, y - size);
      ctx.lineTo(x + size * 1.3, y - size * 0.5);
      ctx.fill();
      // Eye
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + size * 0.95, y - size * 0.25, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x + size * 0.98, y - size * 0.25, size * 0.08, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'tank':
      // Heavy armored ogre
      ctx.fillStyle = '#4A4A4A';
      // Body
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      // Armor plates
      ctx.fillStyle = '#6a6a6a';
      ctx.beginPath();
      ctx.arc(x, y - size * 0.3, size * 0.6, Math.PI, 0);
      ctx.fill();
      // Helmet
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.arc(x, y - size * 0.5, size * 0.5, Math.PI, 0);
      ctx.fill();
      // Visor
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(x - size * 0.3, y - size * 0.4, size * 0.6, size * 0.15);
      // Spikes
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.moveTo(x - size * 0.6, y - size * 0.6);
      ctx.lineTo(x - size * 0.3, y - size);
      ctx.lineTo(x, y - size * 0.6);
      ctx.lineTo(x + size * 0.3, y - size);
      ctx.lineTo(x + size * 0.6, y - size * 0.6);
      ctx.fill();
      break;
      
    case 'healer':
      // Shaman with staff
      ctx.fillStyle = '#98FB98';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      // Hood
      ctx.fillStyle = '#228B22';
      ctx.beginPath();
      ctx.arc(x, y - size * 0.3, size * 0.7, Math.PI * 1.2, Math.PI * 1.8);
      ctx.lineTo(x, y - size);
      ctx.fill();
      // Staff
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + size * 0.8, y + size * 0.5);
      ctx.lineTo(x + size * 0.8, y - size);
      ctx.stroke();
      // Staff glow
      ctx.fillStyle = '#7fff00';
      ctx.beginPath();
      ctx.arc(x + size * 0.8, y - size, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Healing aura
      ctx.strokeStyle = 'rgba(152, 251, 152, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      break;
      
    case 'shield':
      // Knight with shield
      ctx.fillStyle = '#4169E1';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      // Shield
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.moveTo(x - size, y - size * 0.5);
      ctx.lineTo(x - size, y + size * 0.5);
      ctx.lineTo(x - size * 0.3, y + size * 0.8);
      ctx.lineTo(x - size * 0.3, y - size * 0.5);
      ctx.closePath();
      ctx.fill();
      // Shield emblem
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(x - size * 0.65, y, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Helmet
      ctx.fillStyle = '#2d4aa8';
      ctx.beginPath();
      ctx.arc(x, y - size * 0.3, size * 0.5, Math.PI, 0);
      ctx.fill();
      // Eye slit
      ctx.fillStyle = '#000';
      ctx.fillRect(x - size * 0.3, y - size * 0.3, size * 0.6, size * 0.1);
      break;
      
    case 'boss':
      // Giant demon boss
      ctx.fillStyle = '#8B008B';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      // Horns
      ctx.fillStyle = '#4a004a';
      ctx.beginPath();
      ctx.moveTo(x - size * 0.6, y - size * 0.5);
      ctx.lineTo(x - size * 0.9, y - size * 1.3);
      ctx.lineTo(x - size * 0.3, y - size * 0.7);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + size * 0.6, y - size * 0.5);
      ctx.lineTo(x + size * 0.9, y - size * 1.3);
      ctx.lineTo(x + size * 0.3, y - size * 0.7);
      ctx.fill();
      // Glowing eyes
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(x - size * 0.3, y - size * 0.2, size * 0.2, 0, Math.PI * 2);
      ctx.arc(x + size * 0.3, y - size * 0.2, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Evil glow
      ctx.shadowColor = '#ff00ff';
      ctx.shadowBlur = 20;
      ctx.fillStyle = 'rgba(139, 0, 139, 0.3)';
      ctx.beginPath();
      ctx.arc(x, y, size * 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Crown
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(x - size * 0.5, y - size * 0.6);
      ctx.lineTo(x - size * 0.4, y - size * 0.9);
      ctx.lineTo(x - size * 0.2, y - size * 0.7);
      ctx.lineTo(x, y - size * 0.95);
      ctx.lineTo(x + size * 0.2, y - size * 0.7);
      ctx.lineTo(x + size * 0.4, y - size * 0.9);
      ctx.lineTo(x + size * 0.5, y - size * 0.6);
      ctx.fill();
      break;
      
    case 'swarm':
      // Small bat
      ctx.fillStyle = '#FFD700';
      // Body
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.6, size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wings
      ctx.fillStyle = '#daa520';
      ctx.beginPath();
      ctx.moveTo(x - size * 0.3, y);
      ctx.quadraticCurveTo(x - size * 1.2, y - size * 0.8, x - size * 0.8, y + size * 0.3);
      ctx.lineTo(x - size * 0.3, y);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + size * 0.3, y);
      ctx.quadraticCurveTo(x + size * 1.2, y - size * 0.8, x + size * 0.8, y + size * 0.3);
      ctx.lineTo(x + size * 0.3, y);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(x - size * 0.15, y - size * 0.2, size * 0.12, 0, Math.PI * 2);
      ctx.arc(x + size * 0.15, y - size * 0.2, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'ghost':
      // Ghostly spirit
      ctx.fillStyle = 'rgba(230, 230, 250, 0.7)';
      // Wavy body
      ctx.beginPath();
      ctx.arc(x, y - size * 0.3, size * 0.8, Math.PI, 0);
      const time = Date.now() / 200;
      ctx.quadraticCurveTo(x + size, y + size * 0.5, x + size * 0.5, y + size + Math.sin(time) * 3);
      ctx.quadraticCurveTo(x, y + size * 0.7, x, y + size * 1.1 + Math.sin(time + 1) * 3);
      ctx.quadraticCurveTo(x, y + size * 0.7, x - size * 0.5, y + size + Math.sin(time + 2) * 3);
      ctx.quadraticCurveTo(x - size, y + size * 0.5, x - size * 0.8, y - size * 0.3);
      ctx.fill();
      // Ghostly glow
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // Eyes
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x - size * 0.25, y - size * 0.3, size * 0.15, size * 0.25, 0, 0, Math.PI * 2);
      ctx.ellipse(x + size * 0.25, y - size * 0.3, size * 0.15, size * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      // Mouth
      ctx.beginPath();
      ctx.ellipse(x, y + size * 0.1, size * 0.2, size * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'berserker':
      // Enraged warrior
      const enraged = enemy.health < enemy.maxHealth * 0.5;
      ctx.fillStyle = enraged ? '#ff0000' : '#DC143C';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      // Muscles/armor
      ctx.fillStyle = enraged ? '#cc0000' : '#aa1030';
      ctx.beginPath();
      ctx.arc(x - size * 0.4, y, size * 0.4, 0, Math.PI * 2);
      ctx.arc(x + size * 0.4, y, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
      // Angry face
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - size * 0.25, y - size * 0.2, size * 0.15, 0, Math.PI * 2);
      ctx.arc(x + size * 0.25, y - size * 0.2, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x - size * 0.25, y - size * 0.2, size * 0.08, 0, Math.PI * 2);
      ctx.arc(x + size * 0.25, y - size * 0.2, size * 0.08, 0, Math.PI * 2);
      ctx.fill();
      // Rage effect when enraged
      if (enraged) {
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.3, 0, Math.PI * 2);
        ctx.stroke();
        // Flames
        ctx.fillStyle = 'rgba(255, 100, 0, 0.6)';
        for (let i = 0; i < 5; i++) {
          const angle = (time + i * 1.2) % (Math.PI * 2);
          ctx.beginPath();
          ctx.arc(x + Math.cos(angle) * size * 1.1, y + Math.sin(angle) * size * 1.1 - 5, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Weapon
      ctx.fillStyle = '#666';
      ctx.fillRect(x + size * 0.6, y - size * 0.8, 4, size * 1.6);
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.moveTo(x + size * 0.5, y - size * 0.8);
      ctx.lineTo(x + size * 0.62, y - size * 1.2);
      ctx.lineTo(x + size * 0.8, y - size * 0.8);
      ctx.fill();
      break;
      
    default:
      // Fallback generic enemy
      ctx.fillStyle = enemy.color;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
  }
  
  // Status effects (apply on top of any enemy type)
  if (enemy.slowed) {
    ctx.strokeStyle = '#00ced1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, size + 3, 0, Math.PI * 2);
    ctx.stroke();
    // Ice crystals
    ctx.fillStyle = 'rgba(0, 206, 209, 0.6)';
    for (let i = 0; i < 4; i++) {
      const angle = (Date.now() / 500 + i * Math.PI / 2) % (Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * (size + 5), y + Math.sin(angle) * (size + 5));
      ctx.lineTo(x + Math.cos(angle + 0.2) * (size + 10), y + Math.sin(angle + 0.2) * (size + 10));
      ctx.lineTo(x + Math.cos(angle - 0.2) * (size + 10), y + Math.sin(angle - 0.2) * (size + 10));
      ctx.fill();
    }
  }
  
  if (enemy.stunned) {
    ctx.fillStyle = '#ffff00';
    for (let i = 0; i < 3; i++) {
      const angle = (Date.now() / 200 + i * 2.1) % (Math.PI * 2);
      const starX = x + Math.cos(angle) * (size + 8);
      const starY = y + Math.sin(angle) * (size + 8);
      // Star shape
      ctx.beginPath();
      for (let j = 0; j < 5; j++) {
        const a = (j * Math.PI * 2 / 5) - Math.PI / 2;
        const r = j % 2 === 0 ? 4 : 2;
        if (j === 0) ctx.moveTo(starX + Math.cos(a) * r, starY + Math.sin(a) * r);
        else ctx.lineTo(starX + Math.cos(a) * r, starY + Math.sin(a) * r);
      }
      ctx.fill();
    }
  }
  
  if (enemy.burning) {
    // Fire effect
    ctx.fillStyle = 'rgba(255, 100, 0, 0.7)';
    for (let i = 0; i < 4; i++) {
      const offset = Math.sin(Date.now() / 100 + i) * 3;
      ctx.beginPath();
      ctx.moveTo(x - size * 0.3 + i * size * 0.2, y - size * 0.5);
      ctx.quadraticCurveTo(x - size * 0.2 + i * size * 0.2, y - size - offset, x + i * size * 0.2, y - size * 0.5);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 200, 0, 0.5)';
    ctx.beginPath();
    ctx.arc(x, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Health bar
  const healthPercent = enemy.health / enemy.maxHealth;
  const barWidth = size * 2;
  const barHeight = 4;
  
  ctx.fillStyle = '#333333';
  ctx.fillRect(x - barWidth/2, y - size - 12, barWidth, barHeight);
  
  ctx.fillStyle = healthPercent > 0.5 ? '#22cc22' : healthPercent > 0.25 ? '#cccc22' : '#cc2222';
  ctx.fillRect(x - barWidth/2, y - size - 12, barWidth * healthPercent, barHeight);
  
  // Border
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - barWidth/2, y - size - 12, barWidth, barHeight);
}

function addChatMessage(sender, message) {
  const container = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  msgDiv.innerHTML = `<span class="sender">${sender}:</span> ${message}`;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
  
  while (container.children.length > 50) {
    container.removeChild(container.firstChild);
  }
}

// Socket event handlers - prefixed with cd: for Castle Defenders
socket.on('cd:loginSuccess', (data) => {
  console.log('Login successful:', data);
  
  playerProfile = data.profile;
  towerTypes = data.towerTypes;
  perks = data.perks;
  unlockedTowers = data.unlockedTowers;
  xpForNextLevel = data.xpForNextLevel;
  
  // Reset login button
  const playBtn = document.getElementById('play-btn');
  if (playBtn) {
    playBtn.innerHTML = '<span class="btn-icon">⚔️</span> Enter the Realm';
    playBtn.disabled = false;
  }
  
  updateProfileUI();
  showScreen('lobby');
});

socket.on('cd:gameJoined', (data) => {
  playerId = data.playerId;
  gameState = data.state;
  
  // Initialize player's gold from the game state
  const myPlayerData = gameState.players?.find(p => p.id === playerId);
  myGold = myPlayerData?.gold || 200;
  
  // Hide open games panel if visible
  document.getElementById('open-games-panel').classList.add('hidden');
  
  // Setup canvas
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  
  // Reset background so it regenerates
  backgroundGenerated = false;
  backgroundCanvas = null;
  
  // Reset tracked gold and selected states
  lastPlayerGold = myGold;
  selectedPlot = null;
  selectedTower = null;
  
  showScreen('game');
  
  // Force render tower buttons and UI
  renderTowerButtons();
  updateTowerPanel();
  updateGameUI();
  render();
  
  // Show appropriate welcome message
  const towerCount = gameState.towers?.length || 0;
  const playerCount = gameState.players?.length || 1;
  
  if (data.isNewGame) {
    addChatMessage('System', '🏰 New game created! Share the game ID with friends to play together.');
    addChatMessage('System', `📋 Game ID: ${data.gameId}`);
  } else {
    addChatMessage('System', `🏰 Joined game with ${playerCount} player(s)!`);
    if (towerCount > 0) {
      addChatMessage('System', `🗼 ${towerCount} tower(s) already placed.`);
    }
  }
  
  addChatMessage('System', `💰 Starting gold: ${myGold}g`);
  addChatMessage('System', '💡 Click a tower from the right panel, then click an empty plot to build!');
  addChatMessage('System', '⚔️ Click "Start Wave" when ready to begin!');
});

socket.on('cd:playerJoined', (data) => {
  addChatMessage('System', `${data.playerName} (Lv.${data.playerLevel}) joined the battle!`);
});

socket.on('cd:playerLeft', (data) => {
  addChatMessage('System', 'A defender has left the battle.');
});

socket.on('cd:gameStarted', () => {
  addChatMessage('System', 'The battle begins! Defend the castle!');
});

socket.on('cd:waveStarted', (data) => {
  addChatMessage('System', `Wave ${data.wave} incoming!`);
});

socket.on('cd:gameState', (state) => {
  gameState = state;
  
  // Sync myGold from server state
  const myPlayerData = gameState.players?.find(p => p.id === playerId);
  if (myPlayerData) {
    myGold = myPlayerData.gold;
  }
  
  updateGameUI();
});

socket.on('cd:towerPlaced', (data) => {
  // Add the new tower to the game state
  if (gameState && data.tower) {
    // Add tower to towers array
    if (!gameState.towers) {
      gameState.towers = [];
    }
    gameState.towers.push(data.tower);
    
    // Update the plot to mark it as occupied
    const plot = gameState.plots?.find(p => p.id === data.tower.plotId);
    if (plot) {
      plot.tower = data.tower.id;
      plot.owner = data.playerId;
    }
    
    // Update player's gold if this was our tower
    if (data.playerId === playerId && data.playerGold !== undefined) {
      myGold = data.playerGold;
      const playerData = gameState.players?.find(p => p.id === playerId);
      if (playerData) {
        playerData.gold = data.playerGold;
      }
    }
    
    // Deselect tower after placing (only for the player who placed it)
    if (data.playerId === playerId) {
      selectedTower = null;
      selectedPlot = null;
    }
    
    // Update UI
    updateTowerPanel();
    renderTowerButtons();
    updateGameUI();
    
    const towerType = towerTypes[data.tower.type];
    const towerName = towerType?.name || data.tower.type;
    
    if (data.playerId === playerId) {
      addChatMessage('System', `🗼 ${towerName} placed! (-${towerType?.cost || 0}g)`);
    } else {
      // Another player placed a tower
      const ownerName = data.tower.ownerName || 'A player';
      addChatMessage('System', `🗼 ${ownerName} placed a ${towerName}!`);
    }
  }
});

socket.on('cd:towerSold', (data) => {
  // Remove tower from game state
  if (gameState) {
    // Find the plot and get tower id
    const plot = gameState.plots?.find(p => p.id === data.plotId);
    if (plot && plot.tower) {
      // Remove tower from towers array
      gameState.towers = gameState.towers?.filter(t => t.id !== plot.tower) || [];
      // Clear the plot
      plot.tower = null;
      plot.owner = null;
    }
    
    // Update player's gold if this was our sale
    if (data.playerId === playerId && data.playerGold !== undefined) {
      myGold = data.playerGold;
      const playerData = gameState.players?.find(p => p.id === playerId);
      if (playerData) {
        playerData.gold = data.playerGold;
      }
    }
  }
  
  selectedPlot = null;
  updateTowerPanel();
  renderTowerButtons();
  updateGameUI();
  
  if (data.playerId === playerId) {
    addChatMessage('System', `💰 Tower sold for ${data.refund} gold!`);
  }
});

socket.on('cd:towerUpgraded', (data) => {
  // Update the tower in gameState
  if (gameState && gameState.towers) {
    const idx = gameState.towers.findIndex(t => t.id === data.tower.id);
    if (idx >= 0) {
      gameState.towers[idx] = data.tower;
    }
  }
  
  // Update player's gold if this was our upgrade
  if (data.playerId === playerId && data.playerGold !== undefined) {
    myGold = data.playerGold;
    const playerData = gameState?.players?.find(p => p.id === playerId);
    if (playerData) {
      playerData.gold = data.playerGold;
    }
  }
  
  const upgradeNames = { damage: 'Damage', range: 'Range', speed: 'Speed' };
  
  if (data.playerId === playerId) {
    addChatMessage('System', `🔧 Tower ${upgradeNames[data.upgradeType]} upgraded to level ${data.newLevel}! (-${data.cost}g)`);
  }
  
  // Refresh upgrade panel if this tower is selected
  if (selectedPlot && selectedPlot.tower === data.tower.id) {
    showUpgradePanel(data.tower);
  }
  
  updateTowerPanel();
  renderTowerButtons();
  updateGameUI();
});

socket.on('cd:playerList', (data) => {
  // Update the player list in the UI
  const playerListEl = document.getElementById('player-list');
  if (playerListEl && data.players) {
    playerListEl.innerHTML = data.players.map(p => `
      <div class="player-item ${p.playerId === playerId ? 'self' : ''}">
        <span class="player-name">${p.playerName}</span>
        <span class="player-level">Lv.${p.playerLevel}</span>
        <span class="player-gold">${p.gold}g</span>
      </div>
    `).join('');
  }
  
  addChatMessage('System', `👥 ${data.players.length} player(s) in game`);
});

socket.on('cd:playerJoined', (data) => {
  addChatMessage('System', `👋 ${data.playerName} (Lv.${data.playerLevel}) joined the game!`);
});

socket.on('cd:openGames', (data) => {
  const container = document.getElementById('open-games-list');
  const games = data.games || [];
  
  if (games.length === 0) {
    container.innerHTML = '<p class="no-games">No open games found. Create a new game!</p>';
    return;
  }
  
  container.innerHTML = games.map(game => `
    <div class="open-game-card" data-game-id="${game.id}">
      <div class="game-info">
        <span class="game-wave">Wave ${game.wave}</span>
        <span class="game-players">${game.playerCount}/${game.maxPlayers} Players</span>
      </div>
      <div class="game-player-names">${game.players.join(', ')}</div>
      <button class="btn-join-game" onclick="joinSpecificGame('${game.id}')">Join</button>
    </div>
  `).join('');
});

function joinSpecificGame(gameId) {
  document.getElementById('open-games-panel').classList.add('hidden');
  socket.emit('cd:joinGame', { gameId: gameId });
}

socket.on('cd:actionFailed', (data) => {
  addChatMessage('System', `⚠️ ${data.error}`);
  console.log('Action failed:', data.error);
});

socket.on('cd:error', (data) => {
  console.error('CD Error:', data.message);
  // Show error as alert if not in game yet, otherwise use chat
  if (!gameState) {
    alert('Error: ' + data.message);
  } else {
    addChatMessage('System', `❌ ${data.message}`);
  }
});

socket.on('cd:perkBought', (data) => {
  playerProfile.perks[data.perkId] = data.newLevel;
  playerProfile.perkPoints = data.remainingPoints;
  updateProfileUI();
  renderPerksModal();
  addChatMessage('System', `Perk upgraded!`);
});

socket.on('cd:chat', (data) => {
  addChatMessage(data.playerName, data.message);
});

socket.on('cd:gameEnded', (data) => {
  document.getElementById('final-wave').textContent = data.wave;
  
  const resultsList = document.getElementById('results-list');
  resultsList.innerHTML = '';
  
  for (const result of data.results) {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <div>
        <span class="result-name">${result.playerName}</span>
        ${result.levelsGained > 0 ? `<span class="level-up-badge">LEVEL UP! → ${result.newLevel}</span>` : ''}
      </div>
      <div class="result-stats">
        <span class="result-xp">+${result.xpEarned} XP</span>
        <span>⚔️ ${result.enemiesKilled} kills</span>
        <span>🗼 ${result.towersBuilt} towers</span>
      </div>
    `;
    resultsList.appendChild(item);
    
    if (result.playerId === playerId) {
      playerProfile.level = result.newLevel;
      playerProfile.perkPoints = result.perkPoints;
    }
  }
  
  openModal('gameover-modal');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  if (gameState) {
    addChatMessage('System', '⚠️ Disconnected from server. Refresh to reconnect.');
  }
});

