"""
Market System
Dynamic market with fluctuating prices based on supply and demand
"""

import random
import time
from typing import Dict, Any, Optional
from ..data import RESOURCES, BASE_PRICES


class MarketSystem:
    """Manages the dynamic market economy"""
    
    def __init__(self, game_state):
        self.game_state = game_state
        
        # Current prices (start at base)
        self.prices: Dict[str, float] = BASE_PRICES.copy()
        
        # Price history for trends
        self.price_history: Dict[str, list] = {rid: [BASE_PRICES.get(rid, 10)] for rid in RESOURCES}
        
        # Supply/demand tracking
        self.recent_sells: Dict[str, int] = {rid: 0 for rid in RESOURCES}
        self.recent_buys: Dict[str, int] = {rid: 0 for rid in RESOURCES}
        
        # Market volatility (0.0 - 1.0)
        self.volatility = 0.15
        
        # Price bounds (percentage of base price)
        self.min_price_multiplier = 0.3
        self.max_price_multiplier = 3.0
        
        self.last_fluctuation = time.time()
    
    def get_prices(self) -> Dict[str, Dict[str, Any]]:
        """Get current market prices with metadata"""
        result = {}
        for resource_id, price in self.prices.items():
            base = BASE_PRICES.get(resource_id, 10)
            history = self.price_history.get(resource_id, [base])
            
            # Calculate trend
            if len(history) >= 2:
                trend = (history[-1] - history[-2]) / max(history[-2], 1)
            else:
                trend = 0
            
            result[resource_id] = {
                "price": round(price, 2),
                "base_price": base,
                "buy_price": round(price * 1.1, 2),  # 10% markup for buying
                "sell_price": round(price * 0.9, 2),  # 10% markdown for selling
                "trend": round(trend * 100, 1),  # Percentage change
                "trend_direction": "up" if trend > 0.01 else "down" if trend < -0.01 else "stable"
            }
        return result
    
    def get_price(self, resource_id: str) -> Optional[float]:
        """Get current price for a resource"""
        return self.prices.get(resource_id)
    
    def sell_resource(self, socket_id: str, resource_id: str, amount: int) -> Dict[str, Any]:
        """Sell resources to the market"""
        player = self.game_state.get_player(socket_id)
        if not player:
            return {"success": False, "message": "Player not found"}
        
        if resource_id not in RESOURCES:
            return {"success": False, "message": "Unknown resource"}
        
        if amount <= 0:
            return {"success": False, "message": "Invalid amount"}
        
        if player.resources.get(resource_id, 0) < amount:
            return {"success": False, "message": "Not enough resources"}
        
        # Calculate price with sell markdown
        price_per_unit = self.prices.get(resource_id, BASE_PRICES.get(resource_id, 10)) * 0.9
        total = round(price_per_unit * amount, 2)
        
        # Execute sale
        player.resources[resource_id] -= amount
        player.money += total
        
        # Track for demand calculation
        self.recent_sells[resource_id] = self.recent_sells.get(resource_id, 0) + amount
        
        # Stats
        player.stats["total_sold"] += amount
        
        # Save
        self.game_state.save_player(player.id)
        
        return {
            "success": True,
            "resource_id": resource_id,
            "amount": amount,
            "price_per_unit": round(price_per_unit, 2),
            "earned": total,
            "player_resources": player.resources.copy(),
            "money": player.money
        }
    
    def buy_resource(self, socket_id: str, resource_id: str, amount: int) -> Dict[str, Any]:
        """Buy resources from the market"""
        player = self.game_state.get_player(socket_id)
        if not player:
            return {"success": False, "message": "Player not found"}
        
        if resource_id not in RESOURCES:
            return {"success": False, "message": "Unknown resource"}
        
        if amount <= 0:
            return {"success": False, "message": "Invalid amount"}
        
        # Check if resource is buyable (only raw materials and some processed)
        resource = RESOURCES[resource_id]
        if resource.get("category") not in ["raw", "processed", "energy"]:
            return {"success": False, "message": "This resource cannot be bought from the market"}
        
        # Check level requirement
        if player.level < resource.get("unlock_level", 1):
            return {"success": False, "message": f"Requires level {resource['unlock_level']}"}
        
        # Calculate price with buy markup
        price_per_unit = self.prices.get(resource_id, BASE_PRICES.get(resource_id, 10)) * 1.1
        total = round(price_per_unit * amount, 2)
        
        if player.money < total:
            return {"success": False, "message": f"Not enough money (need ${total})"}
        
        # Execute purchase
        player.money -= total
        player.resources[resource_id] = player.resources.get(resource_id, 0) + amount
        
        # Track for demand calculation
        self.recent_buys[resource_id] = self.recent_buys.get(resource_id, 0) + amount
        
        # Stats
        player.stats["total_bought"] += amount
        
        # Save
        self.game_state.save_player(player.id)
        
        return {
            "success": True,
            "resource_id": resource_id,
            "amount": amount,
            "price_per_unit": round(price_per_unit, 2),
            "spent": total,
            "player_resources": player.resources.copy(),
            "money": player.money
        }
    
    def fluctuate_prices(self):
        """Update prices based on supply/demand and randomness"""
        for resource_id in self.prices:
            base_price = BASE_PRICES.get(resource_id, 10)
            current_price = self.prices[resource_id]
            
            # Supply/demand factor
            sells = self.recent_sells.get(resource_id, 0)
            buys = self.recent_buys.get(resource_id, 0)
            
            demand_factor = 0
            if sells + buys > 0:
                # More sells = price drops, more buys = price rises
                demand_factor = (buys - sells) / max(sells + buys, 1) * 0.1
            
            # Random fluctuation
            random_factor = random.uniform(-self.volatility, self.volatility)
            
            # Mean reversion (prices tend to return to base)
            reversion_factor = (base_price - current_price) / base_price * 0.05
            
            # Apply all factors
            price_change = current_price * (demand_factor + random_factor + reversion_factor)
            new_price = current_price + price_change
            
            # Clamp to bounds
            min_price = base_price * self.min_price_multiplier
            max_price = base_price * self.max_price_multiplier
            new_price = max(min_price, min(max_price, new_price))
            
            # Update price
            self.prices[resource_id] = new_price
            
            # Update history (keep last 10 values)
            history = self.price_history.get(resource_id, [])
            history.append(new_price)
            if len(history) > 10:
                history.pop(0)
            self.price_history[resource_id] = history
        
        # Reset tracking
        self.recent_sells = {rid: 0 for rid in RESOURCES}
        self.recent_buys = {rid: 0 for rid in RESOURCES}
        
        self.last_fluctuation = time.time()
    
    def trigger_market_event(self, event_type: str, affected_resources: list = None):
        """Trigger a market event that affects prices"""
        if affected_resources is None:
            affected_resources = list(RESOURCES.keys())
        
        multiplier = 1.0
        if event_type == "crash":
            multiplier = random.uniform(0.5, 0.7)
        elif event_type == "boom":
            multiplier = random.uniform(1.3, 1.8)
        elif event_type == "shortage":
            multiplier = random.uniform(1.5, 2.5)
        elif event_type == "surplus":
            multiplier = random.uniform(0.4, 0.6)
        
        for resource_id in affected_resources:
            if resource_id in self.prices:
                base_price = BASE_PRICES.get(resource_id, 10)
                self.prices[resource_id] = max(
                    base_price * self.min_price_multiplier,
                    min(
                        base_price * self.max_price_multiplier,
                        self.prices[resource_id] * multiplier
                    )
                )

