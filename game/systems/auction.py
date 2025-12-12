"""
Auction System
Player-to-player auction house for trading resources
"""

import time
import uuid
from typing import Dict, Any, List, Optional


class AuctionSystem:
    """Manages the auction house"""
    
    def __init__(self, game_state, socketio=None):
        self.game_state = game_state
        self.socketio = socketio
        
        # Active auctions: {auction_id: auction_data}
        self.auctions: Dict[str, Dict[str, Any]] = {}
        
        # Completed auctions history
        self.completed_auctions: List[Dict[str, Any]] = []
        
        # Minimum auction duration (seconds)
        self.min_duration = 60
        self.max_duration = 3600  # 1 hour
        
        # Minimum bid increment (percentage)
        self.min_bid_increment = 0.05  # 5%
    
    def create_auction(self, socket_id: str, resource_id: str, amount: int, 
                      starting_price: float, duration: int) -> Dict[str, Any]:
        """Create a new auction"""
        player = self.game_state.get_player(socket_id)
        if not player:
            return {"success": False, "message": "Player not found"}
        
        # Validate
        if amount <= 0:
            return {"success": False, "message": "Invalid amount"}
        
        if starting_price <= 0:
            return {"success": False, "message": "Invalid starting price"}
        
        duration = max(self.min_duration, min(self.max_duration, duration))
        
        if player.resources.get(resource_id, 0) < amount:
            return {"success": False, "message": "Not enough resources"}
        
        # Deduct resources from seller
        player.resources[resource_id] -= amount
        
        # Create auction
        auction_id = str(uuid.uuid4())[:8]
        auction = {
            "id": auction_id,
            "seller_id": player.id,
            "seller_name": player.username,
            "resource_id": resource_id,
            "amount": amount,
            "starting_price": starting_price,
            "current_price": starting_price,
            "current_bidder": None,
            "current_bidder_name": None,
            "bid_history": [],
            "created_at": time.time(),
            "ends_at": time.time() + duration,
            "duration": duration,
            "status": "active"
        }
        
        self.auctions[auction_id] = auction
        
        # Stats
        player.stats["auctions_created"] += 1
        self.game_state.save_player(player.id)
        
        return {
            "success": True,
            "auction": auction,
            "player_resources": player.resources.copy()
        }
    
    def place_bid(self, socket_id: str, auction_id: str, bid_amount: float) -> Dict[str, Any]:
        """Place a bid on an auction"""
        player = self.game_state.get_player(socket_id)
        if not player:
            return {"success": False, "message": "Player not found"}
        
        if auction_id not in self.auctions:
            return {"success": False, "message": "Auction not found"}
        
        auction = self.auctions[auction_id]
        
        # Check auction is still active
        if auction["status"] != "active":
            return {"success": False, "message": "Auction is no longer active"}
        
        if time.time() > auction["ends_at"]:
            return {"success": False, "message": "Auction has ended"}
        
        # Can't bid on own auction
        if auction["seller_id"] == player.id:
            return {"success": False, "message": "Cannot bid on your own auction"}
        
        # Validate bid amount
        min_bid = auction["current_price"] * (1 + self.min_bid_increment)
        if bid_amount < min_bid:
            return {"success": False, "message": f"Minimum bid is ${min_bid:.2f}"}
        
        if player.money < bid_amount:
            return {"success": False, "message": "Not enough money"}
        
        # Refund previous bidder
        if auction["current_bidder"]:
            prev_bidder = self.game_state.get_player_by_id(auction["current_bidder"])
            if prev_bidder:
                prev_bidder.money += auction["current_price"]
                self.game_state.save_player(prev_bidder.id)
                
                # Notify previous bidder they were outbid
                if self.socketio:
                    prev_socket = self.game_state.get_player_socket(auction["current_bidder"])
                    if prev_socket:
                        self.socketio.emit('auction:outbid', {
                            "auction_id": auction_id,
                            "new_price": bid_amount,
                            "refunded": auction["current_price"]
                        }, room=prev_socket)
        
        # Deduct from bidder
        player.money -= bid_amount
        
        # Update auction
        auction["current_price"] = bid_amount
        auction["current_bidder"] = player.id
        auction["current_bidder_name"] = player.username
        auction["bid_history"].append({
            "bidder_id": player.id,
            "bidder_name": player.username,
            "amount": bid_amount,
            "time": time.time()
        })
        
        # Extend auction if bid in last minute
        time_remaining = auction["ends_at"] - time.time()
        if time_remaining < 60:
            auction["ends_at"] = time.time() + 60  # Add 1 minute
        
        self.game_state.save_player(player.id)
        
        return {
            "success": True,
            "auction": auction,
            "money": player.money
        }
    
    def get_active_auctions(self) -> List[Dict[str, Any]]:
        """Get all active auctions"""
        current_time = time.time()
        active = []
        
        for auction_id, auction in self.auctions.items():
            if auction["status"] == "active" and auction["ends_at"] > current_time:
                auction_copy = auction.copy()
                auction_copy["time_remaining"] = auction["ends_at"] - current_time
                active.append(auction_copy)
        
        # Sort by ending soonest
        active.sort(key=lambda x: x["ends_at"])
        return active
    
    def get_player_auctions(self, player_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """Get auctions where player is seller or bidder"""
        selling = []
        bidding = []
        
        for auction in self.auctions.values():
            if auction["seller_id"] == player_id:
                selling.append(auction)
            elif auction["current_bidder"] == player_id:
                bidding.append(auction)
        
        return {"selling": selling, "bidding": bidding}
    
    def process_auctions(self) -> List[Dict[str, Any]]:
        """Process completed auctions"""
        completed = []
        current_time = time.time()
        
        for auction_id, auction in list(self.auctions.items()):
            if auction["status"] == "active" and auction["ends_at"] <= current_time:
                # Auction ended
                auction["status"] = "completed"
                
                if auction["current_bidder"]:
                    # Winner exists - transfer resources
                    winner = self.game_state.get_player_by_id(auction["current_bidder"])
                    seller = self.game_state.get_player_by_id(auction["seller_id"])
                    
                    if winner and seller:
                        # Give resources to winner
                        winner.resources[auction["resource_id"]] = \
                            winner.resources.get(auction["resource_id"], 0) + auction["amount"]
                        winner.stats["auctions_won"] += 1
                        
                        # Give money to seller (already deducted from winner on bid)
                        seller.money += auction["current_price"]
                        
                        self.game_state.save_player(winner.id)
                        self.game_state.save_player(seller.id)
                    
                    auction["winner"] = auction["current_bidder"]
                    auction["winner_name"] = auction["current_bidder_name"]
                    auction["final_price"] = auction["current_price"]
                else:
                    # No bids - return resources to seller
                    seller = self.game_state.get_player_by_id(auction["seller_id"])
                    if seller:
                        seller.resources[auction["resource_id"]] = \
                            seller.resources.get(auction["resource_id"], 0) + auction["amount"]
                        self.game_state.save_player(seller.id)
                    
                    auction["winner"] = None
                    auction["final_price"] = 0
                
                completed.append(auction)
                self.completed_auctions.append(auction)
                
                # Keep completed auctions for a while
                # del self.auctions[auction_id]
        
        # Clean up old completed auctions
        cutoff = current_time - 300  # 5 minutes
        self.auctions = {
            k: v for k, v in self.auctions.items() 
            if v["status"] == "active" or v["ends_at"] > cutoff
        }
        
        return completed
    
    def cancel_auction(self, socket_id: str, auction_id: str) -> Dict[str, Any]:
        """Cancel an auction (only if no bids)"""
        player = self.game_state.get_player(socket_id)
        if not player:
            return {"success": False, "message": "Player not found"}
        
        if auction_id not in self.auctions:
            return {"success": False, "message": "Auction not found"}
        
        auction = self.auctions[auction_id]
        
        if auction["seller_id"] != player.id:
            return {"success": False, "message": "Not your auction"}
        
        if auction["current_bidder"]:
            return {"success": False, "message": "Cannot cancel auction with bids"}
        
        # Return resources
        player.resources[auction["resource_id"]] = \
            player.resources.get(auction["resource_id"], 0) + auction["amount"]
        
        auction["status"] = "cancelled"
        self.game_state.save_player(player.id)
        
        return {
            "success": True,
            "player_resources": player.resources.copy()
        }

