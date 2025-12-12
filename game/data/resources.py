"""
Resource Definitions
All gatherable and craftable resources in the game
"""

RESOURCES = {
    # === TIER 1: Basic Resources ===
    "wood": {
        "id": "wood",
        "name": "Wood",
        "description": "Basic building material from trees",
        "tier": 1,
        "base_gather_time": 2.0,
        "base_gather_amount": 1,
        "icon": "🌲",
        "category": "raw",
        "unlock_level": 1
    },
    "stone": {
        "id": "stone",
        "name": "Stone",
        "description": "Sturdy building material",
        "tier": 1,
        "base_gather_time": 3.0,
        "base_gather_amount": 1,
        "icon": "🪨",
        "category": "raw",
        "unlock_level": 2
    },
    "water": {
        "id": "water",
        "name": "Water",
        "description": "Essential for many processes",
        "tier": 1,
        "base_gather_time": 1.5,
        "base_gather_amount": 2,
        "icon": "💧",
        "category": "raw",
        "unlock_level": 1
    },
    
    # === TIER 2: Processed Basic Resources ===
    "plank": {
        "id": "plank",
        "name": "Wood Plank",
        "description": "Processed wood for construction",
        "tier": 2,
        "icon": "🪵",
        "category": "processed",
        "unlock_level": 3
    },
    "brick": {
        "id": "brick",
        "name": "Brick",
        "description": "Fired clay brick for building",
        "tier": 2,
        "icon": "🧱",
        "category": "processed",
        "unlock_level": 4
    },
    "coal": {
        "id": "coal",
        "name": "Coal",
        "description": "Fuel for power and smelting",
        "tier": 2,
        "base_gather_time": 4.0,
        "base_gather_amount": 1,
        "icon": "⚫",
        "category": "raw",
        "unlock_level": 5
    },
    
    # === TIER 3: Industrial Resources ===
    "iron_ore": {
        "id": "iron_ore",
        "name": "Iron Ore",
        "description": "Raw iron from mines",
        "tier": 3,
        "base_gather_time": 5.0,
        "base_gather_amount": 1,
        "icon": "🟫",
        "category": "raw",
        "unlock_level": 7
    },
    "copper_ore": {
        "id": "copper_ore",
        "name": "Copper Ore",
        "description": "Raw copper for electronics",
        "tier": 3,
        "base_gather_time": 5.0,
        "base_gather_amount": 1,
        "icon": "🟠",
        "category": "raw",
        "unlock_level": 8
    },
    "oil": {
        "id": "oil",
        "name": "Crude Oil",
        "description": "Black gold from the earth",
        "tier": 3,
        "base_gather_time": 6.0,
        "base_gather_amount": 1,
        "icon": "🛢",
        "category": "raw",
        "unlock_level": 10
    },
    
    # === TIER 4: Refined Materials ===
    "iron": {
        "id": "iron",
        "name": "Iron Ingot",
        "description": "Smelted iron for manufacturing",
        "tier": 4,
        "icon": "🔩",
        "category": "processed",
        "unlock_level": 9
    },
    "copper": {
        "id": "copper",
        "name": "Copper Ingot",
        "description": "Refined copper for wiring",
        "tier": 4,
        "icon": "🔶",
        "category": "processed",
        "unlock_level": 10
    },
    "steel": {
        "id": "steel",
        "name": "Steel",
        "description": "Strong alloy for advanced construction",
        "tier": 4,
        "icon": "⚙",
        "category": "processed",
        "unlock_level": 12
    },
    "plastic": {
        "id": "plastic",
        "name": "Plastic",
        "description": "Versatile synthetic material",
        "tier": 4,
        "icon": "🧴",
        "category": "processed",
        "unlock_level": 13
    },
    "gasoline": {
        "id": "gasoline",
        "name": "Gasoline",
        "description": "Refined fuel for vehicles",
        "tier": 4,
        "icon": "⛽",
        "category": "processed",
        "unlock_level": 14
    },
    
    # === TIER 5: Advanced Materials ===
    "glass": {
        "id": "glass",
        "name": "Glass",
        "description": "Transparent material for construction",
        "tier": 5,
        "icon": "🪟",
        "category": "processed",
        "unlock_level": 15
    },
    "wire": {
        "id": "wire",
        "name": "Copper Wire",
        "description": "Essential for electronics",
        "tier": 5,
        "icon": "🔌",
        "category": "processed",
        "unlock_level": 16
    },
    "circuit": {
        "id": "circuit",
        "name": "Circuit Board",
        "description": "Electronic component",
        "tier": 5,
        "icon": "💻",
        "category": "processed",
        "unlock_level": 18
    },
    "rubber": {
        "id": "rubber",
        "name": "Rubber",
        "description": "Flexible material for various uses",
        "tier": 5,
        "icon": "⚫",
        "category": "processed",
        "unlock_level": 17
    },
    
    # === TIER 6: High-Tech Resources ===
    "electronics": {
        "id": "electronics",
        "name": "Electronics",
        "description": "Advanced electronic components",
        "tier": 6,
        "icon": "📱",
        "category": "product",
        "unlock_level": 20
    },
    "battery": {
        "id": "battery",
        "name": "Battery",
        "description": "Portable power storage",
        "tier": 6,
        "icon": "🔋",
        "category": "product",
        "unlock_level": 21
    },
    "solar_panel": {
        "id": "solar_panel",
        "name": "Solar Panel",
        "description": "Clean energy generator",
        "tier": 6,
        "icon": "☀",
        "category": "product",
        "unlock_level": 22
    },
    
    # === TIER 7: Rare Resources ===
    "gold": {
        "id": "gold",
        "name": "Gold",
        "description": "Precious metal for luxury items",
        "tier": 7,
        "base_gather_time": 10.0,
        "base_gather_amount": 1,
        "icon": "🥇",
        "category": "raw",
        "unlock_level": 25
    },
    "diamond": {
        "id": "diamond",
        "name": "Diamond",
        "description": "Rare gem for cutting and luxury",
        "tier": 7,
        "base_gather_time": 15.0,
        "base_gather_amount": 1,
        "icon": "💎",
        "category": "raw",
        "unlock_level": 28
    },
    "uranium": {
        "id": "uranium",
        "name": "Uranium",
        "description": "Radioactive material for nuclear power",
        "tier": 7,
        "base_gather_time": 20.0,
        "base_gather_amount": 1,
        "icon": "☢",
        "category": "raw",
        "unlock_level": 30,
        "pollution_per_gather": 5
    },
    
    # === TIER 8: Space Resources ===
    "titanium": {
        "id": "titanium",
        "name": "Titanium",
        "description": "Lightweight, ultra-strong metal",
        "tier": 8,
        "icon": "🔷",
        "category": "processed",
        "unlock_level": 35
    },
    "alien_alloy": {
        "id": "alien_alloy",
        "name": "Alien Alloy",
        "description": "Mysterious extraterrestrial material",
        "tier": 8,
        "icon": "👽",
        "category": "processed",
        "unlock_level": 40
    },
    "meteorite": {
        "id": "meteorite",
        "name": "Meteorite Fragment",
        "description": "Space rock with unique properties",
        "tier": 8,
        "base_gather_time": 30.0,
        "base_gather_amount": 1,
        "icon": "☄",
        "category": "raw",
        "unlock_level": 38
    },
    
    # === Energy Resources ===
    "electricity": {
        "id": "electricity",
        "name": "Electricity",
        "description": "Power for machines and factories",
        "tier": 3,
        "icon": "⚡",
        "category": "energy",
        "unlock_level": 6
    },
    "nuclear_power": {
        "id": "nuclear_power",
        "name": "Nuclear Power",
        "description": "Massive energy from nuclear fission",
        "tier": 7,
        "icon": "⚛",
        "category": "energy",
        "unlock_level": 32
    }
}

# Base market prices (can fluctuate)
BASE_PRICES = {
    "wood": 5,
    "stone": 8,
    "water": 2,
    "plank": 15,
    "brick": 20,
    "coal": 25,
    "iron_ore": 30,
    "copper_ore": 35,
    "oil": 50,
    "iron": 80,
    "copper": 90,
    "steel": 150,
    "plastic": 120,
    "gasoline": 100,
    "glass": 60,
    "wire": 140,
    "circuit": 300,
    "rubber": 100,
    "electronics": 500,
    "battery": 400,
    "solar_panel": 600,
    "gold": 1000,
    "diamond": 2500,
    "uranium": 3000,
    "titanium": 2000,
    "alien_alloy": 10000,
    "meteorite": 5000,
    "electricity": 10,
    "nuclear_power": 50
}
