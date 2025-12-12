"""
Crafting Recipes
Manual crafting recipes for converting resources
"""

RECIPES = {
    # Basic crafting
    "craft_plank": {
        "id": "craft_plank",
        "name": "Craft Wood Plank",
        "description": "Turn raw wood into planks",
        "inputs": {"wood": 3},
        "outputs": {"plank": 2},
        "craft_time": 3.0,
        "unlock_level": 3,
        "xp_reward": 5
    },
    "craft_brick": {
        "id": "craft_brick",
        "name": "Fire Bricks",
        "description": "Fire stone and clay into bricks",
        "inputs": {"stone": 2, "coal": 1},
        "outputs": {"brick": 2},
        "craft_time": 5.0,
        "unlock_level": 5,
        "xp_reward": 8
    },
    
    # Metal processing
    "smelt_iron": {
        "id": "smelt_iron",
        "name": "Smelt Iron",
        "description": "Smelt iron ore into ingots",
        "inputs": {"iron_ore": 2, "coal": 1},
        "outputs": {"iron": 1},
        "craft_time": 8.0,
        "unlock_level": 9,
        "xp_reward": 15
    },
    "smelt_copper": {
        "id": "smelt_copper",
        "name": "Smelt Copper",
        "description": "Smelt copper ore into ingots",
        "inputs": {"copper_ore": 2, "coal": 1},
        "outputs": {"copper": 1},
        "craft_time": 8.0,
        "unlock_level": 10,
        "xp_reward": 15
    },
    "forge_steel": {
        "id": "forge_steel",
        "name": "Forge Steel",
        "description": "Combine iron and coal into steel",
        "inputs": {"iron": 2, "coal": 2},
        "outputs": {"steel": 1},
        "craft_time": 12.0,
        "unlock_level": 12,
        "xp_reward": 25
    },
    
    # Advanced materials
    "make_glass": {
        "id": "make_glass",
        "name": "Make Glass",
        "description": "Heat sand/stone into glass",
        "inputs": {"stone": 3, "coal": 1},
        "outputs": {"glass": 2},
        "craft_time": 6.0,
        "unlock_level": 15,
        "xp_reward": 12
    },
    "draw_wire": {
        "id": "draw_wire",
        "name": "Draw Wire",
        "description": "Pull copper into thin wire",
        "inputs": {"copper": 1},
        "outputs": {"wire": 2},
        "craft_time": 4.0,
        "unlock_level": 16,
        "xp_reward": 10
    },
    "refine_oil": {
        "id": "refine_oil",
        "name": "Refine Oil",
        "description": "Refine crude oil into gasoline",
        "inputs": {"oil": 3},
        "outputs": {"gasoline": 1, "plastic": 1},
        "craft_time": 10.0,
        "unlock_level": 14,
        "xp_reward": 20
    },
    "make_rubber": {
        "id": "make_rubber",
        "name": "Make Rubber",
        "description": "Process oil into synthetic rubber",
        "inputs": {"oil": 2},
        "outputs": {"rubber": 1},
        "craft_time": 8.0,
        "unlock_level": 17,
        "xp_reward": 18
    },
    
    # Electronics
    "assemble_circuit": {
        "id": "assemble_circuit",
        "name": "Assemble Circuit",
        "description": "Assemble a circuit board",
        "inputs": {"wire": 3, "plastic": 2},
        "outputs": {"circuit": 1},
        "craft_time": 15.0,
        "unlock_level": 18,
        "xp_reward": 35
    },
    "build_electronics": {
        "id": "build_electronics",
        "name": "Build Electronics",
        "description": "Build electronic components",
        "inputs": {"circuit": 2, "plastic": 3, "glass": 1},
        "outputs": {"electronics": 1},
        "craft_time": 20.0,
        "unlock_level": 20,
        "xp_reward": 50
    },
    "assemble_battery": {
        "id": "assemble_battery",
        "name": "Assemble Battery",
        "description": "Create a rechargeable battery",
        "inputs": {"copper": 2, "plastic": 2},
        "outputs": {"battery": 1},
        "craft_time": 12.0,
        "unlock_level": 21,
        "xp_reward": 40
    },
    "build_solar_panel": {
        "id": "build_solar_panel",
        "name": "Build Solar Panel",
        "description": "Construct a solar panel",
        "inputs": {"glass": 4, "wire": 3, "circuit": 1},
        "outputs": {"solar_panel": 1},
        "craft_time": 25.0,
        "unlock_level": 22,
        "xp_reward": 60
    },
    
    # High-tier crafting
    "refine_titanium": {
        "id": "refine_titanium",
        "name": "Refine Titanium",
        "description": "Extract titanium from meteorites",
        "inputs": {"meteorite": 2},
        "outputs": {"titanium": 1},
        "craft_time": 30.0,
        "unlock_level": 35,
        "xp_reward": 100
    },
    "synthesize_alloy": {
        "id": "synthesize_alloy",
        "name": "Synthesize Alien Alloy",
        "description": "Create mysterious alien alloy",
        "inputs": {"meteorite": 5, "titanium": 2, "diamond": 1},
        "outputs": {"alien_alloy": 1},
        "craft_time": 60.0,
        "unlock_level": 40,
        "xp_reward": 250
    }
}

