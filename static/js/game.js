/**
 * Resource Tycoon - Game Client
 * Handles all game logic, UI updates, and socket communication
 */

class ResourceTycoon {
    constructor() {
        this.socket = null;
        this.player = null;
        this.resources = {};
        this.buildings = {};
        this.recipes = {};
        this.market = {};
        this.auctions = [];
        this.players = [];
        
        // UI state
        this.activeTab = 'buildings';
        this.buildingFilter = 'all';
        this.gatherCooldowns = {};
        this.craftEndTime = null;
        this.buyAmount = 1; // 1, 5, 10, or 'max'
        
        // Auth state
        this.authMode = 'login'; // 'login' or 'register'
        
        // Trade state
        this.tradeOffer = { resources: {}, money: 0 };
        this.tradeRequest = { resources: {}, money: 0 };
        this.tradePartner = null;
        this.pendingTrade = null;
        
        // Event state
        this.eventTimerId = null;
        this.eventEndsAt = null;
        
        // Tutorial state
        this.tutorialStep = 0;
        this.totalTutorialSteps = 7;
        
        // Settings state
        this.settings = {
            masterVolume: 50,
            muted: false,
            sfxEnabled: true,
            notificationSounds: true,
            animations: true,
            compactMode: false,
            showRates: true,
            toastNotifications: true,
            tradeNotifications: true,
            eventNotifications: true
        };
        
        // Audio context for sounds
        this.audioContext = null;
        
        this.init();
    }
    
    init() {
        // Initialize socket connection
        this.socket = io();
        this.setupSocketListeners();
        this.setupUIListeners();
        this.setupSettingsListeners();
        this.loadSettings();
        
        // Start game loops
        setInterval(() => this.updateCooldowns(), 100);
        setInterval(() => this.updateCraftProgress(), 100);
        setInterval(() => this.updateAuctionTimers(), 1000);
    }
    
    // ==========================================
    // Socket Event Listeners
    // ==========================================
    
    setupSocketListeners() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showToast('Connection lost. Reconnecting...', 'error');
        });
        
        // Auth events
        this.socket.on('auth:error', (data) => {
            this.showAuthError(data.message);
        });
        
        this.socket.on('auth:check', (data) => {
            // Could be used for username availability check
        });
        
        // Player events
        this.socket.on('player:init', (data) => {
            this.player = data.player;
            this.resources = data.resources;
            this.buildings = data.buildings;
            this.recipes = data.recipes;
            this.market = data.market;
            
            this.showGameScreen();
            this.updateAllUI();
            this.updateLeaderboard(data.leaderboard);
            this.updateChallenges(data.challenges);
            
            // Load chat history
            if (data.chat_history) {
                this.loadChatHistory(data.chat_history);
            }
            
            if (data.event) {
                this.showEvent(data.event);
            }
            
            // Show tutorial for new players
            if (!this.player.tutorial_completed) {
                setTimeout(() => this.openModal('modal-tutorial'), 500);
            }
        });
        
        // Chat events
        this.socket.on('chat:message', (data) => {
            this.addChatMessage(data);
        });
        
        this.socket.on('chat:history', (data) => {
            this.loadChatHistory(data);
        });
        
        this.socket.on('player:joined', (data) => {
            this.showToast(`${data.username} joined the game!`, 'info');
            document.getElementById('online-count').textContent = data.playerCount;
        });
        
        this.socket.on('player:left', (data) => {
            document.getElementById('online-count').textContent = data.playerCount;
        });
        
        this.socket.on('player:xp', (data) => {
            this.player.xp = data.xp;
            this.player.level = data.level;
            this.updatePlayerUI();
            
            if (data.leveled_up) {
                this.playSound('levelup');
                this.showToast(`Level Up! You are now level ${data.level}!`, 'success');
            }
        });
        
        this.socket.on('player:money', (data) => {
            this.player.money = data.money;
            this.updateMoneyUI();
        });
        
        // Resource events
        this.socket.on('resource:updated', (data) => {
            this.player.resources = data.resources;
            this.updateResourcesUI();
            this.updateCraftingUI();  // Update crafting buttons when resources change
        });
        
        // Building events
        this.socket.on('building:purchased', (data) => {
            this.player.buildings = data.buildings;
            this.player.resources = data.resources;
            this.player.money = data.money;
            this.updateAllUI();
            this.showToast('Building purchased!', 'success');
        });
        
        this.socket.on('building:upgraded', (data) => {
            this.player.buildings = data.buildings;
            this.player.money = data.money;
            this.updateAllUI();
            this.showToast('Building upgraded!', 'success');
        });
        
        // Market events
        this.socket.on('market:prices', (data) => {
            this.market = data;
            this.updateMarketUI();
        });
        
        this.socket.on('market:sold', (data) => {
            this.player.resources = data.resources;
            this.player.money = data.money;
            this.updateAllUI();
            this.showToast(`Sold for $${data.earned.toFixed(2)}!`, 'success');
        });
        
        this.socket.on('market:bought', (data) => {
            this.player.resources = data.resources;
            this.player.money = data.money;
            this.updateAllUI();
            this.updateCraftingUI();  // Update crafting after buying resources
            this.showToast(`Purchased for $${data.spent.toFixed(2)}!`, 'success');
        });
        
        // Crafting events
        this.socket.on('craft:started', (data) => {
            this.player.resources = data.resources;
            this.player.active_craft = {
                recipe_id: data.recipeId,
                start_time: Date.now() / 1000,
                duration: data.duration
            };
            this.craftEndTime = Date.now() + (data.duration * 1000);
            this.playSound('click');
            this.updateResourcesUI();
            this.updateCraftUI(data.recipeId);
            this.updateCraftingUI();
        });
        
        // Auction events
        this.socket.on('auction:all', (data) => {
            this.auctions = data;
            this.updateAuctionsUI();
        });
        
        this.socket.on('auction:new', (data) => {
            this.auctions.push(data);
            this.updateAuctionsUI();
            this.showToast('New auction created!', 'info');
        });
        
        this.socket.on('auction:update', (data) => {
            const idx = this.auctions.findIndex(a => a.id === data.id);
            if (idx !== -1) {
                this.auctions[idx] = data;
            }
            this.updateAuctionsUI();
        });
        
        this.socket.on('auction:completed', (data) => {
            this.auctions = this.auctions.filter(a => a.id !== data.id);
            this.updateAuctionsUI();
        });
        
        this.socket.on('auction:won', (data) => {
            this.player.resources = data.resources;
            this.updateResourcesUI();
            this.showToast(`You won the auction for ${data.auction.amount} ${this.resources[data.auction.resource_id]?.name}!`, 'success');
        });
        
        this.socket.on('auction:outbid', (data) => {
            this.player.money += data.refunded;
            this.updateMoneyUI();
            this.showToast(`You were outbid! $${data.refunded} refunded.`, 'warning');
        });
        
        // Trade events
        this.socket.on('players:all', (data) => {
            this.players = data;
            this.updatePlayersUI();
        });
        
        this.socket.on('trade:sent', () => {
            this.showToast('Trade offer sent!', 'info');
            this.closeModal('modal-trade');
        });
        
        this.socket.on('trade:incoming', (data) => {
            this.pendingTrade = data;
            this.showIncomingTrade(data);
        });
        
        this.socket.on('trade:completed', (data) => {
            this.player.resources = data.resources;
            this.player.money = data.money;
            this.updateAllUI();
            this.showToast('Trade completed!', 'success');
            this.closeModal('modal-incoming-trade');
        });
        
        this.socket.on('trade:declined', () => {
            this.showToast('Trade offer was declined.', 'warning');
        });
        
        // Tick updates
        this.socket.on('tick:update', (data) => {
            if (data.resources) this.player.resources = data.resources;
            if (data.money !== undefined) this.player.money = data.money;
            if (data.pollution !== undefined) this.player.pollution = data.pollution;
            if (data.eco_points !== undefined) this.player.eco_points = data.eco_points;
            if (data.production_rates) this.player.production_rates = data.production_rates;
            if (data.income_rate !== undefined) this.player.income_rate = data.income_rate;
            
            // Update XP and level in real-time
            if (data.xp !== undefined) this.player.xp = data.xp;
            if (data.level !== undefined) {
                const oldLevel = this.player.level;
                this.player.level = data.level;
                if (data.level > oldLevel) {
                    this.playSound('levelup');
                    this.showToast(`Level Up! You are now level ${data.level}!`, 'success');
                }
            }
            if (data.xp_progress) this.player.xp_progress = data.xp_progress;
            if (data.time_played !== undefined) this.player.time_played = data.time_played;
            if (data.time_played_formatted) this.player.time_played_formatted = data.time_played_formatted;
            
            if (data.production && data.production.income > 0) {
                // Only show notification occasionally to avoid spam
                if (Math.random() < 0.1) {
                    this.addNotification(`+$${data.production.income.toFixed(2)} from businesses`, 'success');
                }
            }
            
            if (data.craft_completed) {
                this.craftEndTime = null;
                this.player.active_craft = null;
                this.playSound('success');
                this.showToast('Crafting complete!', 'success');
                this.updateCraftUI();
                this.updateCraftingUI();
            }
            
            this.updateResourcesUI();
            this.updateMoneyUI();
            this.updatePollutionUI();
            this.updatePlayerUI();
            this.updateProductionStats();
            
            // Update crafting UI when resources change (throttled to avoid lag)
            if (!this._lastCraftingUpdate || Date.now() - this._lastCraftingUpdate > 2000) {
                this._lastCraftingUpdate = Date.now();
                this.updateCraftingUI();
            }
        });
        
        // Leaderboard
        this.socket.on('leaderboard:update', (data) => {
            this.updateLeaderboard(data);
        });
        
        // Challenges
        this.socket.on('challenges:current', (data) => {
            this.updateChallenges(data);
        });
        
        this.socket.on('challenge:claimed', (data) => {
            this.player.money = data.money;
            this.player.xp = data.xp;
            this.player.level = data.level;
            this.updateAllUI();
            this.showToast(`Reward claimed! +$${data.rewards.money} +${data.rewards.xp}XP`, 'success');
            this.socket.emit('challenges:get');
        });
        
        // Events
        this.socket.on('event:triggered', (data) => {
            this.showEvent(data);
            this.showToast(`${data.icon} ${data.name}: ${data.description}`, 'warning');
        });
        
        // Errors
        this.socket.on('error', (data) => {
            this.showToast(data.message, 'error');
        });
    }
    
    // ==========================================
    // UI Event Listeners
    // ==========================================
    
    setupUIListeners() {
        // Auth tabs
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.authMode = tab.dataset.mode;
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const confirmGroup = document.getElementById('confirm-group');
                const authBtnText = document.getElementById('auth-btn-text');
                const authHint = document.getElementById('auth-hint');
                
                if (this.authMode === 'register') {
                    confirmGroup.style.display = 'block';
                    authBtnText.textContent = 'CREATE ACCOUNT';
                    authHint.textContent = 'Create an account to save your progress!';
                } else {
                    confirmGroup.style.display = 'none';
                    authBtnText.textContent = 'LOGIN';
                    authHint.textContent = 'Your progress will be saved!';
                }
                
                this.hideAuthError();
            });
        });
        
        // Login/Register
        document.getElementById('play-btn').addEventListener('click', () => this.joinGame());
        document.getElementById('username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('password').focus();
        });
        document.getElementById('password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinGame();
        });
        document.getElementById('password-confirm').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinGame();
        });
        
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });
        
        // Building filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.buildingFilter = btn.dataset.tier;
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateBuildingsUI();
            });
        });
        
        // Top bar buttons
        document.getElementById('btn-leaderboard').addEventListener('click', () => {
            this.openModal('modal-leaderboard');
        });
        
        document.getElementById('btn-challenges').addEventListener('click', () => {
            this.socket.emit('challenges:get');
            this.openModal('modal-challenges');
        });
        
        document.getElementById('btn-settings').addEventListener('click', () => {
            this.openSettings();
        });
        
        // Help button
        document.getElementById('btn-help').addEventListener('click', () => {
            this.openModal('modal-tutorial');
        });
        
        // Tutorial navigation
        document.getElementById('tutorial-prev').addEventListener('click', () => {
            this.navigateTutorial(-1);
        });
        
        document.getElementById('tutorial-next').addEventListener('click', () => {
            this.navigateTutorial(1);
        });
        
        document.getElementById('dont-show-tutorial').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.socket.emit('tutorial:complete', { step: this.totalTutorialSteps });
            }
        });
        
        // Chat
        document.getElementById('btn-send-chat').addEventListener('click', () => {
            this.sendChatMessage();
        });
        
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });
        
        // Auction
        document.getElementById('btn-create-auction').addEventListener('click', () => {
            this.populateAuctionResourceSelect();
            this.openModal('modal-create-auction');
        });
        
        document.getElementById('btn-submit-auction').addEventListener('click', () => {
            this.createAuction();
        });
        
        // Trade
        document.getElementById('btn-refresh-players').addEventListener('click', () => {
            this.socket.emit('players:list');
        });
        
        document.getElementById('btn-add-offer').addEventListener('click', () => {
            this.addTradeItem('offer');
        });
        
        document.getElementById('btn-add-request').addEventListener('click', () => {
            this.addTradeItem('request');
        });
        
        document.getElementById('btn-send-trade').addEventListener('click', () => {
            this.sendTradeOffer();
        });
        
        document.getElementById('btn-accept-trade').addEventListener('click', () => {
            this.acceptTrade();
        });
        
        document.getElementById('btn-decline-trade').addEventListener('click', () => {
            this.declineTrade();
        });
        
        // Leaderboard tabs
        document.querySelectorAll('.lb-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateLeaderboardContent(btn.dataset.category);
            });
        });
        
        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').classList.add('hidden');
            });
        });
        
        // Click outside modal to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });
    }
    
    // ==========================================
    // Game Actions
    // ==========================================
    
    joinGame() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        
        if (!username) {
            this.showAuthError('Please enter a username!');
            return;
        }
        
        if (username.length < 2) {
            this.showAuthError('Username must be at least 2 characters!');
            return;
        }
        
        if (!password) {
            this.showAuthError('Please enter a password!');
            return;
        }
        
        if (password.length < 4) {
            this.showAuthError('Password must be at least 4 characters!');
            return;
        }
        
        // Initialize audio context on user interaction (required by browsers)
        this.initAudioContext();
        
        if (this.authMode === 'register') {
            const confirmPassword = document.getElementById('password-confirm').value;
            if (password !== confirmPassword) {
                this.showAuthError('Passwords do not match!');
                return;
            }
            this.socket.emit('player:register', { username, password });
        } else {
            this.socket.emit('player:login', { username, password });
        }
    }
    
    initAudioContext() {
        // Initialize audio context on user interaction (required by browsers)
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                // Resume if suspended (needed for some browsers)
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
            } catch (e) {
                console.warn('Audio not supported:', e);
            }
        }
    }
    
    showAuthError(message) {
        const errorEl = document.getElementById('auth-error');
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
    
    hideAuthError() {
        document.getElementById('auth-error').classList.add('hidden');
    }
    
    // Chat methods
    sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (!message) return;
        
        this.socket.emit('chat:send', { message });
        input.value = '';
    }
    
    addChatMessage(msg) {
        const container = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'chat-message';
        
        const time = new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        div.innerHTML = `
            <div class="chat-message-header">
                <span class="chat-username">${msg.username}</span>
                <span class="chat-level">Lv.${msg.level}</span>
                <span class="chat-time">${time}</span>
            </div>
            <div class="chat-text">${this.escapeHtml(msg.message)}</div>
        `;
        
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
        
        // Keep only last 50 messages in DOM
        while (container.children.length > 50) {
            container.removeChild(container.firstChild);
        }
    }
    
    loadChatHistory(messages) {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';
        
        for (const msg of messages) {
            this.addChatMessage(msg);
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // ==========================================
    // Settings Methods
    // ==========================================
    
    setupSettingsListeners() {
        // Volume slider
        const volumeSlider = document.getElementById('settings-master-volume');
        const volumeValue = document.getElementById('volume-value');
        
        volumeSlider.addEventListener('input', (e) => {
            this.settings.masterVolume = parseInt(e.target.value);
            volumeValue.textContent = `${this.settings.masterVolume}%`;
            this.saveSettings();
        });
        
        // Mute toggle
        document.getElementById('settings-mute').addEventListener('change', (e) => {
            this.settings.muted = e.target.checked;
            this.saveSettings();
        });
        
        // SFX toggle
        document.getElementById('settings-sfx').addEventListener('change', (e) => {
            this.settings.sfxEnabled = e.target.checked;
            this.saveSettings();
        });
        
        // Notification sounds toggle
        document.getElementById('settings-notifications-sound').addEventListener('change', (e) => {
            this.settings.notificationSounds = e.target.checked;
            this.saveSettings();
        });
        
        // Animations toggle
        document.getElementById('settings-animations').addEventListener('change', (e) => {
            this.settings.animations = e.target.checked;
            document.body.classList.toggle('no-animations', !this.settings.animations);
            this.saveSettings();
        });
        
        // Compact mode toggle
        document.getElementById('settings-compact').addEventListener('change', (e) => {
            this.settings.compactMode = e.target.checked;
            document.body.classList.toggle('compact-mode', this.settings.compactMode);
            this.saveSettings();
        });
        
        // Show rates toggle
        document.getElementById('settings-show-rates').addEventListener('change', (e) => {
            this.settings.showRates = e.target.checked;
            this.updateResourcesUI();
            this.saveSettings();
        });
        
        // Toast notifications toggle
        document.getElementById('settings-toast-notifications').addEventListener('change', (e) => {
            this.settings.toastNotifications = e.target.checked;
            this.saveSettings();
        });
        
        // Trade notifications toggle
        document.getElementById('settings-trade-notifications').addEventListener('change', (e) => {
            this.settings.tradeNotifications = e.target.checked;
            this.saveSettings();
        });
        
        // Event notifications toggle
        document.getElementById('settings-event-notifications').addEventListener('change', (e) => {
            this.settings.eventNotifications = e.target.checked;
            this.saveSettings();
        });
        
        // Logout button
        document.getElementById('btn-logout').addEventListener('click', () => {
            this.logout();
        });
        
        // Reset tutorial button
        document.getElementById('btn-reset-tutorial').addEventListener('click', () => {
            this.closeModal('modal-settings');
            this.tutorialStep = 0;
            this.updateTutorialUI();
            this.openModal('modal-tutorial');
            this.showToast('Tutorial restarted!', 'success');
        });
        
        // Export data button
        document.getElementById('btn-export-data').addEventListener('click', () => {
            this.exportSaveData();
        });
    }
    
    openSettings() {
        // Update account info
        if (this.player) {
            document.getElementById('settings-username').textContent = this.player.username || '-';
            document.getElementById('settings-level').textContent = this.player.level || 1;
            document.getElementById('settings-time-played').textContent = this.player.time_played_formatted || '0m';
        }
        
        // Update settings UI to match current settings
        document.getElementById('settings-master-volume').value = this.settings.masterVolume;
        document.getElementById('volume-value').textContent = `${this.settings.masterVolume}%`;
        document.getElementById('settings-mute').checked = this.settings.muted;
        document.getElementById('settings-sfx').checked = this.settings.sfxEnabled;
        document.getElementById('settings-notifications-sound').checked = this.settings.notificationSounds;
        document.getElementById('settings-animations').checked = this.settings.animations;
        document.getElementById('settings-compact').checked = this.settings.compactMode;
        document.getElementById('settings-show-rates').checked = this.settings.showRates;
        document.getElementById('settings-toast-notifications').checked = this.settings.toastNotifications;
        document.getElementById('settings-trade-notifications').checked = this.settings.tradeNotifications;
        document.getElementById('settings-event-notifications').checked = this.settings.eventNotifications;
        
        this.openModal('modal-settings');
    }
    
    loadSettings() {
        const saved = localStorage.getItem('resourceTycoonSettings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.settings = { ...this.settings, ...parsed };
            } catch (e) {
                console.warn('Failed to load settings:', e);
            }
        }
        
        // Apply loaded settings
        document.body.classList.toggle('no-animations', !this.settings.animations);
        document.body.classList.toggle('compact-mode', this.settings.compactMode);
    }
    
    saveSettings() {
        try {
            localStorage.setItem('resourceTycoonSettings', JSON.stringify(this.settings));
        } catch (e) {
            console.warn('Failed to save settings:', e);
        }
    }
    
    logout() {
        if (confirm('Are you sure you want to logout?')) {
            // Clear local storage auth data
            localStorage.removeItem('resourceTycoonAuth');
            
            // Disconnect socket
            if (this.socket) {
                this.socket.disconnect();
            }
            
            // Show login screen
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('game-container').classList.add('hidden');
            
            // Reset player data
            this.player = null;
            
            // Clear form fields
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
            
            this.showToast('Logged out successfully', 'success');
            
            // Reconnect socket for new login
            setTimeout(() => {
                this.socket.connect();
            }, 500);
        }
    }
    
    exportSaveData() {
        if (!this.player) {
            this.showToast('No save data to export', 'error');
            return;
        }
        
        const exportData = {
            username: this.player.username,
            level: this.player.level,
            money: this.player.money,
            xp: this.player.xp,
            resources: this.player.resources,
            buildings: this.player.buildings,
            stats: this.player.stats,
            eco_points: this.player.eco_points,
            time_played: this.player.time_played_formatted,
            exported_at: new Date().toISOString()
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `resource-tycoon-save-${this.player.username}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showToast('Save data exported!', 'success');
    }
    
    // Play sound effect
    playSound(type) {
        if (this.settings.muted || !this.settings.sfxEnabled) return;
        
        // Initialize audio context if needed
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                return; // Audio not supported
            }
        }
        
        // Resume if suspended (browsers require user interaction)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(e => console.warn('Audio resume failed:', e));
        }
        
        const volume = this.settings.masterVolume / 100;
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        gainNode.gain.value = volume * 0.1;
        
        // Different sounds for different actions
        switch (type) {
            case 'click':
                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
                oscillator.start();
                oscillator.stop(this.audioContext.currentTime + 0.1);
                break;
            case 'success':
                oscillator.frequency.value = 523.25; // C5
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                oscillator.start();
                setTimeout(() => {
                    const osc2 = this.audioContext.createOscillator();
                    const gain2 = this.audioContext.createGain();
                    osc2.connect(gain2);
                    gain2.connect(this.audioContext.destination);
                    osc2.frequency.value = 659.25; // E5
                    osc2.type = 'sine';
                    gain2.gain.value = volume * 0.1;
                    gain2.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                    osc2.start();
                    osc2.stop(this.audioContext.currentTime + 0.3);
                }, 100);
                oscillator.stop(this.audioContext.currentTime + 0.15);
                break;
            case 'error':
                oscillator.frequency.value = 200;
                oscillator.type = 'sawtooth';
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
                oscillator.start();
                oscillator.stop(this.audioContext.currentTime + 0.2);
                break;
            case 'notification':
                if (!this.settings.notificationSounds) return;
                oscillator.frequency.value = 440;
                oscillator.type = 'sine';
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);
                oscillator.start();
                oscillator.stop(this.audioContext.currentTime + 0.15);
                break;
            case 'levelup':
                // Play a fanfare-like sound
                const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
                notes.forEach((freq, i) => {
                    setTimeout(() => {
                        const osc = this.audioContext.createOscillator();
                        const gain = this.audioContext.createGain();
                        osc.connect(gain);
                        gain.connect(this.audioContext.destination);
                        osc.frequency.value = freq;
                        osc.type = 'sine';
                        gain.gain.value = volume * 0.1;
                        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                        osc.start();
                        osc.stop(this.audioContext.currentTime + 0.3);
                    }, i * 100);
                });
                return; // Don't start the main oscillator
        }
    }
    
    // Tutorial methods
    navigateTutorial(direction) {
        const newStep = this.tutorialStep + direction;
        
        if (newStep < 0 || newStep >= this.totalTutorialSteps) {
            if (newStep >= this.totalTutorialSteps) {
                this.closeModal('modal-tutorial');
                if (document.getElementById('dont-show-tutorial').checked) {
                    this.socket.emit('tutorial:complete', { step: this.totalTutorialSteps });
                }
            }
            return;
        }
        
        this.tutorialStep = newStep;
        this.updateTutorialUI();
    }
    
    updateTutorialUI() {
        // Hide all steps
        document.querySelectorAll('.tutorial-step').forEach(step => {
            step.classList.remove('active');
        });
        
        // Show current step
        const currentStep = document.querySelector(`.tutorial-step[data-step="${this.tutorialStep}"]`);
        if (currentStep) {
            currentStep.classList.add('active');
        }
        
        // Update progress
        document.getElementById('tutorial-current').textContent = this.tutorialStep + 1;
        document.getElementById('tutorial-total').textContent = this.totalTutorialSteps;
        
        // Update buttons
        document.getElementById('tutorial-prev').disabled = this.tutorialStep === 0;
        
        const nextBtn = document.getElementById('tutorial-next');
        if (this.tutorialStep >= this.totalTutorialSteps - 1) {
            nextBtn.textContent = 'Finish';
        } else {
            nextBtn.textContent = 'Next →';
        }
    }
    
    gatherResource(resourceId) {
        if (this.gatherCooldowns[resourceId]) return;
        
        this.socket.emit('resource:gather', { resourceId });
        
        // Set local cooldown
        const resource = this.resources[resourceId];
        if (resource && resource.base_gather_time) {
            this.gatherCooldowns[resourceId] = Date.now() + (resource.base_gather_time * 1000);
        }
    }
    
    buyBuilding(buildingId) {
        const building = this.buildings[buildingId];
        if (!building) return;
        
        let amount = this.buyAmount;
        if (amount === 'max') {
            amount = this.calculateMaxAffordable(building);
        }
        
        if (amount <= 0) {
            this.showToast('Cannot afford any!', 'error');
            return;
        }
        
        // Send single bulk purchase request
        this.socket.emit('building:buy', { buildingId, amount: amount });
    }
    
    upgradeBuilding(buildingId) {
        this.socket.emit('building:upgrade', { buildingId });
    }
    
    setBuyAmount(amount) {
        this.buyAmount = amount;
        this.updateBuildingsUI();
    }
    
    calculateMaxAffordable(building) {
        let maxByMoney = Math.floor(this.player.money / building.cost);
        
        // Check resource costs
        for (const [resId, amount] of Object.entries(building.cost_resources || {})) {
            const owned = this.player.resources?.[resId] || 0;
            const maxByRes = Math.floor(owned / amount);
            maxByMoney = Math.min(maxByMoney, maxByRes);
        }
        
        return Math.max(0, maxByMoney);
    }
    
    formatBulkCost(building, amount) {
        if (amount <= 0) return 'N/A';
        
        let parts = [`$${this.formatNumber(building.cost * amount)}`];
        for (const [resId, resAmount] of Object.entries(building.cost_resources || {})) {
            const res = this.resources[resId];
            parts.push(`${resAmount * amount} ${res?.icon || resId}`);
        }
        return parts.join(' + ');
    }
    
    craftItem(recipeId) {
        this.socket.emit('craft:item', { recipeId, amount: 1 });
    }
    
    sellResource(resourceId, amount) {
        if (amount <= 0) return;
        this.socket.emit('market:sell', { resourceId, amount: parseInt(amount) });
    }
    
    sellAllResource(resourceId) {
        const amount = this.player.resources?.[resourceId] || 0;
        if (amount <= 0) {
            this.showToast('No resources to sell!', 'error');
            return;
        }
        this.socket.emit('market:sell', { resourceId, amount: parseInt(amount) });
    }
    
    sellAllResources() {
        let soldAny = false;
        for (const [resourceId, amount] of Object.entries(this.player.resources || {})) {
            if (amount > 0 && this.market[resourceId]) {
                this.socket.emit('market:sell', { resourceId, amount: parseInt(amount) });
                soldAny = true;
            }
        }
        if (!soldAny) {
            this.showToast('No resources to sell!', 'error');
        }
    }
    
    updateBuyCostPreview(resourceId) {
        const input = document.getElementById(`market-amount-${resourceId}`);
        const costPreview = document.getElementById(`buy-cost-${resourceId}`);
        if (!input || !costPreview) return;
        
        const amount = parseInt(input.value) || 0;
        const priceData = this.market[resourceId];
        if (priceData && amount > 0) {
            const totalCost = priceData.buy_price * amount;
            costPreview.textContent = `Total: $${totalCost.toFixed(2)}`;
            costPreview.classList.toggle('cannot-afford', totalCost > this.player.money);
        } else {
            costPreview.textContent = '';
        }
    }
    
    buyResource(resourceId, amount) {
        if (amount <= 0) return;
        this.socket.emit('market:buy', { resourceId, amount: parseInt(amount) });
    }
    
    createAuction() {
        const resourceId = document.getElementById('auction-resource').value;
        const amount = parseInt(document.getElementById('auction-amount').value);
        const startingPrice = parseFloat(document.getElementById('auction-price').value);
        const duration = parseInt(document.getElementById('auction-duration').value);
        
        if (!resourceId || amount <= 0 || startingPrice <= 0) {
            this.showToast('Please fill in all fields', 'error');
            return;
        }
        
        this.socket.emit('auction:create', { resourceId, amount, startingPrice, duration });
        this.closeModal('modal-create-auction');
    }
    
    bidOnAuction(auctionId, amount) {
        if (amount <= 0) return;
        this.socket.emit('auction:bid', { auctionId, amount: parseFloat(amount) });
    }
    
    openTradeWith(playerId, playerName) {
        this.tradePartner = { id: playerId, name: playerName };
        this.tradeOffer = { resources: {}, money: 0 };
        this.tradeRequest = { resources: {}, money: 0 };
        
        document.getElementById('trade-partner-name').textContent = playerName;
        this.populateTradeResourceSelects();
        this.updateTradeUI();
        this.openModal('modal-trade');
    }
    
    addTradeItem(type) {
        const selectId = type === 'offer' ? 'offer-resource' : 'request-resource';
        const amountId = type === 'offer' ? 'offer-amount' : 'request-amount';
        
        const resourceId = document.getElementById(selectId).value;
        const amount = parseInt(document.getElementById(amountId).value);
        
        if (!resourceId || amount <= 0) return;
        
        const target = type === 'offer' ? this.tradeOffer : this.tradeRequest;
        target.resources[resourceId] = (target.resources[resourceId] || 0) + amount;
        
        this.updateTradeUI();
    }
    
    removeTradeItem(type, resourceId) {
        const target = type === 'offer' ? this.tradeOffer : this.tradeRequest;
        delete target.resources[resourceId];
        this.updateTradeUI();
    }
    
    sendTradeOffer() {
        this.tradeOffer.money = parseInt(document.getElementById('offer-money').value) || 0;
        this.tradeRequest.money = parseInt(document.getElementById('request-money').value) || 0;
        
        this.socket.emit('trade:offer', {
            targetPlayerId: this.tradePartner.id,
            offering: this.tradeOffer,
            requesting: this.tradeRequest
        });
    }
    
    acceptTrade() {
        this.socket.emit('trade:accept', {
            fromPlayerId: this.pendingTrade.fromPlayerId,
            offering: this.pendingTrade.offering,
            requesting: this.pendingTrade.requesting
        });
    }
    
    declineTrade() {
        this.socket.emit('trade:decline', {
            fromPlayerId: this.pendingTrade.fromPlayerId
        });
        this.closeModal('modal-incoming-trade');
    }
    
    claimChallenge(challengeId) {
        this.socket.emit('challenge:claim', { challengeId });
    }
    
    // ==========================================
    // UI Updates
    // ==========================================
    
    showGameScreen() {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
    }
    
    updateAllUI() {
        this.updatePlayerUI();
        this.updateResourcesUI();
        this.updateMoneyUI();
        this.updatePollutionUI();
        this.updateGatherUI();
        this.updateBuildingsUI();
        this.updateCraftingUI();
        this.updateMarketUI();
        this.updateProductionStats();
    }
    
    updatePlayerUI() {
        document.getElementById('player-name').textContent = this.player.username;
        
        // Check if at max level
        const isMaxLevel = this.player.xp_progress?.max_level || this.player.level >= 40;
        const xpTracker = document.getElementById('xp-tracker');
        
        if (isMaxLevel) {
            document.getElementById('player-level').textContent = `${this.player.level} (MAX)`;
            document.getElementById('xp-progress').style.width = '100%';
            document.getElementById('xp-progress').classList.add('max-level');
            xpTracker.textContent = `${this.formatNumber(this.player.xp)} XP (MAX LEVEL!)`;
            xpTracker.title = `Total XP: ${this.formatNumber(this.player.xp)} - You've reached the maximum level!`;
        } else {
            document.getElementById('player-level').textContent = this.player.level;
            document.getElementById('xp-progress').classList.remove('max-level');
            
            // XP progress - use server-provided xp_progress for accuracy
            let progress = 0;
            let currentXpInLevel = 0;
            let xpNeededForLevel = 100;
            
            if (this.player.xp_progress) {
                const { current, needed } = this.player.xp_progress;
                currentXpInLevel = current;
                xpNeededForLevel = needed;
                progress = needed > 0 ? Math.min(100, (current / needed) * 100) : 100;
            } else {
                // Fallback calculation
                const currentXp = this.player.xp || 0;
                const levelXp = this.calculateLevelXp(this.player.level);
                currentXpInLevel = currentXp - levelXp;
                xpNeededForLevel = this.calculateLevelXp(this.player.level + 1) - levelXp;
                progress = xpNeededForLevel > 0 ? Math.min(100, (currentXpInLevel / xpNeededForLevel) * 100) : 100;
            }
            
            document.getElementById('xp-progress').style.width = `${Math.max(0, progress)}%`;
            
            // Update XP tracker text
            const xpRemaining = xpNeededForLevel - currentXpInLevel;
            xpTracker.textContent = `${this.formatNumber(currentXpInLevel)}/${this.formatNumber(xpNeededForLevel)} XP (${progress.toFixed(1)}%)`;
            xpTracker.title = `${this.formatNumber(xpRemaining)} XP until Level ${this.player.level + 1}\nTotal XP: ${this.formatNumber(this.player.xp)}`;
        }
    }
    
    calculateLevelXp(level) {
        // Total XP needed to reach this level (sum of XP for all previous levels)
        let total = 0;
        for (let l = 1; l < level; l++) {
            total += Math.floor(100 * Math.pow(l, 1.5));
        }
        return total;
    }
    
    updateMoneyUI() {
        document.getElementById('player-money').textContent = `$${this.formatNumber(this.player.money)}`;
    }
    
    updatePollutionUI() {
        const pollution = this.player.pollution || 0;
        document.getElementById('pollution-level').style.width = `${Math.min(100, pollution)}%`;
        document.getElementById('player-eco').textContent = this.player.eco_points || 0;
    }
    
    updateResourcesUI() {
        const container = document.getElementById('resources-list');
        container.innerHTML = '';
        
        // Get production rates
        const productionRates = this.player.production_rates || {};
        
        // Sort by tier, then by amount
        const sortedResources = Object.entries(this.player.resources || {})
            .filter(([id, amount]) => amount > 0)
            .sort((a, b) => {
                const tierA = this.resources[a[0]]?.tier || 99;
                const tierB = this.resources[b[0]]?.tier || 99;
                if (tierA !== tierB) return tierA - tierB;
                return b[1] - a[1];
            });
        
        for (const [resourceId, amount] of sortedResources) {
            const resource = this.resources[resourceId];
            if (!resource) continue;
            
            // Get production rate for this resource (only show if setting enabled)
            const rate = productionRates[resourceId] || 0;
            let rateHtml = '';
            if (rate !== 0 && this.settings.showRates) {
                const rateClass = rate > 0 ? 'rate-positive' : 'rate-negative';
                const rateSign = rate > 0 ? '+' : '';
                rateHtml = `<span class="resource-rate ${rateClass}">${rateSign}${rate.toFixed(1)}/s</span>`;
            }
            
            const item = document.createElement('div');
            item.className = 'resource-item';
            item.innerHTML = `
                <div class="resource-info">
                    <span class="resource-icon">${resource.icon}</span>
                    <span class="resource-name">${resource.name}</span>
                    ${rateHtml}
                </div>
                <span class="resource-amount">${this.formatNumber(amount)}</span>
            `;
            container.appendChild(item);
        }
        
        if (sortedResources.length === 0) {
            container.innerHTML = '<div class="no-resources">No resources yet. Start gathering!</div>';
        }
    }
    
    updateGatherUI() {
        const container = document.getElementById('gather-buttons');
        container.innerHTML = '';
        
        // Get gatherable resources unlocked at player's level
        const gatherableResources = Object.values(this.resources)
            .filter(r => r.base_gather_time && r.unlock_level <= this.player.level)
            .sort((a, b) => a.tier - b.tier);
        
        for (const resource of gatherableResources) {
            const btn = document.createElement('button');
            btn.className = 'gather-btn';
            btn.dataset.resourceId = resource.id;
            btn.innerHTML = `
                <span>${resource.icon} Gather ${resource.name}</span>
                <span class="cooldown"></span>
            `;
            btn.addEventListener('click', () => this.gatherResource(resource.id));
            container.appendChild(btn);
        }
    }
    
    updateBuildingsUI() {
        // Owned buildings
        const ownedContainer = document.getElementById('owned-buildings');
        ownedContainer.innerHTML = '';
        
        const ownedBuildings = Object.entries(this.player.buildings || {});
        
        for (const [buildingId, state] of ownedBuildings) {
            const building = this.buildings[buildingId];
            if (!building) continue;
            
            const card = this.createBuildingCard(building, state, true);
            ownedContainer.appendChild(card);
        }
        
        if (ownedBuildings.length === 0) {
            ownedContainer.innerHTML = '<div class="no-buildings">No buildings yet. Purchase your first building below!</div>';
        }
        
        // Available buildings
        const availableContainer = document.getElementById('available-buildings');
        availableContainer.innerHTML = '';
        
        const availableBuildings = Object.values(this.buildings)
            .filter(b => !this.player.buildings?.[b.id])
            .filter(b => {
                if (this.buildingFilter === 'all') return true;
                if (this.buildingFilter === '3') return b.tier >= 3;
                return b.tier === parseInt(this.buildingFilter);
            })
            .sort((a, b) => {
                if (a.tier !== b.tier) return a.tier - b.tier;
                return a.cost - b.cost;
            });
        
        for (const building of availableBuildings) {
            const locked = building.unlock_level > this.player.level;
            const card = this.createBuildingCard(building, null, false, locked);
            availableContainer.appendChild(card);
        }
    }
    
    createBuildingCard(building, state, owned, locked = false) {
        const card = document.createElement('div');
        card.className = `building-card ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}`;
        
        let producesHtml = '';
        for (const [resId, amount] of Object.entries(building.produces || {})) {
            const res = this.resources[resId];
            producesHtml += `<span class="stat-badge produces">+${amount} ${res?.icon || resId}</span>`;
        }
        
        let consumesHtml = '';
        for (const [resId, amount] of Object.entries(building.consumes || {})) {
            const res = this.resources[resId];
            consumesHtml += `<span class="stat-badge consumes">-${amount} ${res?.icon || resId}</span>`;
        }
        
        if (building.passive_income) {
            producesHtml += `<span class="stat-badge produces">+$${building.passive_income}</span>`;
        }
        
        let actionsHtml = '';
        if (owned && state) {
            const canUpgrade = state.level < building.max_level;
            const upgradeCost = Math.floor(building.cost * Math.pow(building.upgrade_cost_multiplier, state.level));
            
            // Calculate how many the player can afford
            const maxAffordable = this.calculateMaxAffordable(building);
            
            // Build cost string for buying one
            let buyCostParts = [`$${this.formatNumber(building.cost)}`];
            for (const [resId, amount] of Object.entries(building.cost_resources || {})) {
                const res = this.resources[resId];
                buyCostParts.push(`${amount} ${res?.icon || resId}`);
            }
            const buyCostStr = buyCostParts.join(' + ');
            
            actionsHtml = `
                <div class="building-level">Level ${state.level}/${building.max_level} (x${state.count})</div>
                <div class="building-buy-controls">
                    <div class="buy-amount-btns">
                        <button class="btn btn-tiny ${this.buyAmount === 1 ? 'active' : ''}" onclick="game.setBuyAmount(1)">+1</button>
                        <button class="btn btn-tiny ${this.buyAmount === 5 ? 'active' : ''}" onclick="game.setBuyAmount(5)">+5</button>
                        <button class="btn btn-tiny ${this.buyAmount === 10 ? 'active' : ''}" onclick="game.setBuyAmount(10)">+10</button>
                        <button class="btn btn-tiny ${this.buyAmount === 100 ? 'active' : ''}" onclick="game.setBuyAmount(100)">+100</button>
                        <button class="btn btn-tiny ${this.buyAmount === 'max' ? 'active' : ''}" onclick="game.setBuyAmount('max')">MAX</button>
                    </div>
                    <div class="building-actions">
                        <button class="btn btn-small btn-secondary" onclick="game.buyBuilding('${building.id}')" title="Cost per building: ${buyCostStr}">
                            Buy ${this.buyAmount === 'max' ? `x${maxAffordable}` : `x${this.buyAmount}`} 
                            (${this.formatBulkCost(building, this.buyAmount === 'max' ? maxAffordable : this.buyAmount)})
                        </button>
                        ${canUpgrade ? `
                            <button class="btn btn-small btn-primary" onclick="game.upgradeBuilding('${building.id}')">
                                Upgrade ($${this.formatNumber(upgradeCost)})
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        } else if (!locked) {
            let costHtml = `$${this.formatNumber(building.cost)}`;
            for (const [resId, amount] of Object.entries(building.cost_resources || {})) {
                const res = this.resources[resId];
                costHtml += ` + ${amount} ${res?.icon || resId}`;
            }
            
            actionsHtml = `
                <div class="building-cost">Cost: ${costHtml}</div>
                <div class="building-actions">
                    <button class="btn btn-small btn-primary" onclick="game.buyBuilding('${building.id}')">
                        Purchase
                    </button>
                </div>
            `;
        } else {
            actionsHtml = `<div class="building-locked">🔒 Requires Level ${building.unlock_level}</div>`;
        }
        
        card.innerHTML = `
            <div class="building-header">
                <div class="building-icon">${building.icon}</div>
                <div class="building-info">
                    <h4>${building.name}</h4>
                    <span class="building-tier">Tier ${building.tier}</span>
                </div>
            </div>
            <p class="building-desc">${building.description}</p>
            <div class="building-stats">
                ${producesHtml}
                ${consumesHtml}
            </div>
            ${actionsHtml}
        `;
        
        return card;
    }
    
    updateCraftingUI() {
        const container = document.getElementById('recipes-grid');
        container.innerHTML = '';
        
        const sortedRecipes = Object.values(this.recipes)
            .sort((a, b) => a.unlock_level - b.unlock_level);
        
        for (const recipe of sortedRecipes) {
            const locked = recipe.unlock_level > this.player.level;
            const card = this.createRecipeCard(recipe, locked);
            container.appendChild(card);
        }
    }
    
    createRecipeCard(recipe, locked) {
        const card = document.createElement('div');
        card.className = `recipe-card ${locked ? 'locked' : ''}`;
        
        let inputsHtml = '';
        let canCraft = true;
        for (const [resId, amount] of Object.entries(recipe.inputs)) {
            const res = this.resources[resId];
            const have = this.player.resources?.[resId] || 0;
            const hasEnough = have >= amount;
            if (!hasEnough) canCraft = false;
            inputsHtml += `<span class="io-item ${hasEnough ? '' : 'insufficient'}">${res?.icon || resId} ${amount}</span>`;
        }
        
        let outputsHtml = '';
        for (const [resId, amount] of Object.entries(recipe.outputs)) {
            const res = this.resources[resId];
            outputsHtml += `<span class="io-item">${res?.icon || resId} ${amount}</span>`;
        }
        
        // Check if currently crafting
        const isCrafting = this.craftEndTime || this.player.active_craft;
        const isDisabled = isCrafting || !canCraft;
        let buttonText = 'Craft';
        if (isCrafting) buttonText = '⏳ Crafting...';
        else if (!canCraft) buttonText = '❌ Missing Resources';
        
        card.innerHTML = `
            <div class="recipe-header">
                <h4>${recipe.name}</h4>
                <span class="recipe-time">${recipe.craft_time}s</span>
            </div>
            <div class="recipe-io">
                <div class="recipe-inputs">${inputsHtml}</div>
                <span class="recipe-arrow">→</span>
                <div class="recipe-outputs">${outputsHtml}</div>
            </div>
            ${locked ? `<div class="recipe-locked">🔒 Requires Level ${recipe.unlock_level}</div>` : `
                <button class="btn btn-small btn-primary" onclick="game.craftItem('${recipe.id}')" ${isDisabled ? 'disabled' : ''}>
                    ${buttonText}
                </button>
            `}
        `;
        
        return card;
    }
    
    updateCraftUI(recipeId = null) {
        const container = document.getElementById('active-craft');
        
        if (!this.craftEndTime) {
            container.classList.add('hidden');
            return;
        }
        
        container.classList.remove('hidden');
        
        if (recipeId) {
            const recipe = this.recipes[recipeId];
            document.getElementById('crafting-item').textContent = recipe?.name || recipeId;
        }
    }
    
    updateMarketUI() {
        const container = document.getElementById('market-grid');
        
        // Preserve current input values before rebuilding
        const savedInputs = {};
        container.querySelectorAll('input[id^="market-amount-"]').forEach(input => {
            const resourceId = input.id.replace('market-amount-', '');
            if (input.value !== '1' && input.value !== '') {
                savedInputs[resourceId] = input.value;
            }
            // Also check if the input is currently focused
            if (document.activeElement === input) {
                savedInputs[resourceId + '_focused'] = true;
                savedInputs[resourceId] = input.value; // Always save if focused
            }
        });
        
        container.innerHTML = '';
        
        // Add "Sell All Resources" button at the top
        const sellAllBtn = document.createElement('div');
        sellAllBtn.className = 'market-sell-all-container';
        sellAllBtn.innerHTML = `
            <button class="btn btn-large btn-success sell-all-btn" onclick="game.sellAllResources()">
                💰 Sell All Resources
            </button>
        `;
        container.appendChild(sellAllBtn);
        
        // Show resources the player has unlocked or owns
        const marketResources = Object.entries(this.market)
            .filter(([id, data]) => {
                const resource = this.resources[id];
                if (!resource) return false;
                if (resource.category === 'product') return false; // Can't buy products
                return resource.unlock_level <= this.player.level || (this.player.resources?.[id] > 0);
            })
            .sort((a, b) => {
                const tierA = this.resources[a[0]]?.tier || 99;
                const tierB = this.resources[b[0]]?.tier || 99;
                return tierA - tierB;
            });
        
        for (const [resourceId, priceData] of marketResources) {
            const resource = this.resources[resourceId];
            const owned = this.player.resources?.[resourceId] || 0;
            
            const item = document.createElement('div');
            item.className = 'market-item';
            
            let trendClass = 'trend-stable';
            let trendSymbol = '→';
            if (priceData.trend > 1) { trendClass = 'trend-up'; trendSymbol = '↑'; }
            else if (priceData.trend < -1) { trendClass = 'trend-down'; trendSymbol = '↓'; }
            
            // Use saved value if exists, otherwise default to 1
            const savedValue = savedInputs[resourceId] || '1';
            
            item.innerHTML = `
                <div class="market-item-header">
                    <span class="market-item-icon">${resource.icon}</span>
                    <span class="market-item-name">${resource.name}</span>
                </div>
                <div class="market-prices">
                    <span class="price-buy">Buy: $${priceData.buy_price.toFixed(2)}</span>
                    <span class="price-sell">Sell: $${priceData.sell_price.toFixed(2)}</span>
                </div>
                <div class="market-trend ${trendClass}">
                    ${trendSymbol} ${Math.abs(priceData.trend).toFixed(1)}%
                </div>
                <div class="market-owned">Owned: ${owned}</div>
                <div class="market-actions">
                    <input type="number" id="market-amount-${resourceId}" value="${savedValue}" min="1" 
                           oninput="game.updateBuyCostPreview('${resourceId}')">
                    <span id="buy-cost-${resourceId}" class="buy-cost-preview"></span>
                    <button class="btn btn-small btn-secondary" onclick="game.buyResource('${resourceId}', document.getElementById('market-amount-${resourceId}').value)">Buy</button>
                    <button class="btn btn-small btn-primary" onclick="game.sellResource('${resourceId}', document.getElementById('market-amount-${resourceId}').value)">Sell</button>
                    ${owned > 0 ? `<button class="btn btn-small btn-success" onclick="game.sellAllResource('${resourceId}')">Sell All</button>` : ''}
                </div>
            `;
            
            container.appendChild(item);
        }
        
        // Restore focus to previously focused input
        for (const key in savedInputs) {
            if (key.endsWith('_focused')) {
                const resourceId = key.replace('_focused', '');
                const input = document.getElementById(`market-amount-${resourceId}`);
                if (input) {
                    input.focus();
                    // Move cursor to end of input
                    input.setSelectionRange(input.value.length, input.value.length);
                }
                break;
            }
        }
        
        // Update cost previews for any restored values
        for (const resourceId in savedInputs) {
            if (!resourceId.endsWith('_focused')) {
                this.updateBuyCostPreview(resourceId);
            }
        }
    }
    
    updateAuctionsUI() {
        const container = document.getElementById('auctions-list');
        container.innerHTML = '';
        
        if (this.auctions.length === 0) {
            container.innerHTML = '<div class="no-auctions">No active auctions. Create one!</div>';
            return;
        }
        
        for (const auction of this.auctions) {
            const resource = this.resources[auction.resource_id];
            const isOwner = auction.seller_id === this.player.id;
            
            const card = document.createElement('div');
            card.className = 'auction-card';
            card.innerHTML = `
                <div class="auction-item">
                    <span class="auction-item-icon">${resource?.icon || '📦'}</span>
                    <div>
                        <strong>${auction.amount}x ${resource?.name || auction.resource_id}</strong>
                        <div class="auction-seller">by ${auction.seller_name}</div>
                    </div>
                </div>
                <div class="auction-details">
                    <div class="auction-price">$${auction.current_price.toFixed(2)}</div>
                    <div class="auction-bidder">
                        ${auction.current_bidder_name ? `Highest: ${auction.current_bidder_name}` : 'No bids yet'}
                    </div>
                </div>
                <div class="auction-actions">
                    <div class="auction-time" data-ends="${auction.ends_at}">--:--</div>
                    ${!isOwner ? `
                        <div class="auction-bid-input">
                            <input type="number" id="bid-${auction.id}" value="${(auction.current_price * 1.05).toFixed(2)}" step="0.01">
                            <button class="btn btn-small btn-primary" onclick="game.bidOnAuction('${auction.id}', document.getElementById('bid-${auction.id}').value)">Bid</button>
                        </div>
                    ` : '<span class="own-auction">Your Auction</span>'}
                </div>
            `;
            
            container.appendChild(card);
        }
    }
    
    updatePlayersUI() {
        const container = document.getElementById('players-list');
        container.innerHTML = '';
        
        if (this.players.length === 0) {
            container.innerHTML = '<div class="no-players">No other players online</div>';
            return;
        }
        
        for (const player of this.players) {
            const card = document.createElement('div');
            card.className = 'player-card';
            card.innerHTML = `
                <div class="player-card-avatar">👤</div>
                <div class="player-card-info">
                    <div class="player-card-name">${player.username}</div>
                    <div class="player-card-level">Level ${player.level}</div>
                </div>
                <div class="player-status ${player.online ? 'online' : ''}"></div>
                <button class="btn btn-small btn-primary" onclick="game.openTradeWith('${player.id}', '${player.username}')">
                    Trade
                </button>
            `;
            container.appendChild(card);
        }
    }
    
    updateProductionStats() {
        let totalBuildings = 0;
        
        for (const [buildingId, state] of Object.entries(this.player.buildings || {})) {
            totalBuildings += state.count;
        }
        
        // Use server-calculated income rate (per second), convert to per minute
        const incomePerSecond = this.player.income_rate || 0;
        const incomePerMin = incomePerSecond * 60;
        
        document.getElementById('income-per-min').textContent = `$${this.formatNumber(Math.round(incomePerMin))}`;
        document.getElementById('total-buildings').textContent = totalBuildings;
    }
    
    updateLeaderboard(data) {
        this.leaderboardData = data;
        this.updateMiniLeaderboard(data);
        this.updateLeaderboardContent('wealth');
    }
    
    updateMiniLeaderboard(data) {
        const container = document.getElementById('mini-leaderboard');
        container.innerHTML = '';
        
        const wealthRankings = data.wealth?.rankings || [];
        
        for (let i = 0; i < Math.min(5, wealthRankings.length); i++) {
            const player = wealthRankings[i];
            const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            
            const row = document.createElement('div');
            row.className = 'mini-rank';
            row.innerHTML = `
                <span class="rank-position ${posClass}">${player.rank}</span>
                <span class="rank-name">${player.username}</span>
                <span class="rank-value">${player.formatted_value}</span>
            `;
            container.appendChild(row);
        }
    }
    
    updateLeaderboardContent(category) {
        const container = document.getElementById('leaderboard-content');
        container.innerHTML = '';
        
        const data = this.leaderboardData?.[category];
        if (!data) return;
        
        for (const player of data.rankings) {
            const isMe = player.player_id === this.player.id;
            const posClass = player.rank === 1 ? 'gold' : player.rank === 2 ? 'silver' : player.rank === 3 ? 'bronze' : '';
            
            const row = document.createElement('div');
            row.className = `leaderboard-row ${isMe ? 'highlight' : ''}`;
            row.innerHTML = `
                <span class="rank-position ${posClass}">${player.rank}</span>
                <span class="rank-name">${player.username} ${isMe ? '(You)' : ''}</span>
                <span class="rank-level">Lv.${player.level}</span>
                <span class="rank-value">${player.formatted_value}</span>
            `;
            container.appendChild(row);
        }
    }
    
    updateChallenges(data) {
        // Daily challenges
        const dailyContainer = document.getElementById('daily-challenges');
        dailyContainer.innerHTML = '';
        
        for (const challenge of (data.daily || [])) {
            dailyContainer.appendChild(this.createChallengeCard(challenge));
        }
        
        // Weekly challenges
        const weeklyContainer = document.getElementById('weekly-challenges');
        weeklyContainer.innerHTML = '';
        
        for (const challenge of (data.weekly || [])) {
            weeklyContainer.appendChild(this.createChallengeCard(challenge));
        }
    }
    
    createChallengeCard(challenge) {
        const card = document.createElement('div');
        card.className = `challenge-card ${challenge.completed ? 'completed' : ''} ${challenge.claimed ? 'claimed' : ''}`;
        
        const progress = Math.min(100, (challenge.progress / challenge.target) * 100);
        
        card.innerHTML = `
            <div class="challenge-header">
                <span class="challenge-name">${challenge.name}</span>
                <span class="challenge-reward">+$${challenge.rewards.money} +${challenge.rewards.xp}XP</span>
            </div>
            <p class="challenge-desc">${challenge.description}</p>
            <div class="challenge-progress-bar">
                <div class="challenge-progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="challenge-progress-text">
                <span>${challenge.progress}/${challenge.target}</span>
                ${challenge.completed && !challenge.claimed ? 
                    `<button class="btn btn-small btn-primary" onclick="game.claimChallenge('${challenge.id}')">Claim</button>` : 
                    challenge.claimed ? '<span>✓ Claimed</span>' : ''}
            </div>
        `;
        
        return card;
    }
    
    updateTradeUI() {
        // Update offer display
        const offerContainer = document.getElementById('trade-offer');
        offerContainer.innerHTML = '';
        
        for (const [resId, amount] of Object.entries(this.tradeOffer.resources)) {
            const res = this.resources[resId];
            const item = document.createElement('div');
            item.className = 'trade-item';
            item.innerHTML = `${res?.icon || resId} ${amount} <span class="remove" onclick="game.removeTradeItem('offer', '${resId}')">&times;</span>`;
            offerContainer.appendChild(item);
        }
        
        // Update request display
        const requestContainer = document.getElementById('trade-request');
        requestContainer.innerHTML = '';
        
        for (const [resId, amount] of Object.entries(this.tradeRequest.resources)) {
            const res = this.resources[resId];
            const item = document.createElement('div');
            item.className = 'trade-item';
            item.innerHTML = `${res?.icon || resId} ${amount} <span class="remove" onclick="game.removeTradeItem('request', '${resId}')">&times;</span>`;
            requestContainer.appendChild(item);
        }
    }
    
    populateTradeResourceSelects() {
        const offerSelect = document.getElementById('offer-resource');
        const requestSelect = document.getElementById('request-resource');
        
        offerSelect.innerHTML = '';
        requestSelect.innerHTML = '';
        
        // Offer: resources player owns
        for (const [resId, amount] of Object.entries(this.player.resources || {})) {
            if (amount > 0) {
                const res = this.resources[resId];
                offerSelect.innerHTML += `<option value="${resId}">${res?.icon || ''} ${res?.name || resId} (${amount})</option>`;
            }
        }
        
        // Request: all resources
        for (const [resId, res] of Object.entries(this.resources)) {
            requestSelect.innerHTML += `<option value="${resId}">${res.icon} ${res.name}</option>`;
        }
    }
    
    populateAuctionResourceSelect() {
        const select = document.getElementById('auction-resource');
        select.innerHTML = '';
        
        for (const [resId, amount] of Object.entries(this.player.resources || {})) {
            if (amount > 0) {
                const res = this.resources[resId];
                select.innerHTML += `<option value="${resId}">${res?.icon || ''} ${res?.name || resId} (${amount})</option>`;
            }
        }
    }
    
    showIncomingTrade(data) {
        document.getElementById('incoming-trader-name').textContent = data.fromUsername;
        
        // Show offering
        const offeringContainer = document.getElementById('incoming-offering');
        offeringContainer.innerHTML = '';
        
        for (const [resId, amount] of Object.entries(data.offering.resources || {})) {
            const res = this.resources[resId];
            offeringContainer.innerHTML += `<div class="trade-item">${res?.icon || resId} ${amount}</div>`;
        }
        if (data.offering.money > 0) {
            offeringContainer.innerHTML += `<div class="trade-item">💰 $${data.offering.money}</div>`;
        }
        
        // Show requesting
        const requestingContainer = document.getElementById('incoming-requesting');
        requestingContainer.innerHTML = '';
        
        for (const [resId, amount] of Object.entries(data.requesting.resources || {})) {
            const res = this.resources[resId];
            requestingContainer.innerHTML += `<div class="trade-item">${res?.icon || resId} ${amount}</div>`;
        }
        if (data.requesting.money > 0) {
            requestingContainer.innerHTML += `<div class="trade-item">💰 $${data.requesting.money}</div>`;
        }
        
        this.openModal('modal-incoming-trade');
    }
    
    showEvent(event) {
        const banner = document.getElementById('event-banner');
        document.getElementById('event-icon').textContent = event.icon;
        document.getElementById('event-text').textContent = `${event.name}: ${event.description}`;
        
        banner.classList.remove('hidden');
        
        // Cancel any existing event timer to prevent flickering
        if (this.eventTimerId) {
            clearTimeout(this.eventTimerId);
            this.eventTimerId = null;
        }
        
        // Store event end time
        this.eventEndsAt = event.ends_at || (event.started_at + event.duration);
        
        // Update timer
        const updateTimer = () => {
            const remaining = this.eventEndsAt - Date.now() / 1000;
            if (remaining <= 0) {
                banner.classList.add('hidden');
                this.eventTimerId = null;
                return;
            }
            
            const mins = Math.floor(remaining / 60);
            const secs = Math.floor(remaining % 60);
            document.getElementById('event-timer').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            
            this.eventTimerId = setTimeout(updateTimer, 1000);
        };
        
        updateTimer();
    }
    
    // ==========================================
    // Game Loops
    // ==========================================
    
    updateCooldowns() {
        const now = Date.now();
        
        document.querySelectorAll('.gather-btn').forEach(btn => {
            const resourceId = btn.dataset.resourceId;
            const cooldownEnd = this.gatherCooldowns[resourceId];
            const cooldownSpan = btn.querySelector('.cooldown');
            
            if (cooldownEnd && now < cooldownEnd) {
                const remaining = (cooldownEnd - now) / 1000;
                cooldownSpan.textContent = remaining.toFixed(1) + 's';
                btn.disabled = true;
            } else {
                cooldownSpan.textContent = '';
                btn.disabled = false;
                delete this.gatherCooldowns[resourceId];
            }
        });
    }
    
    updateCraftProgress() {
        if (!this.craftEndTime) {
            // Also clear active_craft if we have no craftEndTime
            if (this.player && this.player.active_craft) {
                // Check if the craft should have completed
                const craftStart = this.player.active_craft.start_time * 1000;
                const craftDuration = this.player.active_craft.duration * 1000;
                if (Date.now() > craftStart + craftDuration + 2000) {
                    // Craft should have completed, clear state
                    this.player.active_craft = null;
                    this.updateCraftingUI();
                }
            }
            return;
        }
        
        const now = Date.now();
        const remaining = Math.max(0, (this.craftEndTime - now) / 1000);
        
        if (remaining <= 0) {
            this.craftEndTime = null;
            this.player.active_craft = null;
            this.updateCraftUI();
            this.updateCraftingUI();
            return;
        }
        
        // Calculate progress based on actual craft duration
        const craftDuration = this.player.active_craft?.duration || 30;
        const progress = 100 - (remaining / craftDuration) * 100;
        document.getElementById('craft-progress').style.width = `${Math.min(100, progress)}%`;
        document.getElementById('craft-time').textContent = remaining.toFixed(1) + 's';
    }
    
    updateAuctionTimers() {
        const now = Date.now() / 1000;
        
        document.querySelectorAll('.auction-time').forEach(el => {
            const endsAt = parseFloat(el.dataset.ends);
            const remaining = Math.max(0, endsAt - now);
            
            if (remaining <= 0) {
                el.textContent = 'Ended';
            } else {
                const mins = Math.floor(remaining / 60);
                const secs = Math.floor(remaining % 60);
                el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
        });
    }
    
    // ==========================================
    // Utility Functions
    // ==========================================
    
    switchTab(tabId) {
        this.activeTab = tabId;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === `tab-${tabId}`);
        });
        
        // Refresh data for specific tabs
        if (tabId === 'auction') {
            this.socket.emit('auction:list');
        } else if (tabId === 'trade') {
            this.socket.emit('players:list');
        }
    }
    
    openModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
    }
    
    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }
    
    showToast(message, type = 'info') {
        // Check if toast notifications are enabled
        if (!this.settings.toastNotifications) return;
        
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };
        
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${icons[type]}</span>
                <span class="toast-message">${message}</span>
            </div>
        `;
        
        container.appendChild(toast);
        
        // Play sound effect based on type
        if (type === 'success') {
            this.playSound('success');
        } else if (type === 'error') {
            this.playSound('error');
        } else {
            this.playSound('notification');
        }
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
    
    addNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.insertBefore(notification, container.firstChild);
        
        // Keep only last 10 notifications
        while (container.children.length > 10) {
            container.removeChild(container.lastChild);
        }
    }
    
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toFixed(0);
    }
}

// Initialize game when page loads
const game = new ResourceTycoon();

