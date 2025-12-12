"""
Game State Manager
Central manager for all game state and player management
"""

import json
import os
import time
import hashlib
import uuid
from typing import Dict, Any, Optional, List
from .player import Player
from .data import RESOURCES, BASE_PRICES, BUILDINGS, RECIPES


class GameState:
    """Manages the overall game state"""
    
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.players: Dict[str, Player] = {}
        self.socket_to_player: Dict[str, str] = {}  # socket_id -> player_id
        self.username_to_player: Dict[str, str] = {}  # username_lower -> player_id
        
        # Chat history (last 100 messages)
        self.chat_history: List[Dict[str, Any]] = []
        self.max_chat_history = 100
        
        # Create data directory if needed
        os.makedirs(data_dir, exist_ok=True)
        
        # Load persisted data
        self.load_state()
    
    def _hash_password(self, password: str) -> str:
        """Hash a password for storage"""
        return hashlib.sha256(password.encode()).hexdigest()
    
    def register_player(self, socket_id: str, username: str, password: str) -> Dict[str, Any]:
        """Register a new player account"""
        username_lower = username.lower().strip()
        
        # Validate username
        if len(username) < 2 or len(username) > 20:
            return {"success": False, "message": "Username must be 2-20 characters"}
        
        if not username.replace("_", "").replace("-", "").isalnum():
            return {"success": False, "message": "Username can only contain letters, numbers, _ and -"}
        
        # Check if username already exists
        if username_lower in self.username_to_player:
            return {"success": False, "message": "Username already taken"}
        
        # Validate password
        if len(password) < 4:
            return {"success": False, "message": "Password must be at least 4 characters"}
        
        # Create new player with unique ID
        player_id = str(uuid.uuid4())[:8]
        password_hash = self._hash_password(password)
        
        player = Player(player_id, username, password_hash)
        player.socket_id = socket_id
        
        self.players[player_id] = player
        self.socket_to_player[socket_id] = player_id
        self.username_to_player[username_lower] = player_id
        
        self.save_player(player_id)
        
        return {"success": True, "player": player}
    
    def login_player(self, socket_id: str, username: str, password: str) -> Dict[str, Any]:
        """Login an existing player"""
        username_lower = username.lower().strip()
        
        # Find player by username
        player_id = self.username_to_player.get(username_lower)
        if not player_id:
            return {"success": False, "message": "User not found. Please register first."}
        
        player = self.players.get(player_id)
        if not player:
            return {"success": False, "message": "User not found"}
        
        # Check password
        password_hash = self._hash_password(password)
        if player.password_hash != password_hash:
            return {"success": False, "message": "Incorrect password"}
        
        # Update session
        player.socket_id = socket_id
        player.session_start = time.time()
        player.last_active = time.time()
        self.socket_to_player[socket_id] = player_id
        
        return {"success": True, "player": player}
    
    def create_player(self, socket_id: str, username: str) -> Player:
        """Create a new player or reconnect existing (legacy method for compatibility)"""
        # Check for existing player with same username
        username_lower = username.lower().strip()
        if username_lower in self.username_to_player:
            player_id = self.username_to_player[username_lower]
            player = self.players.get(player_id)
            if player:
                player.socket_id = socket_id
                player.session_start = time.time()
                player.last_active = time.time()
                self.socket_to_player[socket_id] = player_id
                return player
        
        # Create new player
        player_id = str(uuid.uuid4())[:8]
        player = Player(player_id, username)
        player.socket_id = socket_id
        
        self.players[player_id] = player
        self.socket_to_player[socket_id] = player_id
        self.username_to_player[username_lower] = player_id
        
        self.save_player(player_id)
        return player
    
    def add_chat_message(self, player_id: str, message: str) -> Dict[str, Any]:
        """Add a chat message"""
        player = self.players.get(player_id)
        if not player:
            return None
        
        # Sanitize message
        message = message.strip()[:200]  # Max 200 chars
        if not message:
            return None
        
        chat_msg = {
            "id": str(uuid.uuid4())[:8],
            "player_id": player_id,
            "username": player.username,
            "level": player.level,
            "message": message,
            "timestamp": time.time()
        }
        
        self.chat_history.append(chat_msg)
        
        # Keep only last N messages
        if len(self.chat_history) > self.max_chat_history:
            self.chat_history = self.chat_history[-self.max_chat_history:]
        
        return chat_msg
    
    def get_chat_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent chat messages"""
        return self.chat_history[-limit:]
    
    def get_player(self, socket_id: str) -> Optional[Player]:
        """Get player by socket ID"""
        player_id = self.socket_to_player.get(socket_id)
        if player_id:
            return self.players.get(player_id)
        return None
    
    def get_player_by_id(self, player_id: str) -> Optional[Player]:
        """Get player by player ID"""
        return self.players.get(player_id)
    
    def get_player_socket(self, player_id: str) -> Optional[str]:
        """Get socket ID for a player"""
        player = self.players.get(player_id)
        if player:
            return player.socket_id
        return None
    
    def remove_player(self, socket_id: str):
        """Remove player from active game"""
        player_id = self.socket_to_player.pop(socket_id, None)
        if player_id and player_id in self.players:
            self.save_player(player_id)
            # Don't delete - keep for reconnection
            # del self.players[player_id]
    
    def get_player_count(self) -> int:
        """Get number of active players"""
        return len(self.socket_to_player)
    
    def get_player_list(self, exclude_socket: str = None) -> List[Dict[str, Any]]:
        """Get list of players for trading"""
        players = []
        for pid, player in self.players.items():
            if player.socket_id != exclude_socket:
                players.append({
                    "id": pid,
                    "username": player.username,
                    "level": player.level,
                    "online": player.socket_id in self.socket_to_player.values()
                })
        return players
    
    def get_resource_definitions(self) -> Dict[str, Any]:
        """Get all resource definitions"""
        return RESOURCES
    
    def get_building_definitions(self) -> Dict[str, Any]:
        """Get all building definitions"""
        return BUILDINGS
    
    def get_recipe_definitions(self) -> Dict[str, Any]:
        """Get all recipe definitions"""
        return RECIPES
    
    # === Resource Actions ===
    
    def gather_resource(self, socket_id: str, resource_id: str) -> Dict[str, Any]:
        """Player gathers a resource"""
        player = self.get_player(socket_id)
        if not player:
            return {"success": False, "message": "Player not found"}
        
        result = player.gather_resource(resource_id)
        if result["success"]:
            self.save_player(player.id)
        return result
    
    # === Building Actions ===
    
    def buy_building(self, socket_id: str, building_id: str) -> Dict[str, Any]:
        """Player buys a building"""
        player = self.get_player(socket_id)
        if not player:
            return {"success": False, "message": "Player not found"}
        
        result = player.buy_building(building_id)
        if result["success"]:
            self.save_player(player.id)
        return result
    
    def upgrade_building(self, socket_id: str, building_id: str) -> Dict[str, Any]:
        """Player upgrades a building"""
        player = self.get_player(socket_id)
        if not player:
            return {"success": False, "message": "Player not found"}
        
        result = player.upgrade_building(building_id)
        if result["success"]:
            self.save_player(player.id)
        return result
    
    # === Crafting Actions ===
    
    def craft_item(self, socket_id: str, recipe_id: str, amount: int = 1) -> Dict[str, Any]:
        """Player starts crafting"""
        player = self.get_player(socket_id)
        if not player:
            return {"success": False, "message": "Player not found"}
        
        result = player.start_craft(recipe_id, amount)
        if result["success"]:
            self.save_player(player.id)
        return result
    
    # === Environment Actions ===
    
    def cleanup_pollution(self, socket_id: str) -> Dict[str, Any]:
        """Player cleans up pollution"""
        player = self.get_player(socket_id)
        if not player:
            return {"success": False, "message": "Player not found"}
        
        result = player.cleanup_pollution()
        if result["success"]:
            self.save_player(player.id)
        return result
    
    # === Trading Actions ===
    
    def execute_trade(self, from_player_id: str, to_player_id: str, 
                     offering: Dict[str, Any], requesting: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a trade between two players"""
        from_player = self.get_player_by_id(from_player_id)
        to_player = self.get_player_by_id(to_player_id)
        
        if not from_player or not to_player:
            return {"success": False, "message": "Player not found"}
        
        # Validate offering player has resources
        for res_id, amount in offering.get("resources", {}).items():
            if from_player.resources.get(res_id, 0) < amount:
                return {"success": False, "message": "Insufficient resources to offer"}
        
        if offering.get("money", 0) > from_player.money:
            return {"success": False, "message": "Insufficient money to offer"}
        
        # Validate requesting player has resources
        for res_id, amount in requesting.get("resources", {}).items():
            if to_player.resources.get(res_id, 0) < amount:
                return {"success": False, "message": "Trade partner has insufficient resources"}
        
        if requesting.get("money", 0) > to_player.money:
            return {"success": False, "message": "Trade partner has insufficient money"}
        
        # Execute trade - transfer from offering player
        for res_id, amount in offering.get("resources", {}).items():
            from_player.resources[res_id] -= amount
            to_player.resources[res_id] = to_player.resources.get(res_id, 0) + amount
        
        if offering.get("money", 0) > 0:
            from_player.money -= offering["money"]
            to_player.money += offering["money"]
        
        # Transfer from requesting player
        for res_id, amount in requesting.get("resources", {}).items():
            to_player.resources[res_id] -= amount
            from_player.resources[res_id] = from_player.resources.get(res_id, 0) + amount
        
        if requesting.get("money", 0) > 0:
            to_player.money -= requesting["money"]
            from_player.money += requesting["money"]
        
        # Stats
        from_player.stats["total_traded"] += 1
        to_player.stats["total_traded"] += 1
        
        self.save_player(from_player.id)
        self.save_player(to_player.id)
        
        return {
            "success": True,
            "from_resources": from_player.resources.copy(),
            "from_money": from_player.money,
            "to_resources": to_player.resources.copy(),
            "to_money": to_player.money
        }
    
    # === Game Tick Processing ===
    
    def process_tick(self) -> Dict[str, Dict[str, Any]]:
        """Process one game tick for all players"""
        updates = {}
        
        for player_id, player in self.players.items():
            # Only process active players (those with a connected socket)
            # Check if this player's socket_id exists as a KEY in socket_to_player
            if player.socket_id is None or player.socket_id not in self.socket_to_player:
                continue
            
            # Process building production
            production_update = player.process_production()
            
            # Check craft completion
            craft_update = player.check_craft_completion()
            
            # Include XP progress for real-time updates
            xp_progress = player.get_xp_progress()
            
            update = {
                "resources": player.resources.copy(),
                "money": player.money,
                "pollution": player.pollution,
                "eco_points": player.eco_points,
                "production_rates": player.get_production_rates(),
                "income_rate": player.get_income_rate(),
                "xp": player.xp,
                "level": player.level,
                "xp_progress": xp_progress,
                "time_played": player.get_time_played(),
                "time_played_formatted": player.format_time_played()
            }
            
            if production_update["income"] > 0 or production_update["produced"]:
                update["production"] = production_update
            
            if craft_update and craft_update.get("completed"):
                update["craft_completed"] = craft_update
            
            updates[player_id] = update
        
        return updates
    
    # === Persistence ===
    
    def save_player(self, player_id: str):
        """Save player data to disk"""
        player = self.players.get(player_id)
        if not player:
            return
        
        # Update session time before saving
        player.update_session()
        
        filepath = os.path.join(self.data_dir, f"player_{player_id}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(player.to_dict(include_private=True), f, indent=2)
    
    def load_player(self, player_id: str) -> Optional[Player]:
        """Load player data from disk"""
        filepath = os.path.join(self.data_dir, f"player_{player_id}.json")
        if not os.path.exists(filepath):
            return None
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        return Player.from_dict(data)
    
    def load_state(self):
        """Load all persisted state"""
        if not os.path.exists(self.data_dir):
            return
        
        # Load all player files
        for filename in os.listdir(self.data_dir):
            if filename.startswith("player_") and filename.endswith(".json"):
                player_id = filename[7:-5]  # Remove "player_" prefix and ".json" suffix
                player = self.load_player(player_id)
                if player:
                    self.players[player_id] = player
                    # Build username mapping
                    self.username_to_player[player.username.lower()] = player_id
    
    def save_all(self):
        """Save all game state"""
        for player_id in self.players:
            self.save_player(player_id)
    
    def check_username_exists(self, username: str) -> bool:
        """Check if a username is already registered"""
        return username.lower().strip() in self.username_to_player

