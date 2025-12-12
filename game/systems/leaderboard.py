"""
Leaderboard System
Tracks and ranks players across multiple categories
"""

from typing import Dict, Any, List


class LeaderboardSystem:
    """Manages multiple leaderboards"""
    
    def __init__(self, game_state):
        self.game_state = game_state
        
        # Leaderboard categories
        self.categories = {
            "wealth": {
                "name": "Wealthiest Tycoons",
                "description": "Ranked by total money",
                "icon": "💰",
                "sort_key": lambda p: p.money,
                "format": lambda v: f"${v:,.0f}"
            },
            "level": {
                "name": "Highest Level",
                "description": "Ranked by player level",
                "icon": "⭐",
                "sort_key": lambda p: p.level,
                "format": lambda v: f"Level {v}"
            },
            "production": {
                "name": "Production Kings",
                "description": "Ranked by total buildings owned",
                "icon": "🏭",
                "sort_key": lambda p: sum(b.get("count", 0) for b in p.buildings.values()),
                "format": lambda v: f"{v} buildings"
            },
            "trader": {
                "name": "Top Traders",
                "description": "Ranked by total trades completed",
                "icon": "🤝",
                "sort_key": lambda p: p.stats.get("total_traded", 0),
                "format": lambda v: f"{v} trades"
            },
            "gatherer": {
                "name": "Master Gatherers",
                "description": "Ranked by total resources gathered",
                "icon": "⛏️",
                "sort_key": lambda p: p.stats.get("total_gathered", 0),
                "format": lambda v: f"{v:,} resources"
            },
            "eco_warrior": {
                "name": "Eco Warriors",
                "description": "Ranked by eco points earned",
                "icon": "🌱",
                "sort_key": lambda p: p.eco_points,
                "format": lambda v: f"{v} eco points"
            },
            "time_played": {
                "name": "Most Dedicated",
                "description": "Ranked by total time played",
                "icon": "⏱️",
                "sort_key": lambda p: p.get_time_played(),
                "format": lambda v: self._format_time(v)
            }
        }
    
    def _format_time(self, seconds: int) -> str:
        """Format seconds as human readable time"""
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        if hours > 0:
            return f"{hours}h {minutes}m"
        return f"{minutes}m"
    
    def get_leaderboard(self, category: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get leaderboard for a specific category"""
        if category not in self.categories:
            return []
        
        cat_info = self.categories[category]
        players = list(self.game_state.players.values())
        
        # Sort by category
        sorted_players = sorted(players, key=cat_info["sort_key"], reverse=True)
        
        # Build leaderboard
        leaderboard = []
        for rank, player in enumerate(sorted_players[:limit], 1):
            value = cat_info["sort_key"](player)
            leaderboard.append({
                "rank": rank,
                "player_id": player.id,
                "username": player.username,
                "level": player.level,
                "value": value,
                "formatted_value": cat_info["format"](value),
                "online": player.socket_id in self.game_state.socket_to_player.values()
            })
        
        return leaderboard
    
    def get_all(self, limit: int = 10) -> Dict[str, Any]:
        """Get all leaderboards"""
        result = {}
        
        for category_id, category_info in self.categories.items():
            result[category_id] = {
                "name": category_info["name"],
                "description": category_info["description"],
                "icon": category_info["icon"],
                "rankings": self.get_leaderboard(category_id, limit)
            }
        
        return result
    
    def get_player_ranks(self, player_id: str) -> Dict[str, Any]:
        """Get a player's rank in each category"""
        player = self.game_state.get_player_by_id(player_id)
        if not player:
            return {}
        
        ranks = {}
        players = list(self.game_state.players.values())
        
        for category_id, category_info in self.categories.items():
            sorted_players = sorted(players, key=category_info["sort_key"], reverse=True)
            
            for rank, p in enumerate(sorted_players, 1):
                if p.id == player_id:
                    value = category_info["sort_key"](player)
                    ranks[category_id] = {
                        "rank": rank,
                        "total_players": len(players),
                        "value": value,
                        "formatted_value": category_info["format"](value)
                    }
                    break
        
        return ranks
    
    def get_top_player(self, category: str) -> Dict[str, Any]:
        """Get the #1 player in a category"""
        leaderboard = self.get_leaderboard(category, 1)
        if leaderboard:
            return leaderboard[0]
        return None

