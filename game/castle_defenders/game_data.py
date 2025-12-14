"""
Castle Defenders - Game Data Definitions
Tower types, enemy types, and perks
"""

TOWER_TYPES = {
    "cannon": {
        "id": "cannon",
        "name": "Cannon Tower",
        "cost": 100,
        "damage": 25,
        "range": 150,
        "fireRate": 1000,
        "description": "Reliable single-target damage",
        "unlockLevel": 1,
        "color": "#8B4513"
    },
    "archer": {
        "id": "archer",
        "name": "Archer Tower",
        "cost": 75,
        "damage": 12,
        "range": 180,
        "fireRate": 400,
        "description": "Fast attacks, long range",
        "unlockLevel": 1,
        "color": "#228B22"
    },
    "mortar": {
        "id": "mortar",
        "name": "Mortar Tower",
        "cost": 200,
        "damage": 40,
        "range": 200,
        "fireRate": 2500,
        "splashRadius": 60,
        "description": "Devastating splash damage",
        "unlockLevel": 3,
        "color": "#4A4A4A"
    },
    "wizard": {
        "id": "wizard",
        "name": "Wizard Tower",
        "cost": 250,
        "damage": 30,
        "range": 140,
        "fireRate": 1200,
        "chainCount": 3,
        "description": "Magic chains to 3 enemies",
        "unlockLevel": 5,
        "color": "#9932CC"
    },
    "frost": {
        "id": "frost",
        "name": "Frost Tower",
        "cost": 175,
        "damage": 8,
        "range": 130,
        "fireRate": 800,
        "slowAmount": 0.5,
        "slowDuration": 2000,
        "description": "Slows enemies by 50%",
        "unlockLevel": 4,
        "color": "#00CED1"
    },
    "barracks": {
        "id": "barracks",
        "name": "Barracks",
        "cost": 300,
        "damage": 15,
        "range": 100,
        "fireRate": 1500,
        "troopCount": 3,
        "troopHealth": 50,
        "description": "Deploys soldiers to fight",
        "unlockLevel": 6,
        "color": "#B8860B"
    },
    "goldmine": {
        "id": "goldmine",
        "name": "Gold Mine",
        "cost": 400,
        "damage": 0,
        "range": 0,
        "fireRate": 5000,
        "goldPerTick": 8,
        "description": "Generates 8 gold every 5s",
        "unlockLevel": 2,
        "color": "#FFD700"
    },
    "tesla": {
        "id": "tesla",
        "name": "Tesla Tower",
        "cost": 350,
        "damage": 50,
        "range": 120,
        "fireRate": 1800,
        "stunDuration": 500,
        "description": "High damage, stuns enemies",
        "unlockLevel": 8,
        "color": "#00FFFF"
    },
    "dragon": {
        "id": "dragon",
        "name": "Dragon Tower",
        "cost": 500,
        "damage": 35,
        "range": 160,
        "fireRate": 1000,
        "burnDamage": 5,
        "burnDuration": 3000,
        "description": "Fire breath with burn effect",
        "unlockLevel": 10,
        "color": "#FF4500"
    },
    "sniper": {
        "id": "sniper",
        "name": "Sniper Tower",
        "cost": 275,
        "damage": 100,
        "range": 300,
        "fireRate": 3000,
        "critChance": 0.25,
        "critMultiplier": 2,
        "description": "Extreme range, critical hits",
        "unlockLevel": 7,
        "color": "#2F4F4F"
    },
    "necromancer": {
        "id": "necromancer",
        "name": "Necromancer Tower",
        "cost": 450,
        "damage": 20,
        "range": 150,
        "fireRate": 2000,
        "skeletonChance": 0.3,
        "description": "Raises defeated enemies as allies",
        "unlockLevel": 12,
        "color": "#4B0082"
    },
    "shrine": {
        "id": "shrine",
        "name": "Blessing Shrine",
        "cost": 350,
        "damage": 0,
        "range": 150,
        "fireRate": 0,
        "damageBoost": 0.2,
        "description": "Boosts nearby tower damage 20%",
        "unlockLevel": 9,
        "color": "#FFE4B5"
    }
}

ENEMY_TYPES = {
    "grunt": {"health": 50, "speed": 1, "reward": 10, "color": "#8B0000", "size": 12},
    "runner": {"health": 30, "speed": 2, "reward": 8, "color": "#FF6347", "size": 10},
    "tank": {"health": 200, "speed": 0.5, "reward": 25, "color": "#4A4A4A", "size": 18},
    "healer": {"health": 60, "speed": 0.8, "reward": 20, "color": "#98FB98", "size": 14, "heals": True},
    "shield": {"health": 100, "speed": 0.7, "reward": 18, "color": "#4169E1", "size": 15, "armor": 0.5},
    "boss": {"health": 1000, "speed": 0.3, "reward": 200, "color": "#8B008B", "size": 30},
    "swarm": {"health": 15, "speed": 1.5, "reward": 3, "color": "#FFD700", "size": 8},
    "ghost": {"health": 80, "speed": 1.2, "reward": 30, "color": "#E6E6FA", "size": 12, "phasing": True},
    "berserker": {"health": 120, "speed": 0.6, "reward": 35, "color": "#DC143C", "size": 16, "enrages": True}
}

PERKS = {
    "towerDamage": {"name": "Tower Damage", "description": "+5% tower damage", "maxLevel": 20, "perLevel": 0.05},
    "towerSpeed": {"name": "Attack Speed", "description": "+3% attack speed", "maxLevel": 20, "perLevel": 0.03},
    "towerRange": {"name": "Tower Range", "description": "+5% tower range", "maxLevel": 15, "perLevel": 0.05},
    "startingGold": {"name": "Starting Gold", "description": "+25 starting gold", "maxLevel": 20, "perLevel": 25},
    "waveBonus": {"name": "Wave Bonus", "description": "+10% wave income", "maxLevel": 15, "perLevel": 0.10},
    "killBonus": {"name": "Kill Bonus", "description": "+5% kill gold", "maxLevel": 15, "perLevel": 0.05},
    "castleHealth": {"name": "Castle Fortify", "description": "+50 castle health", "maxLevel": 25, "perLevel": 50},
    "xpBonus": {"name": "XP Boost", "description": "+10% XP earned", "maxLevel": 10, "perLevel": 0.10},
    "critChance": {"name": "Critical Strike", "description": "+2% crit chance all towers", "maxLevel": 10, "perLevel": 0.02},
    "goldInterest": {"name": "Gold Interest", "description": "+1% gold interest per wave", "maxLevel": 10, "perLevel": 0.01},
    "towerDiscount": {"name": "Builder Discount", "description": "-2% tower costs", "maxLevel": 15, "perLevel": 0.02},
    "mineEfficiency": {"name": "Mine Efficiency", "description": "+10% gold mine output", "maxLevel": 10, "perLevel": 0.10}
}


def xp_for_level(level: int) -> int:
    """Calculate XP required for a given level"""
    return int(100 * (1.5 ** (level - 1)))


def get_unlocked_towers(player_level: int) -> dict:
    """Get towers unlocked at a given player level"""
    return {
        tower_id: tower 
        for tower_id, tower in TOWER_TYPES.items() 
        if player_level >= tower["unlockLevel"]
    }

