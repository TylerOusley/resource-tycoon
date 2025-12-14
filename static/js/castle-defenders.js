// Castle Defenders Online - Game Client

const socket = io();

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
  
  // Lobby
  document.getElementById('join-game-btn').addEventListener('click', () => {
    socket.emit('cd:joinGame');
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
  
  localStorage.setItem('castleDefendersPlayerName', name);
  
  socket.emit('cd:login', {
    playerId: getPlayerId(),
    playerName: name
  });
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
  
  if (selectedPlot && selectedPlot.tower && selectedPlot.owner === playerId) {
    sellBtn.classList.remove('hidden');
    cancelBtn.classList.remove('hidden');
  } else if (selectedTower) {
    sellBtn.classList.add('hidden');
    cancelBtn.classList.remove('hidden');
  } else {
    sellBtn.classList.add('hidden');
    cancelBtn.classList.add('hidden');
  }
  
  // Update tower buttons to show selected state
  document.querySelectorAll('.tower-btn').forEach(btn => {
    btn.classList.remove('selected');
    if (btn.dataset.type === selectedTower) {
      btn.classList.add('selected');
    }
  });
}

function renderTowerButtons() {
  const container = document.getElementById('tower-buttons');
  container.innerHTML = '';
  
  const player = gameState?.players?.find(p => p.id === playerId);
  const playerGold = player?.gold || 0;
  
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

function updateGameUI() {
  if (!gameState) return;
  
  // Castle health
  const healthPercent = (gameState.castleHealth / gameState.maxCastleHealth) * 100;
  document.getElementById('castle-health-bar').style.width = healthPercent + '%';
  document.getElementById('castle-health-text').textContent = 
    `${Math.floor(gameState.castleHealth)} / ${gameState.maxCastleHealth}`;
  
  // Wave
  document.getElementById('wave-number').textContent = gameState.wave;
  
  // Player resources
  const player = gameState.players.find(p => p.id === playerId);
  if (player) {
    document.getElementById('player-gold').textContent = Math.floor(player.gold);
    document.getElementById('player-score').textContent = player.score;
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
  
  // Render tower buttons with updated gold
  renderTowerButtons();
}

function render() {
  if (!gameState || !ctx) return;
  
  // Clear canvas
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw grass background
  ctx.fillStyle = '#1e3d1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Add some texture
  ctx.fillStyle = '#162e13';
  for (let i = 0; i < 100; i++) {
    const x = (i * 73) % canvas.width;
    const y = (i * 47) % canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 3 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Draw path
  if (gameState.path && gameState.path.length > 1) {
    ctx.strokeStyle = '#4a3728';
    ctx.lineWidth = 40;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(gameState.path[0].x, gameState.path[0].y);
    for (let i = 1; i < gameState.path.length; i++) {
      ctx.lineTo(gameState.path[i].x, gameState.path[i].y);
    }
    ctx.stroke();
    
    // Path border
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 44;
    ctx.beginPath();
    ctx.moveTo(gameState.path[0].x, gameState.path[0].y);
    for (let i = 1; i < gameState.path.length; i++) {
      ctx.lineTo(gameState.path[i].x, gameState.path[i].y);
    }
    ctx.stroke();
    
    // Inner path
    ctx.strokeStyle = '#5a4738';
    ctx.lineWidth = 36;
    ctx.beginPath();
    ctx.moveTo(gameState.path[0].x, gameState.path[0].y);
    for (let i = 1; i < gameState.path.length; i++) {
      ctx.lineTo(gameState.path[i].x, gameState.path[i].y);
    }
    ctx.stroke();
  }
  
  // Draw castle
  const castleX = canvas.width - 50;
  const castleY = 300;
  
  // Castle shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(castleX + 5, castleY + 45, 50, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Castle body
  ctx.fillStyle = '#5a5a6a';
  ctx.fillRect(castleX - 40, castleY - 30, 80, 70);
  
  // Castle towers
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(castleX - 50, castleY - 50, 25, 90);
  ctx.fillRect(castleX + 25, castleY - 50, 25, 90);
  
  // Tower tops
  ctx.fillStyle = '#8b2222';
  ctx.beginPath();
  ctx.moveTo(castleX - 50, castleY - 50);
  ctx.lineTo(castleX - 37, castleY - 70);
  ctx.lineTo(castleX - 25, castleY - 50);
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(castleX + 25, castleY - 50);
  ctx.lineTo(castleX + 37, castleY - 70);
  ctx.lineTo(castleX + 50, castleY - 50);
  ctx.fill();
  
  // Castle gate
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(castleX - 15, castleY + 5, 30, 35);
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(castleX - 12, castleY + 8, 24, 29);
  
  // Draw plots
  for (const plot of gameState.plots) {
    const isSelected = selectedPlot && selectedPlot.id === plot.id;
    
    if (plot.tower) {
      // Draw tower
      const tower = gameState.towers.find(t => t.id === plot.tower);
      if (tower) {
        drawTower(tower, plot, isSelected);
      }
    } else {
      // Draw empty plot
      ctx.strokeStyle = isSelected ? '#d4a84b' : '#3a5a3a';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(plot.x, plot.y, 25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      if (isSelected || (selectedTower && !plot.tower)) {
        ctx.fillStyle = 'rgba(212, 168, 75, 0.2)';
        ctx.beginPath();
        ctx.arc(plot.x, plot.y, 25, 0, Math.PI * 2);
        ctx.fill();
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
  
  // Draw projectiles
  for (const proj of gameState.projectiles) {
    ctx.fillStyle = proj.color || '#ffff00';
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.type === 'mortar' ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Trail effect
    ctx.fillStyle = proj.color ? proj.color + '40' : 'rgba(255, 255, 0, 0.25)';
    ctx.beginPath();
    ctx.arc(proj.x - 3, proj.y - 3, 3, 0, Math.PI * 2);
    ctx.fill();
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
  const color = towerType?.color || '#888888';
  
  // Tower base
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.arc(plot.x, plot.y + 5, 22, 0, Math.PI * 2);
  ctx.fill();
  
  // Tower body
  ctx.fillStyle = color;
  
  switch(tower.type) {
    case 'cannon':
      ctx.fillRect(plot.x - 18, plot.y - 15, 36, 30);
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(plot.x - 5, plot.y - 25, 10, 20);
      break;
      
    case 'archer':
      ctx.fillRect(plot.x - 12, plot.y - 25, 24, 40);
      ctx.fillStyle = '#1a4a1a';
      ctx.beginPath();
      ctx.moveTo(plot.x - 18, plot.y - 25);
      ctx.lineTo(plot.x, plot.y - 40);
      ctx.lineTo(plot.x + 18, plot.y - 25);
      ctx.fill();
      break;
      
    case 'mortar':
      ctx.beginPath();
      ctx.arc(plot.x, plot.y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(plot.x - 8, plot.y - 30, 16, 25);
      break;
      
    case 'wizard':
      ctx.fillRect(plot.x - 10, plot.y - 20, 20, 35);
      ctx.fillStyle = '#ff00ff';
      ctx.beginPath();
      ctx.moveTo(plot.x, plot.y - 35);
      ctx.lineTo(plot.x - 8, plot.y - 20);
      ctx.lineTo(plot.x + 8, plot.y - 20);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
      ctx.beginPath();
      ctx.arc(plot.x, plot.y - 25, 15, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'frost':
      ctx.beginPath();
      ctx.moveTo(plot.x, plot.y - 30);
      ctx.lineTo(plot.x - 15, plot.y + 10);
      ctx.lineTo(plot.x + 15, plot.y + 10);
      ctx.fill();
      ctx.fillStyle = 'rgba(0, 206, 209, 0.3)';
      ctx.beginPath();
      ctx.arc(plot.x, plot.y - 10, 20, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'barracks':
      ctx.fillRect(plot.x - 20, plot.y - 15, 40, 30);
      ctx.fillStyle = '#8b4513';
      ctx.beginPath();
      ctx.moveTo(plot.x - 25, plot.y - 15);
      ctx.lineTo(plot.x, plot.y - 30);
      ctx.lineTo(plot.x + 25, plot.y - 15);
      ctx.fill();
      ctx.fillStyle = '#cc0000';
      ctx.fillRect(plot.x + 10, plot.y - 35, 12, 8);
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(plot.x + 8, plot.y - 35, 2, 20);
      break;
      
    case 'goldmine':
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.arc(plot.x, plot.y, 20, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(plot.x - 8, plot.y + 5, 6, 0, Math.PI * 2);
      ctx.arc(plot.x + 5, plot.y + 8, 5, 0, Math.PI * 2);
      ctx.arc(plot.x, plot.y + 3, 7, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'tesla':
      ctx.fillStyle = '#4a4a5a';
      ctx.fillRect(plot.x - 8, plot.y - 30, 16, 45);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(plot.x, plot.y - 20 + i * 10, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(plot.x, plot.y - 25, 8, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'dragon':
      ctx.beginPath();
      ctx.arc(plot.x, plot.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.moveTo(plot.x - 10, plot.y - 15);
      ctx.quadraticCurveTo(plot.x, plot.y - 35, plot.x + 10, plot.y - 15);
      ctx.fill();
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.moveTo(plot.x - 5, plot.y - 15);
      ctx.quadraticCurveTo(plot.x, plot.y - 28, plot.x + 5, plot.y - 15);
      ctx.fill();
      break;
      
    case 'sniper':
      ctx.fillRect(plot.x - 6, plot.y - 35, 12, 50);
      ctx.fillStyle = '#1a2a2a';
      ctx.fillRect(plot.x - 12, plot.y - 40, 24, 8);
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(plot.x, plot.y - 36, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'necromancer':
      ctx.fillRect(plot.x - 10, plot.y - 25, 20, 40);
      ctx.fillStyle = '#e0e0e0';
      ctx.beginPath();
      ctx.arc(plot.x, plot.y - 30, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4b0082';
      ctx.beginPath();
      ctx.arc(plot.x - 4, plot.y - 32, 3, 0, Math.PI * 2);
      ctx.arc(plot.x + 4, plot.y - 32, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'shrine':
      ctx.fillRect(plot.x - 18, plot.y - 5, 36, 20);
      ctx.fillRect(plot.x - 6, plot.y - 25, 12, 25);
      ctx.fillStyle = '#ffe4b5';
      ctx.beginPath();
      ctx.arc(plot.x, plot.y - 30, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 228, 181, 0.4)';
      ctx.beginPath();
      ctx.arc(plot.x, plot.y - 30, 15, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    default:
      ctx.beginPath();
      ctx.arc(plot.x, plot.y, 20, 0, Math.PI * 2);
      ctx.fill();
  }
  
  // Selection indicator
  if (isSelected) {
    ctx.strokeStyle = '#d4a84b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(plot.x, plot.y, 28, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Owner indicator
  if (tower.ownerId === playerId) {
    ctx.fillStyle = '#d4a84b';
    ctx.beginPath();
    ctx.arc(plot.x + 18, plot.y - 18, 5, 0, Math.PI * 2);
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
  
  // Body
  ctx.fillStyle = enemy.color;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  
  // Effects
  if (enemy.slowed) {
    ctx.strokeStyle = '#00ced1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, size + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  if (enemy.stunned) {
    ctx.fillStyle = '#ffff00';
    for (let i = 0; i < 3; i++) {
      const angle = (Date.now() / 200 + i * 2.1) % (Math.PI * 2);
      const starX = x + Math.cos(angle) * (size + 8);
      const starY = y + Math.sin(angle) * (size + 8);
      ctx.beginPath();
      ctx.arc(starX, starY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  if (enemy.burning) {
    ctx.fillStyle = 'rgba(255, 100, 0, 0.5)';
    ctx.beginPath();
    ctx.arc(x, y - size/2, size * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Health bar
  const healthPercent = enemy.health / enemy.maxHealth;
  const barWidth = size * 2;
  const barHeight = 4;
  
  ctx.fillStyle = '#333333';
  ctx.fillRect(x - barWidth/2, y - size - 10, barWidth, barHeight);
  
  ctx.fillStyle = healthPercent > 0.5 ? '#22cc22' : healthPercent > 0.25 ? '#cccc22' : '#cc2222';
  ctx.fillRect(x - barWidth/2, y - size - 10, barWidth * healthPercent, barHeight);
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
  playerProfile = data.profile;
  towerTypes = data.towerTypes;
  perks = data.perks;
  unlockedTowers = data.unlockedTowers;
  xpForNextLevel = data.xpForNextLevel;
  
  updateProfileUI();
  showScreen('lobby');
});

socket.on('cd:gameJoined', (data) => {
  playerId = data.playerId;
  gameState = data.state;
  
  // Setup canvas
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  
  showScreen('game');
  renderTowerButtons();
  updateGameUI();
  render();
  
  addChatMessage('System', 'Welcome to the battle!');
  addChatMessage('System', '💡 Click a tower button, then click an empty plot to build!');
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
  updateGameUI();
});

socket.on('cd:towerPlaced', (data) => {
  addChatMessage('System', `Tower placed!`);
});

socket.on('cd:towerSold', (data) => {
  addChatMessage('System', `Tower sold for ${data.refund} gold.`);
  selectedPlot = null;
  updateTowerPanel();
});

socket.on('cd:actionFailed', (data) => {
  addChatMessage('System', `⚠️ ${data.error}`);
  console.log('Action failed:', data.error);
});

socket.on('cd:error', (data) => {
  addChatMessage('System', `❌ ${data.message}`);
  console.log('Error:', data.message);
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

socket.on('cd:error', (data) => {
  alert(data.message);
});

socket.on('disconnect', () => {
  addChatMessage('System', '⚠️ Disconnected from server. Refresh to reconnect.');
});

