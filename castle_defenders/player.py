"""
Castle Defenders - Player Management
"""

import os
import json
import time
from typing import Dict, Optional
from .game_data import PERKS, xp_for_level


class CastlePlayer:
    """Represents a Castle Defenders player profile"""
    
    def __init__(self, player_id: str, name: str):
        self.id = player_id
        self.name = name
        self.xp = 0
        self.level = 1
        self.perk_points = 0
        self.perks: Dict[str, int] = {}
        self.total_games_played = 0
        self.total_waves_survived = 0
        self.total_enemies_killed = 0
        self.highest_wave = 0
        self.created_at = int(time.time() * 1000)
        self.socket_id: Optional[str] = None
    
    def get_stats(self) -> dict:
        """Calculate player's effective stats based on perks"""
        stats = {
            "towerDamageMultiplier": 1.0,
            "towerSpeedMultiplier": 1.0,
            "towerRangeMultiplier": 1.0,
            "startingGoldBonus": 0,
            "waveBonusMultiplier": 1.0,
            "killBonusMultiplier": 1.0,
            "castleHealthBonus": 0,
            "xpMultiplier": 1.0,
            "critChanceBonus": 0.0,
            "goldInterest": 0.0,
            "towerCostMultiplier": 1.0,
            "mineEfficiencyMultiplier": 1.0
        }
        
        for perk_id, level in self.perks.items():
            perk = PERKS.get(perk_id)
            if not perk:
                continue
            
            if perk_id == "towerDamage":
                stats["towerDamageMultiplier"] += level * perk["perLevel"]
            elif perk_id == "towerSpeed":
                stats["towerSpeedMultiplier"] += level * perk["perLevel"]
            elif perk_id == "towerRange":
                stats["towerRangeMultiplier"] += level * perk["perLevel"]
            elif perk_id == "startingGold":
                stats["startingGoldBonus"] += level * perk["perLevel"]
            elif perk_id == "waveBonus":
                stats["waveBonusMultiplier"] += level * perk["perLevel"]
            elif perk_id == "killBonus":
                stats["killBonusMultiplier"] += level * perk["perLevel"]
            elif perk_id == "castleHealth":
                stats["castleHealthBonus"] += level * perk["perLevel"]
            elif perk_id == "xpBonus":
                stats["xpMultiplier"] += level * perk["perLevel"]
            elif perk_id == "critChance":
                stats["critChanceBonus"] += level * perk["perLevel"]
            elif perk_id == "goldInterest":
                stats["goldInterest"] += level * perk["perLevel"]
            elif perk_id == "towerDiscount":
                stats["towerCostMultiplier"] -= level * perk["perLevel"]
            elif perk_id == "mineEfficiency":
                stats["mineEfficiencyMultiplier"] += level * perk["perLevel"]
        
        return stats
    
    def add_xp(self, amount: int) -> int:
        """Add XP and return number of levels gained"""
        self.xp += amount
        levels_gained = 0
        
        while self.xp >= xp_for_level(self.level + 1):
            self.xp -= xp_for_level(self.level + 1)
            self.level += 1
            self.perk_points += 1
            levels_gained += 1
        
        return levels_gained
    
    def buy_perk(self, perk_id: str) -> bool:
        """Buy a perk upgrade, returns success"""
        perk = PERKS.get(perk_id)
        if not perk:
            return False
        
        current_level = self.perks.get(perk_id, 0)
        if current_level >= perk["maxLevel"]:
            return False
        
        if self.perk_points < 1:
            return False
        
        self.perk_points -= 1
        self.perks[perk_id] = current_level + 1
        return True
    
    def to_dict(self) -> dict:
        """Convert to dictionary for serialization"""
        return {
            "id": self.id,
            "name": self.name,
            "xp": self.xp,
            "level": self.level,
            "perkPoints": self.perk_points,
            "perks": self.perks,
            "totalGamesPlayed": self.total_games_played,
            "totalWavesSurvived": self.total_waves_survived,
            "totalEnemiesKilled": self.total_enemies_killed,
            "highestWave": self.highest_wave,
            "createdAt": self.created_at
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'CastlePlayer':
        """Create player from dictionary"""
        player = cls(data["id"], data["name"])
        player.xp = data.get("xp", 0)
        player.level = data.get("level", 1)
        player.perk_points = data.get("perkPoints", 0)
        player.perks = data.get("perks", {})
        player.total_games_played = data.get("totalGamesPlayed", 0)
        player.total_waves_survived = data.get("totalWavesSurvived", 0)
        player.total_enemies_killed = data.get("totalEnemiesKilled", 0)
        player.highest_wave = data.get("highestWave", 0)
        player.created_at = data.get("createdAt", int(time.time() * 1000))
        return player


class CastlePlayerManager:
    """Manages Castle Defenders player persistence"""
    
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.players_file = os.path.join(data_dir, "castle_players.json")
        self.players: Dict[str, CastlePlayer] = {}
        self.socket_to_player: Dict[str, str] = {}  # socket_id -> player_id
        self._load_players()
    
    def _load_players(self):
        """Load players from file"""
        if os.path.exists(self.players_file):
            try:
                with open(self.players_file, 'r') as f:
                    data = json.load(f)
                    for player_id, player_data in data.items():
                        self.players[player_id] = CastlePlayer.from_dict(player_data)
            except Exception as e:
                print(f"Error loading castle players: {e}")
    
    def save_players(self):
        """Save all players to file"""
        os.makedirs(self.data_dir, exist_ok=True)
        try:
            data = {pid: player.to_dict() for pid, player in self.players.items()}
            with open(self.players_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving castle players: {e}")
    
    def get_or_create_player(self, player_id: str, name: str) -> CastlePlayer:
        """Get existing player or create new one"""
        if player_id in self.players:
            player = self.players[player_id]
            if name and name != player.name:
                player.name = name
        else:
            player = CastlePlayer(player_id, name or "Hero")
            self.players[player_id] = player
        
        self.save_players()
        return player
    
    def get_player(self, player_id: str) -> Optional[CastlePlayer]:
        """Get player by ID"""
        return self.players.get(player_id)
    
    def get_player_by_socket(self, socket_id: str) -> Optional[CastlePlayer]:
        """Get player by socket ID"""
        player_id = self.socket_to_player.get(socket_id)
        if player_id:
            return self.players.get(player_id)
        return None
    
    def connect_player(self, socket_id: str, player_id: str):
        """Associate socket with player"""
        self.socket_to_player[socket_id] = player_id
        player = self.players.get(player_id)
        if player:
            player.socket_id = socket_id
    
    def disconnect_player(self, socket_id: str):
        """Remove socket association"""
        player_id = self.socket_to_player.pop(socket_id, None)
        if player_id:
            player = self.players.get(player_id)
            if player:
                player.socket_id = None

