"""
Castle Defenders - Game State Management
Handles game rooms, towers, enemies, and game logic
"""

import uuid
import time
import math
import random
from typing import Dict, List, Optional, Tuple
from .game_data import TOWER_TYPES, ENEMY_TYPES, xp_for_level
from .player import CastlePlayer


class GamePlayer:
    """Player state within a game"""
    def __init__(self, socket_id: str, profile: CastlePlayer, stats: dict):
        self.id = socket_id
        self.name = profile.name
        self.gold = 200 + stats["startingGoldBonus"]
        self.score = 0
        self.enemies_killed = 0
        self.towers_built = 0
        self.damage_dealt = 0.0
        self.profile = profile
        self.stats = stats


class Tower:
    """A placed tower"""
    def __init__(self, tower_id: str, tower_type: str, x: float, y: float, 
                 plot_id: int, owner_id: str, owner_name: str):
        self.id = tower_id
        self.type = tower_type
        self.x = x
        self.y = y
        self.plot_id = plot_id
        self.owner_id = owner_id
        self.owner_name = owner_name
        self.last_fired = 0
        self.level = 1
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "x": self.x,
            "y": self.y,
            "plotId": self.plot_id,
            "ownerId": self.owner_id,
            "ownerName": self.owner_name,
            "level": self.level
        }


class Enemy:
    """An enemy unit"""
    def __init__(self, enemy_id: str, enemy_type: str, template: dict, 
                 wave: int, start_x: float, start_y: float):
        wave_multiplier = 1 + (wave - 1) * 0.15
        
        self.id = enemy_id
        self.type = enemy_type
        self.x = start_x
        self.y = start_y
        self.health = int(template["health"] * wave_multiplier)
        self.max_health = self.health
        self.speed = template["speed"]
        self.reward = int(template["reward"] * (1 + wave * 0.1))
        self.color = template["color"]
        self.size = template["size"]
        self.path_index = 0
        self.path_progress = 0.0
        self.slowed_until = 0
        self.stunned_until = 0
        self.burning = False
        self.burn_damage = 0.0
        self.burn_until = 0
        self.armor = template.get("armor", 0)
        self.heals = template.get("heals", False)
        self.phasing = template.get("phasing", False)
        self.enrages = template.get("enrages", False)
        self.enraged = False
    
    def to_dict(self) -> dict:
        now = int(time.time() * 1000)
        return {
            "id": self.id,
            "type": self.type,
            "x": self.x,
            "y": self.y,
            "health": self.health,
            "maxHealth": self.max_health,
            "color": self.color,
            "size": self.size,
            "slowed": self.slowed_until > now,
            "stunned": self.stunned_until > now,
            "burning": self.burning
        }


class Projectile:
    """A projectile in flight"""
    def __init__(self, proj_id: str, x: float, y: float, target_id: str,
                 damage: float, speed: float, proj_type: str, owner_id: str, color: str):
        self.id = proj_id
        self.x = x
        self.y = y
        self.target_id = target_id
        self.damage = damage
        self.speed = speed
        self.type = proj_type
        self.owner_id = owner_id
        self.color = color
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "x": self.x,
            "y": self.y,
            "targetId": self.target_id,
            "color": self.color
        }


class Troop:
    """A soldier unit from barracks"""
    def __init__(self, troop_id: str, x: float, y: float, health: float,
                 damage: float, owner_id: str, troop_type: str):
        self.id = troop_id
        self.x = x
        self.y = y
        self.health = health
        self.damage = damage
        self.owner_id = owner_id
        self.type = troop_type
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "x": self.x,
            "y": self.y,
            "health": self.health,
            "type": self.type
        }


class Plot:
    """A buildable plot"""
    def __init__(self, plot_id: int, x: float, y: float):
        self.id = plot_id
        self.x = x
        self.y = y
        self.tower: Optional[str] = None
        self.owner: Optional[str] = None
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "x": self.x,
            "y": self.y,
            "tower": self.tower,
            "owner": self.owner
        }


class CastleGame:
    """A single game instance"""
    
    def __init__(self, game_id: str):
        self.id = game_id
        self.players: Dict[str, GamePlayer] = {}
        self.towers: List[Tower] = []
        self.enemies: List[Enemy] = []
        self.projectiles: List[Projectile] = []
        self.troops: List[Troop] = []
        self.wave = 0
        self.castle_health = 1000
        self.max_castle_health = 1000
        self.state = "waiting"  # waiting, playing, ended
        self.last_update = int(time.time() * 1000)
        self.wave_in_progress = False
        self.enemies_to_spawn: List[dict] = []
        self.spawn_timer = 0
        self.plots = self._generate_plots()
        self.path = self._generate_path()
    
    def _generate_plots(self) -> List[Plot]:
        """Generate buildable plot positions - carefully placed to avoid the path"""
        plot_positions = [
            # Far left column (away from path)
            {"x": 50, "y": 180}, {"x": 50, "y": 420},
            # Left of first turn
            {"x": 170, "y": 120}, {"x": 170, "y": 420}, {"x": 170, "y": 520},
            # Between first and second path segments
            {"x": 320, "y": 280}, {"x": 320, "y": 480},
            # Top row (above path)
            {"x": 480, "y": 80}, {"x": 620, "y": 80},
            # Middle area (between path loops)
            {"x": 480, "y": 280}, {"x": 620, "y": 320},
            # Bottom area
            {"x": 480, "y": 520}, {"x": 620, "y": 520},
            # Right side (near castle but not on path)
            {"x": 780, "y": 180}, {"x": 780, "y": 480},
            # Extra strategic spots
            {"x": 200, "y": 280}, {"x": 680, "y": 200}
        ]
        
        return [Plot(i, pos["x"], pos["y"]) for i, pos in enumerate(plot_positions)]
    
    def _generate_path(self) -> List[dict]:
        """Generate enemy path from left to castle"""
        return [
            {"x": -30, "y": 300},
            {"x": 100, "y": 300},
            {"x": 100, "y": 200},
            {"x": 250, "y": 200},
            {"x": 250, "y": 350},
            {"x": 400, "y": 350},
            {"x": 400, "y": 150},
            {"x": 550, "y": 150},
            {"x": 550, "y": 400},
            {"x": 700, "y": 400},
            {"x": 700, "y": 300},
            {"x": 850, "y": 300}
        ]
    
    def add_player(self, socket_id: str, profile: CastlePlayer) -> GamePlayer:
        """Add a player to the game"""
        stats = profile.get_stats()
        game_player = GamePlayer(socket_id, profile, stats)
        self.players[socket_id] = game_player
        self._recalculate_castle_health()
        return game_player
    
    def remove_player(self, socket_id: str):
        """Remove a player from the game"""
        self.players.pop(socket_id, None)
    
    def _recalculate_castle_health(self):
        """Recalculate castle health based on player bonuses"""
        bonus_health = sum(p.stats["castleHealthBonus"] for p in self.players.values())
        self.max_castle_health = 1000 + bonus_health
        if self.state == "waiting":
            self.castle_health = self.max_castle_health
    
    def start_wave(self):
        """Start the next wave"""
        if self.wave_in_progress:
            return
        
        self.wave += 1
        self.wave_in_progress = True
        
        # Give wave bonus gold to all players
        wave_bonus = 50 + (self.wave * 15)
        for player in self.players.values():
            bonus = int(wave_bonus * player.stats["waveBonusMultiplier"])
            interest = int(player.gold * player.stats["goldInterest"])
            player.gold += bonus + interest
        
        # Generate enemies for this wave
        self.enemies_to_spawn = self._generate_wave_enemies()
        self.spawn_timer = 0
    
    def _generate_wave_enemies(self) -> List[dict]:
        """Generate enemy spawn list for current wave"""
        enemies = []
        base_count = 5 + int(self.wave * 1.5)
        
        # Boss wave every 5 waves
        if self.wave % 5 == 0:
            enemies.append({"type": "boss", "delay": 0})
            for i in range(self.wave // 2):
                enemies.append({"type": "healer", "delay": 500 + i * 300})
        
        # Regular enemies
        for i in range(base_count):
            enemy_type = "grunt"
            roll = random.random()
            
            if self.wave >= 3 and roll < 0.2:
                enemy_type = "runner"
            if self.wave >= 5 and roll < 0.15:
                enemy_type = "tank"
            if self.wave >= 7 and roll < 0.1:
                enemy_type = "healer"
            if self.wave >= 8 and roll < 0.12:
                enemy_type = "shield"
            if self.wave >= 10 and roll < 0.25:
                enemy_type = "swarm"
            if self.wave >= 12 and roll < 0.08:
                enemy_type = "ghost"
            if self.wave >= 15 and roll < 0.1:
                enemy_type = "berserker"
            
            enemies.append({"type": enemy_type, "delay": i * 400})
        
        # Swarm waves every 7 waves
        if self.wave % 7 == 0 and self.wave > 0:
            for i in range(20):
                enemies.append({"type": "swarm", "delay": base_count * 400 + i * 150})
        
        return enemies
    
    def _spawn_enemy(self, enemy_type: str):
        """Spawn a single enemy"""
        template = ENEMY_TYPES.get(enemy_type)
        if not template:
            return
        
        enemy = Enemy(
            str(uuid.uuid4()),
            enemy_type,
            template,
            self.wave,
            self.path[0]["x"],
            self.path[0]["y"]
        )
        self.enemies.append(enemy)
    
    def place_tower(self, socket_id: str, plot_id: int, tower_type: str) -> dict:
        """Place a tower on a plot"""
        player = self.players.get(socket_id)
        if not player:
            return {"success": False, "error": "Player not found"}
        
        plot = next((p for p in self.plots if p.id == plot_id), None)
        if not plot:
            return {"success": False, "error": "Plot not found"}
        if plot.tower:
            return {"success": False, "error": "Plot already occupied"}
        
        tower_def = TOWER_TYPES.get(tower_type)
        if not tower_def:
            return {"success": False, "error": "Invalid tower type"}
        
        if player.profile.level < tower_def["unlockLevel"]:
            return {"success": False, "error": f"Requires level {tower_def['unlockLevel']}"}
        
        cost = int(tower_def["cost"] * player.stats["towerCostMultiplier"])
        if player.gold < cost:
            return {"success": False, "error": "Not enough gold"}
        
        player.gold -= cost
        player.towers_built += 1
        
        tower = Tower(
            str(uuid.uuid4()),
            tower_type,
            plot.x,
            plot.y,
            plot_id,
            socket_id,
            player.name
        )
        
        self.towers.append(tower)
        plot.tower = tower.id
        plot.owner = socket_id
        
        # Spawn troops for barracks
        if tower_type == "barracks":
            barracks_def = TOWER_TYPES["barracks"]
            for i in range(barracks_def["troopCount"]):
                troop = Troop(
                    str(uuid.uuid4()),
                    plot.x + (random.random() - 0.5) * 40,
                    plot.y + (random.random() - 0.5) * 40,
                    barracks_def["troopHealth"],
                    barracks_def["damage"],
                    socket_id,
                    "soldier"
                )
                self.troops.append(troop)
        
        return {"success": True, "tower": tower.to_dict()}
    
    def sell_tower(self, socket_id: str, plot_id: int) -> dict:
        """Sell a tower"""
        player = self.players.get(socket_id)
        if not player:
            return {"success": False, "error": "Player not found"}
        
        plot = next((p for p in self.plots if p.id == plot_id), None)
        if not plot:
            return {"success": False, "error": "Plot not found"}
        if not plot.tower:
            return {"success": False, "error": "No tower here"}
        if plot.owner != socket_id:
            return {"success": False, "error": "Not your tower"}
        
        tower = next((t for t in self.towers if t.id == plot.tower), None)
        if not tower:
            return {"success": False, "error": "Tower not found"}
        
        tower_def = TOWER_TYPES.get(tower.type)
        refund = int(tower_def["cost"] * 0.6)
        player.gold += refund
        
        self.towers = [t for t in self.towers if t.id != tower.id]
        plot.tower = None
        plot.owner = None
        
        return {"success": True, "refund": refund}
    
    def update(self, delta_time: float):
        """Main game update loop"""
        if self.state != "playing":
            return
        
        now = int(time.time() * 1000)
        
        # Spawn enemies
        if self.enemies_to_spawn:
            self.spawn_timer += delta_time
            while self.enemies_to_spawn and self.spawn_timer >= self.enemies_to_spawn[0]["delay"]:
                to_spawn = self.enemies_to_spawn.pop(0)
                self._spawn_enemy(to_spawn["type"])
        
        # Update enemies
        enemies_to_remove = []
        for enemy in self.enemies:
            # Handle stun
            if enemy.stunned_until > now:
                continue
            
            # Handle burn damage
            if enemy.burning and enemy.burn_until > now:
                enemy.health -= enemy.burn_damage * (delta_time / 1000)
            else:
                enemy.burning = False
            
            # Handle berserker enrage
            if enemy.enrages and not enemy.enraged and enemy.health < enemy.max_health * 0.3:
                enemy.enraged = True
                enemy.speed *= 2
                enemy.color = "#FF0000"
            
            # Move enemy along path
            speed = enemy.speed
            if enemy.slowed_until > now:
                speed *= 0.5
            
            if enemy.path_index + 1 < len(self.path):
                target = self.path[enemy.path_index + 1]
                dx = target["x"] - enemy.x
                dy = target["y"] - enemy.y
                dist = math.sqrt(dx * dx + dy * dy)
                
                if dist < speed * 2:
                    enemy.path_index += 1
                else:
                    enemy.x += (dx / dist) * speed * (delta_time / 16)
                    enemy.y += (dy / dist) * speed * (delta_time / 16)
            else:
                # Reached castle
                self.castle_health -= 10 + self.wave // 2
                enemies_to_remove.append(enemy)
                continue
            
            # Check if dead
            if enemy.health <= 0:
                enemies_to_remove.append(enemy)
        
        for enemy in enemies_to_remove:
            if enemy in self.enemies:
                self.enemies.remove(enemy)
        
        # Update towers
        for tower in self.towers:
            owner = self.players.get(tower.owner_id)
            if not owner:
                continue
            
            tower_type = TOWER_TYPES.get(tower.type)
            if not tower_type:
                continue
            
            effective_fire_rate = tower_type["fireRate"] / owner.stats["towerSpeedMultiplier"]
            effective_range = tower_type["range"] * owner.stats["towerRangeMultiplier"]
            effective_damage = tower_type["damage"] * owner.stats["towerDamageMultiplier"]
            
            # Gold mine generates income
            if tower.type == "goldmine":
                if now - tower.last_fired >= tower_type["fireRate"]:
                    tower.last_fired = now
                    gold_generated = int(tower_type["goldPerTick"] * owner.stats["mineEfficiencyMultiplier"])
                    owner.gold += gold_generated
                continue
            
            # Shrine is passive
            if tower.type == "shrine":
                continue
            
            # Find target
            if now - tower.last_fired >= effective_fire_rate:
                target = None
                closest_dist = effective_range
                
                for enemy in self.enemies:
                    # Ghosts can only be hit by magic towers
                    if enemy.phasing and tower.type not in ["wizard", "necromancer"]:
                        continue
                    
                    dx = enemy.x - tower.x
                    dy = enemy.y - tower.y
                    dist = math.sqrt(dx * dx + dy * dy)
                    
                    if dist < closest_dist:
                        closest_dist = dist
                        target = enemy
                
                if target:
                    tower.last_fired = now
                    
                    # Check for shrine boost
                    shrine_boost = 1.0
                    shrine_def = TOWER_TYPES.get("shrine")
                    for other_tower in self.towers:
                        if other_tower.type == "shrine":
                            dx = other_tower.x - tower.x
                            dy = other_tower.y - tower.y
                            dist = math.sqrt(dx * dx + dy * dy)
                            if dist <= shrine_def["range"]:
                                shrine_boost += shrine_def["damageBoost"]
                    
                    damage = effective_damage * shrine_boost
                    
                    # Critical hit
                    crit_chance = owner.stats["critChanceBonus"] + tower_type.get("critChance", 0)
                    if random.random() < crit_chance:
                        damage *= tower_type.get("critMultiplier", 2)
                    
                    # Armor reduction
                    if target.armor > 0:
                        damage *= (1 - target.armor)
                    
                    # Create projectile
                    projectile = Projectile(
                        str(uuid.uuid4()),
                        tower.x,
                        tower.y,
                        target.id,
                        damage,
                        8,
                        tower.type,
                        tower.owner_id,
                        tower_type["color"]
                    )
                    self.projectiles.append(projectile)
                    
                    # Special effects
                    if tower.type == "frost":
                        target.slowed_until = now + tower_type["slowDuration"]
                    if tower.type == "tesla":
                        target.stunned_until = now + tower_type["stunDuration"]
                    if tower.type == "dragon":
                        target.burning = True
                        target.burn_damage = tower_type["burnDamage"]
                        target.burn_until = now + tower_type["burnDuration"]
                    
                    # Wizard chain lightning
                    if tower.type == "wizard" and tower_type.get("chainCount", 1) > 1:
                        last_target = target
                        for c in range(1, tower_type["chainCount"]):
                            chain_target = None
                            chain_dist = 100
                            for enemy in self.enemies:
                                if enemy.id == last_target.id:
                                    continue
                                dx = enemy.x - last_target.x
                                dy = enemy.y - last_target.y
                                dist = math.sqrt(dx * dx + dy * dy)
                                if dist < chain_dist:
                                    chain_dist = dist
                                    chain_target = enemy
                            
                            if chain_target:
                                chain_proj = Projectile(
                                    str(uuid.uuid4()),
                                    last_target.x,
                                    last_target.y,
                                    chain_target.id,
                                    damage * 0.7,
                                    12,
                                    "chain",
                                    tower.owner_id,
                                    "#9932CC"
                                )
                                self.projectiles.append(chain_proj)
                                last_target = chain_target
        
        # Update projectiles
        projectiles_to_remove = []
        for proj in self.projectiles:
            target = next((e for e in self.enemies if e.id == proj.target_id), None)
            
            if not target:
                projectiles_to_remove.append(proj)
                continue
            
            dx = target.x - proj.x
            dy = target.y - proj.y
            dist = math.sqrt(dx * dx + dy * dy)
            
            if dist < proj.speed * 2:
                # Hit!
                target.health -= proj.damage
                
                # Mortar splash
                if proj.type == "mortar":
                    mortar_def = TOWER_TYPES.get("mortar")
                    for enemy in self.enemies:
                        if enemy.id == target.id:
                            continue
                        sdx = enemy.x - target.x
                        sdy = enemy.y - target.y
                        sdist = math.sqrt(sdx * sdx + sdy * sdy)
                        if sdist <= mortar_def["splashRadius"]:
                            enemy.health -= proj.damage * 0.5
                
                # Track damage
                owner = self.players.get(proj.owner_id)
                if owner:
                    owner.damage_dealt += proj.damage
                
                # Check kill
                if target.health <= 0:
                    if owner:
                        kill_bonus = int(target.reward * owner.stats["killBonusMultiplier"])
                        owner.gold += kill_bonus
                        owner.enemies_killed += 1
                        owner.score += target.reward
                        
                        # Necromancer skeleton
                        if proj.type == "necromancer":
                            necro_def = TOWER_TYPES.get("necromancer")
                            if random.random() < necro_def["skeletonChance"]:
                                troop = Troop(
                                    str(uuid.uuid4()),
                                    target.x,
                                    target.y,
                                    30,
                                    10,
                                    proj.owner_id,
                                    "skeleton"
                                )
                                self.troops.append(troop)
                
                projectiles_to_remove.append(proj)
            else:
                proj.x += (dx / dist) * proj.speed
                proj.y += (dy / dist) * proj.speed
        
        for proj in projectiles_to_remove:
            if proj in self.projectiles:
                self.projectiles.remove(proj)
        
        # Healer enemies heal nearby
        for enemy in self.enemies:
            if enemy.heals:
                for other in self.enemies:
                    if other.id == enemy.id:
                        continue
                    dx = other.x - enemy.x
                    dy = other.y - enemy.y
                    dist = math.sqrt(dx * dx + dy * dy)
                    if dist < 80:
                        other.health = min(other.max_health, other.health + 0.5 * (delta_time / 16))
        
        # Update troops
        troops_to_remove = []
        for troop in self.troops:
            # Find nearest enemy
            target = None
            closest_dist = 200
            for enemy in self.enemies:
                dx = enemy.x - troop.x
                dy = enemy.y - troop.y
                dist = math.sqrt(dx * dx + dy * dy)
                if dist < closest_dist:
                    closest_dist = dist
                    target = enemy
            
            if target:
                if closest_dist < 20:
                    # Attack
                    target.health -= troop.damage * (delta_time / 500)
                    troop.health -= 2 * (delta_time / 500)
                else:
                    # Move toward enemy
                    dx = target.x - troop.x
                    dy = target.y - troop.y
                    dist = math.sqrt(dx * dx + dy * dy)
                    troop.x += (dx / dist) * 2
                    troop.y += (dy / dist) * 2
            
            if troop.health <= 0:
                troops_to_remove.append(troop)
        
        for troop in troops_to_remove:
            if troop in self.troops:
                self.troops.remove(troop)
        
        # Check wave complete
        if self.wave_in_progress and not self.enemies and not self.enemies_to_spawn:
            self.wave_in_progress = False
        
        # Check game over
        if self.castle_health <= 0:
            self.state = "ended"
    
    def end_game(self) -> List[dict]:
        """Calculate end game results and XP"""
        results = []
        
        for player in self.players.values():
            base_xp = 50
            wave_xp = self.wave * 20
            kill_xp = player.enemies_killed * 2
            team_bonus = (len(self.players) - 1) * 15
            
            total_xp = int((base_xp + wave_xp + kill_xp + team_bonus) * player.stats["xpMultiplier"])
            
            # Update profile
            profile = player.profile
            levels_gained = profile.add_xp(total_xp)
            profile.total_games_played += 1
            profile.total_waves_survived += self.wave
            profile.total_enemies_killed += player.enemies_killed
            if self.wave > profile.highest_wave:
                profile.highest_wave = self.wave
            
            results.append({
                "playerId": player.id,
                "playerName": player.name,
                "xpEarned": total_xp,
                "newLevel": profile.level,
                "levelsGained": levels_gained,
                "perkPoints": profile.perk_points,
                "enemiesKilled": player.enemies_killed,
                "damageDealt": int(player.damage_dealt),
                "towersBuilt": player.towers_built
            })
        
        return results
    
    def get_state(self) -> dict:
        """Get full game state for clients"""
        return {
            "id": self.id,
            "wave": self.wave,
            "castleHealth": self.castle_health,
            "maxCastleHealth": self.max_castle_health,
            "state": self.state,
            "waveInProgress": self.wave_in_progress,
            "players": [
                {
                    "id": p.id,
                    "name": p.name,
                    "gold": p.gold,
                    "score": p.score,
                    "level": p.profile.level
                }
                for p in self.players.values()
            ],
            "towers": [t.to_dict() for t in self.towers],
            "enemies": [e.to_dict() for e in self.enemies],
            "projectiles": [p.to_dict() for p in self.projectiles],
            "troops": [t.to_dict() for t in self.troops],
            "plots": [p.to_dict() for p in self.plots],
            "path": self.path
        }


class CastleGameManager:
    """Manages all active Castle Defenders games"""
    
    def __init__(self):
        self.games: Dict[str, CastleGame] = {}
    
    def find_or_create_game(self) -> CastleGame:
        """Find a waiting game or create a new one"""
        # Find a waiting game with space
        for game in self.games.values():
            if game.state == "waiting" and len(game.players) < 8:
                return game
        
        # Create new game
        game_id = str(uuid.uuid4())[:8]
        game = CastleGame(game_id)
        self.games[game_id] = game
        return game
    
    def get_game(self, game_id: str) -> Optional[CastleGame]:
        """Get a game by ID"""
        return self.games.get(game_id)
    
    def remove_game(self, game_id: str):
        """Remove a game"""
        self.games.pop(game_id, None)
    
    def update_all(self, delta_time: float):
        """Update all active games"""
        games_to_remove = []
        
        for game in self.games.values():
            if game.state == "playing":
                game.update(delta_time)
            
            # Remove empty ended games
            if game.state == "ended" and not game.players:
                games_to_remove.append(game.id)
        
        for game_id in games_to_remove:
            self.remove_game(game_id)

