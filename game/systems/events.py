"""
Events System
Random events and daily/weekly challenges
"""

import random
import time
from typing import Dict, Any, List, Optional
from ..data import RESOURCES, BUILDINGS


class EventSystem:
    """Manages random events and challenges"""
    
    def __init__(self, game_state, socketio=None):
        self.game_state = game_state
        self.socketio = socketio
        
        # Active global event
        self.current_event: Optional[Dict[str, Any]] = None
        self.event_end_time: float = 0
        
        # Daily challenges (reset every 24 hours)
        self.daily_challenges: List[Dict[str, Any]] = []
        self.daily_reset_time: float = 0
        
        # Weekly challenges (reset every 7 days)
        self.weekly_challenges: List[Dict[str, Any]] = []
        self.weekly_reset_time: float = 0
        
        # Event definitions
        self.event_types = [
            {
                "id": "market_crash",
                "name": "Market Crash",
                "description": "Resource prices have plummeted!",
                "icon": "📉",
                "duration": 300,  # 5 minutes
                "effect": "market_crash",
                "weight": 10
            },
            {
                "id": "market_boom",
                "name": "Market Boom",
                "description": "Prices are soaring! Sell now!",
                "icon": "📈",
                "duration": 300,
                "effect": "market_boom",
                "weight": 10
            },
            {
                "id": "resource_shortage",
                "name": "Resource Shortage",
                "description": "A shortage has driven up prices for basic resources!",
                "icon": "⚠️",
                "duration": 180,
                "effect": "shortage",
                "affected_resources": ["wood", "stone", "coal", "iron_ore"],
                "weight": 15
            },
            {
                "id": "oil_crisis",
                "name": "Oil Crisis",
                "description": "Oil and gasoline prices have skyrocketed!",
                "icon": "🛢️",
                "duration": 240,
                "effect": "shortage",
                "affected_resources": ["oil", "gasoline", "plastic"],
                "weight": 10
            },
            {
                "id": "tech_boom",
                "name": "Tech Boom",
                "description": "Electronics are in high demand!",
                "icon": "💻",
                "duration": 300,
                "effect": "boom",
                "affected_resources": ["circuit", "electronics", "battery"],
                "weight": 8
            },
            {
                "id": "double_xp",
                "name": "Double XP Event",
                "description": "All activities grant double XP!",
                "icon": "⭐",
                "duration": 600,
                "effect": "double_xp",
                "weight": 5
            },
            {
                "id": "production_boost",
                "name": "Production Surge",
                "description": "All buildings produce 50% faster!",
                "icon": "⚡",
                "duration": 300,
                "effect": "production_boost",
                "weight": 8
            },
            {
                "id": "pollution_spike",
                "name": "Environmental Crisis",
                "description": "Pollution levels are rising rapidly!",
                "icon": "🏭",
                "duration": 180,
                "effect": "pollution_spike",
                "weight": 12
            },
            {
                "id": "lucky_finds",
                "name": "Lucky Prospecting",
                "description": "Gatherers are finding bonus resources!",
                "icon": "🍀",
                "duration": 300,
                "effect": "gather_bonus",
                "weight": 10
            }
        ]
        
        # Challenge templates
        self.challenge_templates = [
            {
                "type": "gather",
                "name": "Gatherer",
                "description": "Gather {amount} {resource}",
                "resources": ["wood", "stone", "coal", "iron_ore", "copper_ore", "oil"],
                "amounts": [50, 100, 200, 500],
                "rewards": {"money": [100, 250, 500, 1000], "xp": [50, 100, 200, 400]}
            },
            {
                "type": "sell",
                "name": "Merchant",
                "description": "Sell {amount} {resource} on the market",
                "resources": ["wood", "plank", "stone", "brick", "iron", "steel"],
                "amounts": [25, 50, 100, 200],
                "rewards": {"money": [150, 300, 600, 1200], "xp": [75, 150, 300, 600]}
            },
            {
                "type": "craft",
                "name": "Crafter",
                "description": "Craft {amount} items",
                "amounts": [5, 10, 20, 50],
                "rewards": {"money": [200, 400, 800, 2000], "xp": [100, 200, 400, 1000]}
            },
            {
                "type": "earn",
                "name": "Tycoon",
                "description": "Earn ${amount} from passive income",
                "amounts": [500, 1000, 5000, 10000],
                "rewards": {"money": [100, 200, 500, 1000], "xp": [100, 200, 500, 1000]}
            },
            {
                "type": "build",
                "name": "Constructor",
                "description": "Purchase {amount} buildings",
                "amounts": [1, 3, 5, 10],
                "rewards": {"money": [300, 600, 1000, 2500], "xp": [150, 300, 500, 1250]}
            },
            {
                "type": "trade",
                "name": "Trader",
                "description": "Complete {amount} player trades",
                "amounts": [1, 3, 5, 10],
                "rewards": {"money": [200, 500, 1000, 2000], "xp": [100, 250, 500, 1000]}
            },
            {
                "type": "auction",
                "name": "Auctioneer",
                "description": "Win {amount} auctions",
                "amounts": [1, 2, 3, 5],
                "rewards": {"money": [300, 600, 1000, 2000], "xp": [150, 300, 500, 1000]}
            }
        ]
        
        # Initialize challenges
        self._generate_challenges()
    
    def _generate_challenges(self):
        """Generate new daily and weekly challenges"""
        current_time = time.time()
        
        # Check if daily reset needed
        if current_time >= self.daily_reset_time:
            self.daily_challenges = self._create_challenges(3, "daily")
            # Reset at midnight UTC (approximately)
            self.daily_reset_time = current_time + 86400  # 24 hours
        
        # Check if weekly reset needed
        if current_time >= self.weekly_reset_time:
            self.weekly_challenges = self._create_challenges(2, "weekly")
            self.weekly_reset_time = current_time + 604800  # 7 days
    
    def _create_challenges(self, count: int, difficulty: str) -> List[Dict[str, Any]]:
        """Create random challenges"""
        challenges = []
        used_types = set()
        
        difficulty_index = 1 if difficulty == "daily" else 2
        
        for i in range(count):
            # Pick random template (avoid duplicates)
            available = [t for t in self.challenge_templates if t["type"] not in used_types]
            if not available:
                available = self.challenge_templates
            
            template = random.choice(available)
            used_types.add(template["type"])
            
            # Create challenge
            challenge = {
                "id": f"{difficulty}_{template['type']}_{i}",
                "type": template["type"],
                "name": template["name"],
                "difficulty": difficulty,
                "created_at": time.time()
            }
            
            # Set target amount
            amount_index = min(difficulty_index, len(template["amounts"]) - 1)
            challenge["target"] = template["amounts"][amount_index]
            
            # Set rewards
            challenge["rewards"] = {
                "money": template["rewards"]["money"][amount_index],
                "xp": template["rewards"]["xp"][amount_index]
            }
            
            # Set resource if applicable
            if "resources" in template:
                resource_id = random.choice(template["resources"])
                resource_name = RESOURCES.get(resource_id, {}).get("name", resource_id)
                challenge["resource"] = resource_id
                challenge["description"] = template["description"].format(
                    amount=challenge["target"],
                    resource=resource_name
                )
            else:
                challenge["description"] = template["description"].format(
                    amount=challenge["target"]
                )
            
            # Weekly challenges have bonus rewards
            if difficulty == "weekly":
                challenge["rewards"]["money"] *= 3
                challenge["rewards"]["xp"] *= 2
            
            challenges.append(challenge)
        
        return challenges
    
    def check_for_event(self) -> Optional[Dict[str, Any]]:
        """Check if a random event should trigger"""
        current_time = time.time()
        
        # Don't trigger if event is active
        if self.current_event and current_time < self.event_end_time:
            return None
        
        # Random chance for event (25% per check for more frequent events)
        if random.random() > 0.25:
            return None
        
        # Select event based on weights
        total_weight = sum(e["weight"] for e in self.event_types)
        roll = random.uniform(0, total_weight)
        
        cumulative = 0
        selected_event = None
        for event_type in self.event_types:
            cumulative += event_type["weight"]
            if roll <= cumulative:
                selected_event = event_type
                break
        
        if not selected_event:
            return None
        
        # Activate event
        self.current_event = {
            **selected_event,
            "started_at": current_time
        }
        self.event_end_time = current_time + selected_event["duration"]
        
        return self.current_event
    
    def get_current_event(self) -> Optional[Dict[str, Any]]:
        """Get the currently active event"""
        if self.current_event and time.time() < self.event_end_time:
            event_copy = self.current_event.copy()
            event_copy["time_remaining"] = self.event_end_time - time.time()
            return event_copy
        return None
    
    def get_current_challenges(self, socket_id: str) -> Dict[str, Any]:
        """Get current challenges with player progress"""
        player = self.game_state.get_player(socket_id)
        if not player:
            return {"daily": [], "weekly": []}
        
        self._generate_challenges()  # Ensure challenges are up to date
        
        def add_progress(challenges):
            result = []
            for challenge in challenges:
                c = challenge.copy()
                progress = player.challenge_progress.get(c["id"], 0)
                c["progress"] = min(progress, c["target"])
                c["completed"] = progress >= c["target"]
                c["claimed"] = c["id"] in player.completed_challenges
                result.append(c)
            return result
        
        return {
            "daily": add_progress(self.daily_challenges),
            "weekly": add_progress(self.weekly_challenges),
            "daily_reset": self.daily_reset_time,
            "weekly_reset": self.weekly_reset_time,
            "event": self.get_current_event()
        }
    
    def update_challenge_progress(self, socket_id: str, challenge_type: str, 
                                  amount: int = 1, resource: str = None):
        """Update player progress on challenges"""
        player = self.game_state.get_player(socket_id)
        if not player:
            return
        
        all_challenges = self.daily_challenges + self.weekly_challenges
        
        for challenge in all_challenges:
            if challenge["type"] != challenge_type:
                continue
            
            # Check resource match if required
            if "resource" in challenge and resource != challenge["resource"]:
                continue
            
            # Update progress
            current = player.challenge_progress.get(challenge["id"], 0)
            player.challenge_progress[challenge["id"]] = current + amount
    
    def claim_challenge(self, socket_id: str, challenge_id: str) -> Dict[str, Any]:
        """Claim rewards for a completed challenge"""
        player = self.game_state.get_player(socket_id)
        if not player:
            return {"success": False, "message": "Player not found"}
        
        # Find challenge
        all_challenges = self.daily_challenges + self.weekly_challenges
        challenge = next((c for c in all_challenges if c["id"] == challenge_id), None)
        
        if not challenge:
            return {"success": False, "message": "Challenge not found"}
        
        if challenge_id in player.completed_challenges:
            return {"success": False, "message": "Already claimed"}
        
        progress = player.challenge_progress.get(challenge_id, 0)
        if progress < challenge["target"]:
            return {"success": False, "message": "Challenge not completed"}
        
        # Give rewards
        player.money += challenge["rewards"]["money"]
        player.add_xp(challenge["rewards"]["xp"])
        player.completed_challenges.append(challenge_id)
        
        self.game_state.save_player(player.id)
        
        return {
            "success": True,
            "rewards": challenge["rewards"],
            "money": player.money,
            "xp": player.xp,
            "level": player.level
        }
    
    def is_event_active(self, effect_type: str) -> bool:
        """Check if an event with specific effect is active"""
        event = self.get_current_event()
        if event and event.get("effect") == effect_type:
            return True
        return False
    
    def get_event_multiplier(self, effect_type: str) -> float:
        """Get multiplier for an event effect"""
        if not self.is_event_active(effect_type):
            return 1.0
        
        multipliers = {
            "double_xp": 2.0,
            "production_boost": 1.5,
            "gather_bonus": 1.5,
            "pollution_spike": 2.0
        }
        return multipliers.get(effect_type, 1.0)

