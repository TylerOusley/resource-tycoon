"""
Player class for Resource Tycoon
Manages individual player state, resources, and progression
"""

import time
import math
from typing import Dict, Any, Optional
from .data import RESOURCES, BUILDINGS, RECIPES


class Player:
    """Represents a player in the game"""
    
    def __init__(self, player_id: str, username: str, password_hash: str = None):
        self.id = player_id
        self.username = username
        self.password_hash = password_hash  # For login persistence
        self.socket_id = player_id
        self.created_at = time.time()
        self.last_active = time.time()
        
        # Time tracking
        self.total_time_played = 0  # Total seconds played
        self.session_start = time.time()  # Current session start
        
        # Tutorial
        self.tutorial_completed = False
        self.tutorial_step = 0
        
        # Currency
        self.money = 100  # Starting money
        
        # Experience and leveling
        self.xp = 0
        self.level = 1
        
        # Resources inventory
        self.resources: Dict[str, int] = {}
        
        # Fractional resources (for smooth per-second production)
        self.resource_fractions: Dict[str, float] = {}
        self.money_fractions: float = 0.0
        
        # Owned buildings: {building_id: {"level": int, "count": int, "last_produced": float}}
        self.buildings: Dict[str, Dict[str, Any]] = {}
        
        # Active crafting: {"recipe_id": str, "start_time": float, "amount": int}
        self.active_craft: Optional[Dict[str, Any]] = None
        
        # Gathering cooldowns: {resource_id: last_gather_time}
        self.gather_cooldowns: Dict[str, float] = {}
        
        # Environment
        self.pollution = 0
        self.eco_points = 0
        
        # Eco upgrades purchased
        self.eco_upgrades: list = []
        
        # Statistics
        self.stats = {
            "total_gathered": 0,
            "total_crafted": 0,
            "total_sold": 0,
            "total_bought": 0,
            "total_traded": 0,
            "buildings_purchased": 0,
            "auctions_won": 0,
            "auctions_created": 0
        }
        
        # Challenges progress
        self.challenge_progress: Dict[str, Any] = {}
        self.completed_challenges: list = []
    
    def get_time_played(self) -> int:
        """Get total time played including current session"""
        current_session = time.time() - self.session_start
        return int(self.total_time_played + current_session)
    
    def update_session(self):
        """Update total time played when saving"""
        current_session = time.time() - self.session_start
        self.total_time_played += current_session
        self.session_start = time.time()
    
    def format_time_played(self) -> str:
        """Format time played as human readable string"""
        total_seconds = self.get_time_played()
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        if hours > 0:
            return f"{hours}h {minutes}m"
        return f"{minutes}m"
    
    # Maximum level cap
    MAX_LEVEL = 40
    
    def get_xp_threshold(self, level: int) -> int:
        """Get total XP required to reach a specific level"""
        if level <= 1:
            return 0
        # XP needed for each level: 100 * level^1.5
        # Total XP for level N = sum of XP for levels 1 to N-1
        return sum(int(100 * (l ** 1.5)) for l in range(1, level))
    
    def get_level_from_xp(self) -> int:
        """Calculate level from total XP"""
        level = 1
        while self.xp >= self.get_xp_threshold(level + 1):
            level += 1
            # Cap at max level
            if level >= self.MAX_LEVEL:
                break
        return level
    
    def add_xp(self, amount: int) -> Dict[str, Any]:
        """Add XP and check for level up"""
        old_level = self.level
        self.xp += amount
        self.level = self.get_level_from_xp()
        
        leveled_up = self.level > old_level
        return {
            "xp": self.xp,
            "level": self.level,
            "leveled_up": leveled_up,
            "levels_gained": self.level - old_level if leveled_up else 0,
            "max_level": self.level >= self.MAX_LEVEL
        }
    
    def get_xp_for_next_level(self) -> int:
        """Get XP remaining until next level (0 if at max)"""
        if self.level >= self.MAX_LEVEL:
            return 0
        next_level_threshold = self.get_xp_threshold(self.level + 1)
        return max(0, next_level_threshold - self.xp)
    
    def get_xp_progress(self) -> Dict[str, int]:
        """Get current XP progress within the current level"""
        # At max level, show full bar
        if self.level >= self.MAX_LEVEL:
            return {
                "current": 1,
                "needed": 1,
                "total_xp": self.xp,
                "max_level": True
            }
        
        current_threshold = self.get_xp_threshold(self.level)
        next_threshold = self.get_xp_threshold(self.level + 1)
        xp_in_level = self.xp - current_threshold
        xp_needed = next_threshold - current_threshold
        return {
            "current": xp_in_level,
            "needed": xp_needed,
            "total_xp": self.xp,
            "max_level": False
        }
    
    def can_gather(self, resource_id: str) -> Dict[str, Any]:
        """Check if player can gather a resource"""
        if resource_id not in RESOURCES:
            return {"can": False, "reason": "Unknown resource"}
        
        resource = RESOURCES[resource_id]
        
        # Check level requirement
        if self.level < resource.get("unlock_level", 1):
            return {"can": False, "reason": f"Requires level {resource['unlock_level']}"}
        
        # Check if it's a gatherable resource
        if "base_gather_time" not in resource:
            return {"can": False, "reason": "This resource cannot be gathered directly"}
        
        # Check cooldown
        last_gather = self.gather_cooldowns.get(resource_id, 0)
        cooldown = resource["base_gather_time"]
        time_since = time.time() - last_gather
        
        if time_since < cooldown:
            return {
                "can": False, 
                "reason": "Still cooling down",
                "remaining": cooldown - time_since
            }
        
        return {"can": True}
    
    def gather_resource(self, resource_id: str) -> Dict[str, Any]:
        """Gather a resource"""
        check = self.can_gather(resource_id)
        if not check["can"]:
            return {"success": False, "message": check["reason"]}
        
        resource = RESOURCES[resource_id]
        amount = resource["base_gather_amount"]
        
        # Apply pollution effect (reduces gathering efficiency)
        if self.pollution > 50:
            pollution_penalty = min(0.5, (self.pollution - 50) / 100)
            amount = max(1, int(amount * (1 - pollution_penalty)))
        
        # Add resource
        self.resources[resource_id] = self.resources.get(resource_id, 0) + amount
        
        # Update cooldown
        self.gather_cooldowns[resource_id] = time.time()
        
        # Add pollution if applicable
        if "pollution_per_gather" in resource:
            self.pollution += resource["pollution_per_gather"]
        
        # Stats and XP
        self.stats["total_gathered"] += amount
        xp_result = self.add_xp(resource.get("tier", 1) * 2)
        
        self.last_active = time.time()
        
        return {
            "success": True,
            "resource_id": resource_id,
            "amount": amount,
            "player_resources": self.resources.copy(),
            "xp": xp_result["xp"],
            "level": xp_result["level"],
            "leveled_up": xp_result["leveled_up"]
        }
    
    def can_buy_building(self, building_id: str) -> Dict[str, Any]:
        """Check if player can buy a building"""
        if building_id not in BUILDINGS:
            return {"can": False, "reason": "Unknown building"}
        
        building = BUILDINGS[building_id]
        
        # Check level requirement
        if self.level < building.get("unlock_level", 1):
            return {"can": False, "reason": f"Requires level {building['unlock_level']}"}
        
        # Check money
        if self.money < building["cost"]:
            return {"can": False, "reason": f"Not enough money (need ${building['cost']})"}
        
        # Check resource costs
        for res_id, amount in building.get("cost_resources", {}).items():
            if self.resources.get(res_id, 0) < amount:
                return {
                    "can": False, 
                    "reason": f"Not enough {RESOURCES.get(res_id, {}).get('name', res_id)} (need {amount})"
                }
        
        return {"can": True}
    
    def buy_building(self, building_id: str, amount: int = 1) -> Dict[str, Any]:
        """Purchase buildings (supports bulk purchase)"""
        if building_id not in BUILDINGS:
            return {"success": False, "message": "Unknown building"}
        
        building = BUILDINGS[building_id]
        
        # Check level requirement
        if self.level < building.get("unlock_level", 1):
            return {"success": False, "message": f"Requires level {building['unlock_level']}"}
        
        # Calculate how many we can actually afford
        amount = max(1, min(amount, 10000))  # Safety limit
        
        cost_per_building = building["cost"]
        resource_costs = building.get("cost_resources", {})
        
        # Calculate max affordable by money
        max_by_money = int(self.money // cost_per_building) if cost_per_building > 0 else amount
        
        # Calculate max affordable by resources
        max_by_resources = amount
        for res_id, res_amount in resource_costs.items():
            owned = self.resources.get(res_id, 0)
            max_for_this = int(owned // res_amount) if res_amount > 0 else amount
            max_by_resources = min(max_by_resources, max_for_this)
        
        # Actual amount we can buy
        actual_amount = min(amount, max_by_money, max_by_resources)
        
        if actual_amount <= 0:
            return {"success": False, "message": "Cannot afford any buildings"}
        
        # Deduct costs in bulk
        total_money_cost = cost_per_building * actual_amount
        self.money -= total_money_cost
        
        for res_id, res_amount in resource_costs.items():
            self.resources[res_id] -= res_amount * actual_amount
        
        # Add buildings
        if building_id not in self.buildings:
            self.buildings[building_id] = {
                "level": 1,
                "count": 0,
                "last_produced": time.time()
            }
        
        self.buildings[building_id]["count"] += actual_amount
        
        # Stats
        self.stats["buildings_purchased"] += actual_amount
        self.add_xp(building.get("tier", 1) * 10 * actual_amount)
        
        self.last_active = time.time()
        
        return {
            "success": True,
            "building_id": building_id,
            "bought": actual_amount,
            "player_buildings": self.get_buildings_state(),
            "player_resources": self.resources.copy(),
            "money": self.money
        }
    
    def can_upgrade_building(self, building_id: str) -> Dict[str, Any]:
        """Check if player can upgrade a building"""
        if building_id not in self.buildings:
            return {"can": False, "reason": "You don't own this building"}
        
        building_def = BUILDINGS[building_id]
        current_level = self.buildings[building_id]["level"]
        
        if current_level >= building_def["max_level"]:
            return {"can": False, "reason": "Building is at max level"}
        
        # Calculate upgrade cost
        upgrade_cost = int(building_def["cost"] * (building_def["upgrade_cost_multiplier"] ** current_level))
        
        if self.money < upgrade_cost:
            return {"can": False, "reason": f"Not enough money (need ${upgrade_cost})"}
        
        return {"can": True, "cost": upgrade_cost}
    
    def upgrade_building(self, building_id: str) -> Dict[str, Any]:
        """Upgrade a building"""
        check = self.can_upgrade_building(building_id)
        if not check["can"]:
            return {"success": False, "message": check["reason"]}
        
        self.money -= check["cost"]
        self.buildings[building_id]["level"] += 1
        
        self.add_xp(BUILDINGS[building_id].get("tier", 1) * 15)
        
        self.last_active = time.time()
        
        return {
            "success": True,
            "building_id": building_id,
            "new_level": self.buildings[building_id]["level"],
            "player_buildings": self.get_buildings_state(),
            "money": self.money
        }
    
    def process_production(self) -> Dict[str, Any]:
        """Process all building production for one tick (every second)"""
        produced_resources = {}
        income = 0.0
        pollution_generated = 0
        eco_earned = 0
        
        # Initialize resource fractions tracker if needed
        if not hasattr(self, 'resource_fractions'):
            self.resource_fractions = {}
        if not hasattr(self, 'money_fractions'):
            self.money_fractions = 0.0
        
        current_time = time.time()
        
        for building_id, building_state in self.buildings.items():
            building_def = BUILDINGS[building_id]
            production_time = building_def["production_time"]
            
            # Calculate production multiplier from level
            level_multiplier = 1 + (building_state["level"] - 1) * building_def["production_multiplier_per_level"]
            
            # Calculate per-second production rate
            consumes = building_def.get("consumes", {})
            produces = building_def.get("produces", {})
            
            # Check if we have resources to consume (for buildings that need input)
            can_produce = True
            if consumes:
                for res_id, amount in consumes.items():
                    # Amount consumed per second
                    consume_per_sec = (amount * building_state["count"]) / production_time
                    if self.resources.get(res_id, 0) + self.resource_fractions.get(res_id, 0) < consume_per_sec:
                        can_produce = False
                        break
            
            if can_produce:
                # Consume resources (fractionally per second)
                for res_id, amount in consumes.items():
                    consume_per_sec = (amount * building_state["count"]) / production_time
                    self.resource_fractions[res_id] = self.resource_fractions.get(res_id, 0) - consume_per_sec
                
                # Produce resources (fractionally per second)
                for res_id, amount in produces.items():
                    produce_per_sec = (amount * building_state["count"] * level_multiplier) / production_time
                    self.resource_fractions[res_id] = self.resource_fractions.get(res_id, 0) + produce_per_sec
                    produced_resources[res_id] = produced_resources.get(res_id, 0) + produce_per_sec
                
                # Generate passive income (per second)
                if "passive_income" in building_def:
                    income_per_sec = (building_def["passive_income"] * building_state["count"] * level_multiplier) / production_time
                    income += income_per_sec
                
                # Generate pollution (per second)
                if building_def.get("pollution", 0) > 0:
                    pollution_generated += building_def["pollution"] * building_state["count"] / production_time
                
                # Generate eco points (per second)
                if building_def.get("eco_points", 0) > 0:
                    eco_earned += building_def["eco_points"] * building_state["count"] / production_time
        
        # Convert accumulated fractions to whole numbers
        for res_id in list(self.resource_fractions.keys()):
            fraction = self.resource_fractions[res_id]
            if fraction >= 1:
                whole = int(fraction)
                self.resources[res_id] = self.resources.get(res_id, 0) + whole
                self.resource_fractions[res_id] -= whole
            elif fraction <= -1:
                whole = int(fraction)
                self.resources[res_id] = max(0, self.resources.get(res_id, 0) + whole)
                self.resource_fractions[res_id] -= whole
        
        # Apply income (accumulate fractions)
        self.money_fractions += income
        if self.money_fractions >= 1:
            whole_money = int(self.money_fractions)
            self.money += whole_money
            self.money_fractions -= whole_money
        
        # Apply pollution (with decay)
        self.pollution = max(0, self.pollution + pollution_generated - 0.1)
        
        # Apply eco points
        self.eco_points += eco_earned
        
        return {
            "produced": produced_resources,
            "income": income,
            "money": self.money,
            "resources": self.resources.copy(),
            "pollution": self.pollution,
            "eco_points": self.eco_points
        }
    
    def get_production_rates(self) -> Dict[str, float]:
        """Calculate production rates per second for all resources"""
        rates = {}
        
        for building_id, building_state in self.buildings.items():
            building_def = BUILDINGS[building_id]
            
            # Calculate production multiplier from level
            level_multiplier = 1 + (building_state["level"] - 1) * building_def["production_multiplier_per_level"]
            
            # Calculate per-second rate
            production_time = building_def["production_time"]
            
            # Add production rates
            for res_id, amount in building_def.get("produces", {}).items():
                rate_per_second = (amount * building_state["count"] * level_multiplier) / production_time
                rates[res_id] = rates.get(res_id, 0) + rate_per_second
            
            # Subtract consumption rates
            for res_id, amount in building_def.get("consumes", {}).items():
                rate_per_second = (amount * building_state["count"]) / production_time
                rates[res_id] = rates.get(res_id, 0) - rate_per_second
        
        return rates
    
    def get_income_rate(self) -> float:
        """Calculate income per second from all buildings"""
        income_per_second = 0
        
        for building_id, building_state in self.buildings.items():
            building_def = BUILDINGS[building_id]
            
            if "passive_income" in building_def:
                level_multiplier = 1 + (building_state["level"] - 1) * building_def["production_multiplier_per_level"]
                production_time = building_def["production_time"]
                income_per_second += (building_def["passive_income"] * building_state["count"] * level_multiplier) / production_time
        
        return income_per_second
    
    def can_craft(self, recipe_id: str, amount: int = 1) -> Dict[str, Any]:
        """Check if player can craft a recipe"""
        if recipe_id not in RECIPES:
            return {"can": False, "reason": "Unknown recipe"}
        
        recipe = RECIPES[recipe_id]
        
        # Check level requirement
        if self.level < recipe.get("unlock_level", 1):
            return {"can": False, "reason": f"Requires level {recipe['unlock_level']}"}
        
        # Check if already crafting
        if self.active_craft is not None:
            return {"can": False, "reason": "Already crafting something"}
        
        # Check input resources
        for res_id, req_amount in recipe["inputs"].items():
            if self.resources.get(res_id, 0) < req_amount * amount:
                return {
                    "can": False,
                    "reason": f"Not enough {RESOURCES.get(res_id, {}).get('name', res_id)}"
                }
        
        return {"can": True}
    
    def start_craft(self, recipe_id: str, amount: int = 1) -> Dict[str, Any]:
        """Start crafting a recipe"""
        check = self.can_craft(recipe_id, amount)
        if not check["can"]:
            return {"success": False, "message": check["reason"]}
        
        recipe = RECIPES[recipe_id]
        
        # Deduct input resources
        for res_id, req_amount in recipe["inputs"].items():
            self.resources[res_id] -= req_amount * amount
        
        # Start crafting
        self.active_craft = {
            "recipe_id": recipe_id,
            "start_time": time.time(),
            "amount": amount,
            "duration": recipe["craft_time"] * amount
        }
        
        self.last_active = time.time()
        
        return {
            "success": True,
            "recipe_id": recipe_id,
            "duration": self.active_craft["duration"],
            "player_resources": self.resources.copy()
        }
    
    def check_craft_completion(self) -> Optional[Dict[str, Any]]:
        """Check if active craft is complete"""
        if self.active_craft is None:
            return None
        
        elapsed = time.time() - self.active_craft["start_time"]
        if elapsed >= self.active_craft["duration"]:
            recipe = RECIPES[self.active_craft["recipe_id"]]
            amount = self.active_craft["amount"]
            
            # Add output resources
            for res_id, out_amount in recipe["outputs"].items():
                self.resources[res_id] = self.resources.get(res_id, 0) + out_amount * amount
            
            # Stats and XP
            self.stats["total_crafted"] += amount
            xp_result = self.add_xp(recipe.get("xp_reward", 5) * amount)
            
            result = {
                "completed": True,
                "recipe_id": self.active_craft["recipe_id"],
                "outputs": {k: v * amount for k, v in recipe["outputs"].items()},
                "player_resources": self.resources.copy(),
                "xp": xp_result["xp"],
                "level": xp_result["level"]
            }
            
            self.active_craft = None
            return result
        
        return {
            "completed": False,
            "progress": elapsed / self.active_craft["duration"],
            "remaining": self.active_craft["duration"] - elapsed
        }
    
    def cleanup_pollution(self, cost_per_point: int = 50) -> Dict[str, Any]:
        """Pay to clean up pollution"""
        if self.pollution <= 0:
            return {"success": False, "message": "No pollution to clean"}
        
        cleanup_amount = min(10, self.pollution)
        cost = cleanup_amount * cost_per_point
        
        if self.money < cost:
            return {"success": False, "message": f"Not enough money (need ${cost})"}
        
        self.money -= cost
        self.pollution -= cleanup_amount
        
        return {
            "success": True,
            "cleaned": cleanup_amount,
            "pollution": self.pollution,
            "money": self.money
        }
    
    def get_buildings_state(self) -> Dict[str, Any]:
        """Get current buildings state with calculated values"""
        state = {}
        for building_id, building_state in self.buildings.items():
            building_def = BUILDINGS[building_id]
            level_multiplier = 1 + (building_state["level"] - 1) * building_def["production_multiplier_per_level"]
            
            state[building_id] = {
                **building_state,
                "definition": building_def,
                "effective_production": {
                    k: int(v * building_state["count"] * level_multiplier)
                    for k, v in building_def.get("produces", {}).items()
                },
                "effective_income": int(building_def.get("passive_income", 0) * building_state["count"] * level_multiplier)
            }
        return state
    
    def to_dict(self, include_private: bool = False) -> Dict[str, Any]:
        """Serialize player to dictionary"""
        xp_progress = self.get_xp_progress()
        data = {
            "id": self.id,
            "username": self.username,
            "money": self.money,
            "xp": self.xp,
            "level": self.level,
            "xp_for_next": self.get_xp_for_next_level(),
            "xp_progress": xp_progress,
            "resources": self.resources,
            "buildings": self.get_buildings_state(),
            "pollution": self.pollution,
            "eco_points": self.eco_points,
            "stats": self.stats,
            "active_craft": self.active_craft,
            "time_played": self.get_time_played(),
            "time_played_formatted": self.format_time_played(),
            "tutorial_completed": self.tutorial_completed,
            "tutorial_step": self.tutorial_step,
            "created_at": self.created_at,
            "production_rates": self.get_production_rates(),
            "income_rate": self.get_income_rate()
        }
        
        # Include password hash only for saving (not for client)
        if include_private:
            data["password_hash"] = self.password_hash
            data["total_time_played"] = self.total_time_played
        
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Player':
        """Deserialize player from dictionary"""
        player = cls(data["id"], data["username"], data.get("password_hash"))
        player.money = data.get("money", 100)
        player.xp = data.get("xp", 0)
        player.level = data.get("level", 1)
        player.resources = data.get("resources", {})
        player.resource_fractions = data.get("resource_fractions", {})
        player.money_fractions = data.get("money_fractions", 0.0)
        player.pollution = data.get("pollution", 0)
        player.eco_points = data.get("eco_points", 0)
        player.stats = data.get("stats", player.stats)
        player.created_at = data.get("created_at", time.time())
        player.total_time_played = data.get("total_time_played", 0)
        player.tutorial_completed = data.get("tutorial_completed", False)
        player.tutorial_step = data.get("tutorial_step", 0)
        player.challenge_progress = data.get("challenge_progress", {})
        player.completed_challenges = data.get("completed_challenges", [])
        
        # Restore buildings (without the calculated fields)
        for bid, bstate in data.get("buildings", {}).items():
            player.buildings[bid] = {
                "level": bstate.get("level", 1),
                "count": bstate.get("count", 1),
                "last_produced": bstate.get("last_produced", time.time())
            }
        
        return player

