"""
Game Portal - Main Application
Multi-game server with Resource Tycoon and Castle Defenders
"""

import time
import threading
from flask import Flask, render_template, send_from_directory
from flask_socketio import SocketIO, emit

# Resource Tycoon imports
from game import GameState
from game.systems import MarketSystem, AuctionSystem, EventSystem, LeaderboardSystem
from game.data import RESOURCES, BUILDINGS, RECIPES

# Castle Defenders imports
from game.castle_defenders import (
    TOWER_TYPES, ENEMY_TYPES, PERKS,
    CastleGameManager, CastleGame
)
from game.castle_defenders.player import CastlePlayerManager
from game.castle_defenders.game_data import xp_for_level, get_unlocked_towers

# Initialize Flask app
app = Flask(__name__, 
            static_folder='static',
            template_folder='templates')
app.config['SECRET_KEY'] = 'resource-tycoon-secret-key-2024'

# Initialize SocketIO - try different async modes for compatibility
try:
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
except ValueError:
    try:
        socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')
    except ValueError:
        socketio = SocketIO(app, cors_allowed_origins="*")

# Initialize Resource Tycoon game systems
game_state = GameState(data_dir='data')
market = MarketSystem(game_state)
auction = AuctionSystem(game_state, socketio)
events = EventSystem(game_state, socketio)
leaderboard = LeaderboardSystem(game_state)

# Initialize Castle Defenders game systems
cd_player_manager = CastlePlayerManager(data_dir='data')
cd_game_manager = CastleGameManager()
cd_socket_to_game = {}  # socket_id -> game_id mapping


# =============================================
# HTTP Routes
# =============================================

@app.route('/')
def portal():
    """Serve the game portal/launcher page"""
    return render_template('portal.html')


@app.route('/resource-tycoon')
def resource_tycoon():
    """Serve the Resource Tycoon game"""
    return render_template('index.html')


# Legacy route - redirect old links
@app.route('/game')
def game_redirect():
    """Redirect to Resource Tycoon"""
    from flask import redirect
    return redirect('/resource-tycoon')


@app.route('/castle-defenders')
def castle_defenders():
    """Serve the Castle Defenders game"""
    return render_template('castle-defenders.html')


@app.route('/api/resources')
def api_resources():
    """Get all resource definitions"""
    return RESOURCES


@app.route('/api/buildings')
def api_buildings():
    """Get all building definitions"""
    return BUILDINGS


@app.route('/api/recipes')
def api_recipes():
    """Get all recipe definitions"""
    return RECIPES


@app.route('/api/market')
def api_market():
    """Get current market prices"""
    return market.get_prices()


@app.route('/api/leaderboard')
def api_leaderboard():
    """Get all leaderboards"""
    return leaderboard.get_all()


@app.route('/api/auctions')
def api_auctions():
    """Get active auctions"""
    return {"auctions": auction.get_active_auctions()}


# =============================================
# SocketIO Events
# =============================================

@socketio.on('connect')
def handle_connect():
    """Handle new connection"""
    print(f"Client connected: {request.sid if 'request' in dir() else 'unknown'}")


@socketio.on('portal:get_stats')
def handle_portal_stats():
    """Get stats for the game portal"""
    emit('portal:stats', {
        'online_players': game_state.get_player_count()
    })


@socketio.on('disconnect')
def handle_disconnect():
    """Handle disconnection"""
    from flask import request
    player = game_state.get_player(request.sid)
    if player:
        print(f"Player disconnected: {player.username}")
        game_state.save_player(player.id)


@socketio.on('player:register')
def handle_player_register(data):
    """Player registers a new account"""
    from flask import request
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    result = game_state.register_player(request.sid, username, password)
    
    if not result['success']:
        emit('auth:error', {'message': result['message']})
        return
    
    player = result['player']
    _send_player_init(player)


@socketio.on('player:login')
def handle_player_login(data):
    """Player logs in to existing account"""
    from flask import request
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    result = game_state.login_player(request.sid, username, password)
    
    if not result['success']:
        emit('auth:error', {'message': result['message']})
        return
    
    player = result['player']
    _send_player_init(player)


@socketio.on('player:check')
def handle_player_check(data):
    """Check if a username exists"""
    username = data.get('username', '').strip()
    exists = game_state.check_username_exists(username)
    emit('auth:check', {'exists': exists, 'username': username})


@socketio.on('player:join')
def handle_player_join(data):
    """Player joins the game (legacy - auto login/register)"""
    from flask import request
    username = data.get('username', 'Anonymous')[:20]
    password = data.get('password', '')
    
    # Try login first, then register
    if password:
        result = game_state.login_player(request.sid, username, password)
        if not result['success']:
            # Try to register
            result = game_state.register_player(request.sid, username, password)
            if not result['success']:
                emit('auth:error', {'message': result['message']})
                return
        player = result['player']
    else:
        # Legacy mode without password
        player = game_state.create_player(request.sid, username)
    
    _send_player_init(player)


def _send_player_init(player):
    """Send initial game data to player"""
    from flask import request
    
    emit('player:init', {
        'player': player.to_dict(),
        'resources': RESOURCES,
        'buildings': BUILDINGS,
        'recipes': RECIPES,
        'market': market.get_prices(),
        'leaderboard': leaderboard.get_all(),
        'challenges': events.get_current_challenges(request.sid),
        'event': events.get_current_event(),
        'chat_history': game_state.get_chat_history()
    })
    
    # Broadcast to all players
    socketio.emit('player:joined', {
        'username': player.username,
        'playerCount': game_state.get_player_count()
    })
    socketio.emit('leaderboard:update', leaderboard.get_all())


@socketio.on('chat:send')
def handle_chat_send(data):
    """Player sends a chat message"""
    from flask import request
    player = game_state.get_player(request.sid)
    if not player:
        return
    
    message = data.get('message', '').strip()
    if not message:
        return
    
    chat_msg = game_state.add_chat_message(player.id, message)
    if chat_msg:
        socketio.emit('chat:message', chat_msg)


@socketio.on('chat:history')
def handle_chat_history():
    """Get chat history"""
    emit('chat:history', game_state.get_chat_history())


@socketio.on('tutorial:complete')
def handle_tutorial_complete(data):
    """Mark tutorial as completed"""
    from flask import request
    player = game_state.get_player(request.sid)
    if player:
        player.tutorial_completed = True
        player.tutorial_step = data.get('step', 99)
        game_state.save_player(player.id)
        emit('tutorial:saved', {'completed': True})


@socketio.on('resource:gather')
def handle_gather(data):
    """Player gathers a resource"""
    from flask import request
    resource_id = data.get('resourceId')
    
    result = game_state.gather_resource(request.sid, resource_id)
    
    if result['success']:
        # Update challenge progress
        events.update_challenge_progress(request.sid, 'gather', result['amount'], resource_id)
        
        emit('resource:updated', {'resources': result['player_resources']})
        emit('player:xp', {
            'xp': result['xp'],
            'level': result['level'],
            'leveled_up': result['leveled_up']
        })
    else:
        emit('error', {'message': result['message']})


@socketio.on('building:buy')
def handle_buy_building(data):
    """Player buys a building"""
    from flask import request
    building_id = data.get('buildingId')
    
    result = game_state.buy_building(request.sid, building_id)
    
    if result['success']:
        events.update_challenge_progress(request.sid, 'build', 1)
        
        emit('building:purchased', {
            'buildings': result['player_buildings'],
            'resources': result['player_resources'],
            'money': result['money']
        })
        socketio.emit('leaderboard:update', leaderboard.get_all())
    else:
        emit('error', {'message': result['message']})


@socketio.on('building:upgrade')
def handle_upgrade_building(data):
    """Player upgrades a building"""
    from flask import request
    building_id = data.get('buildingId')
    
    result = game_state.upgrade_building(request.sid, building_id)
    
    if result['success']:
        emit('building:upgraded', {
            'buildings': result['player_buildings'],
            'money': result['money']
        })
    else:
        emit('error', {'message': result['message']})


@socketio.on('market:sell')
def handle_market_sell(data):
    """Player sells to market"""
    from flask import request
    resource_id = data.get('resourceId')
    amount = int(data.get('amount', 1))
    
    result = market.sell_resource(request.sid, resource_id, amount)
    
    if result['success']:
        events.update_challenge_progress(request.sid, 'sell', amount, resource_id)
        
        emit('market:sold', {
            'resources': result['player_resources'],
            'money': result['money'],
            'earned': result['earned']
        })
        socketio.emit('market:prices', market.get_prices())
        socketio.emit('leaderboard:update', leaderboard.get_all())
    else:
        emit('error', {'message': result['message']})


@socketio.on('market:buy')
def handle_market_buy(data):
    """Player buys from market"""
    from flask import request
    resource_id = data.get('resourceId')
    amount = int(data.get('amount', 1))
    
    result = market.buy_resource(request.sid, resource_id, amount)
    
    if result['success']:
        emit('market:bought', {
            'resources': result['player_resources'],
            'money': result['money'],
            'spent': result['spent']
        })
        socketio.emit('market:prices', market.get_prices())
    else:
        emit('error', {'message': result['message']})


@socketio.on('craft:item')
def handle_craft(data):
    """Player crafts an item"""
    from flask import request
    recipe_id = data.get('recipeId')
    amount = int(data.get('amount', 1))
    
    result = game_state.craft_item(request.sid, recipe_id, amount)
    
    if result['success']:
        events.update_challenge_progress(request.sid, 'craft', amount)
        
        emit('craft:started', {
            'recipeId': recipe_id,
            'duration': result['duration'],
            'resources': result['player_resources']
        })
    else:
        emit('error', {'message': result['message']})


@socketio.on('auction:create')
def handle_auction_create(data):
    """Player creates an auction"""
    from flask import request
    
    result = auction.create_auction(
        request.sid,
        data.get('resourceId'),
        int(data.get('amount', 1)),
        float(data.get('startingPrice', 10)),
        int(data.get('duration', 300))
    )
    
    if result['success']:
        emit('resource:updated', {'resources': result['player_resources']})
        socketio.emit('auction:new', result['auction'])
    else:
        emit('error', {'message': result['message']})


@socketio.on('auction:bid')
def handle_auction_bid(data):
    """Player bids on an auction"""
    from flask import request
    
    result = auction.place_bid(
        request.sid,
        data.get('auctionId'),
        float(data.get('amount'))
    )
    
    if result['success']:
        emit('player:money', {'money': result['money']})
        socketio.emit('auction:update', result['auction'])
    else:
        emit('error', {'message': result['message']})


@socketio.on('auction:list')
def handle_auction_list():
    """Get list of active auctions"""
    emit('auction:all', auction.get_active_auctions())


@socketio.on('players:list')
def handle_players_list():
    """Get list of players for trading"""
    from flask import request
    emit('players:all', game_state.get_player_list(request.sid))


@socketio.on('trade:offer')
def handle_trade_offer(data):
    """Player sends trade offer"""
    from flask import request
    target_player_id = data.get('targetPlayerId')
    target_socket = game_state.get_player_socket(target_player_id)
    
    if target_socket:
        player = game_state.get_player(request.sid)
        socketio.emit('trade:incoming', {
            'from': request.sid,
            'fromPlayerId': player.id,
            'fromUsername': player.username,
            'offering': data.get('offering', {}),
            'requesting': data.get('requesting', {})
        }, room=target_socket)
        emit('trade:sent', {'success': True})
    else:
        emit('error', {'message': 'Player not online'})


@socketio.on('trade:accept')
def handle_trade_accept(data):
    """Player accepts a trade"""
    from flask import request
    
    player = game_state.get_player(request.sid)
    from_player_id = data.get('fromPlayerId')
    
    result = game_state.execute_trade(
        from_player_id,
        player.id,
        data.get('offering', {}),
        data.get('requesting', {})
    )
    
    if result['success']:
        events.update_challenge_progress(request.sid, 'trade', 1)
        
        # Update both players
        emit('trade:completed', {
            'resources': result['to_resources'],
            'money': result['to_money']
        })
        
        from_socket = game_state.get_player_socket(from_player_id)
        if from_socket:
            events.update_challenge_progress(from_socket, 'trade', 1)
            socketio.emit('trade:completed', {
                'resources': result['from_resources'],
                'money': result['from_money']
            }, room=from_socket)
    else:
        emit('error', {'message': result['message']})


@socketio.on('trade:decline')
def handle_trade_decline(data):
    """Player declines a trade"""
    from_player_id = data.get('fromPlayerId')
    from_socket = game_state.get_player_socket(from_player_id)
    
    if from_socket:
        socketio.emit('trade:declined', {
            'message': 'Trade offer was declined'
        }, room=from_socket)


@socketio.on('challenges:get')
def handle_get_challenges():
    """Get current challenges"""
    from flask import request
    emit('challenges:current', events.get_current_challenges(request.sid))


@socketio.on('challenge:claim')
def handle_claim_challenge(data):
    """Claim challenge reward"""
    from flask import request
    result = events.claim_challenge(request.sid, data.get('challengeId'))
    
    if result['success']:
        emit('challenge:claimed', result)
    else:
        emit('error', {'message': result['message']})


@socketio.on('pollution:cleanup')
def handle_pollution_cleanup():
    """Player cleans up pollution"""
    from flask import request
    result = game_state.cleanup_pollution(request.sid)
    
    if result['success']:
        emit('pollution:updated', {
            'pollution': result['pollution'],
            'money': result['money']
        })
    else:
        emit('error', {'message': result['message']})


# =============================================
# Castle Defenders SocketIO Events
# =============================================

@socketio.on('cd:login')
def handle_cd_login(data):
    """Castle Defenders player login"""
    from flask import request
    player_id = data.get('playerId')
    player_name = data.get('playerName', 'Hero')
    
    player = cd_player_manager.get_or_create_player(player_id, player_name)
    cd_player_manager.connect_player(request.sid, player_id)
    
    emit('cd:loginSuccess', {
        'profile': player.to_dict(),
        'towerTypes': TOWER_TYPES,
        'perks': PERKS,
        'unlockedTowers': get_unlocked_towers(player.level),
        'xpForNextLevel': xp_for_level(player.level + 1)
    })


@socketio.on('cd:joinGame')
def handle_cd_join_game():
    """Castle Defenders player joins a game"""
    from flask import request
    
    player = cd_player_manager.get_player_by_socket(request.sid)
    if not player:
        emit('cd:error', {'message': 'Please login first'})
        return
    
    game = cd_game_manager.find_or_create_game()
    game_player = game.add_player(request.sid, player)
    cd_socket_to_game[request.sid] = game.id
    
    # Start game if in waiting state
    if game.state == 'waiting':
        game.state = 'playing'
    
    emit('cd:gameJoined', {
        'gameId': game.id,
        'state': game.get_state(),
        'playerId': request.sid
    })
    
    # Notify others
    for other_id in game.players:
        if other_id != request.sid:
            socketio.emit('cd:playerJoined', {
                'playerId': request.sid,
                'playerName': player.name,
                'playerLevel': player.level
            }, room=other_id)


@socketio.on('cd:startWave')
def handle_cd_start_wave():
    """Start the next wave in Castle Defenders"""
    from flask import request
    
    game_id = cd_socket_to_game.get(request.sid)
    if not game_id:
        return
    
    game = cd_game_manager.get_game(game_id)
    if not game or game.state != 'playing':
        return
    
    game.start_wave()
    
    for player_id in game.players:
        socketio.emit('cd:waveStarted', {'wave': game.wave}, room=player_id)


@socketio.on('cd:placeTower')
def handle_cd_place_tower(data):
    """Place a tower in Castle Defenders"""
    from flask import request
    
    game_id = cd_socket_to_game.get(request.sid)
    if not game_id:
        emit('cd:actionFailed', {'error': 'Not in a game'})
        return
    
    game = cd_game_manager.get_game(game_id)
    if not game:
        emit('cd:actionFailed', {'error': 'Game not found'})
        return
    
    # Ensure plot_id is an integer
    try:
        plot_id = int(data.get('plotId', -1))
    except (TypeError, ValueError):
        emit('cd:actionFailed', {'error': 'Invalid plot ID'})
        return
    
    tower_type = data.get('towerType')
    if not tower_type:
        emit('cd:actionFailed', {'error': 'No tower type selected'})
        return
    
    result = game.place_tower(request.sid, plot_id, tower_type)
    
    if result['success']:
        for player_id in game.players:
            socketio.emit('cd:towerPlaced', {
                'tower': result['tower'],
                'playerId': request.sid
            }, room=player_id)
    else:
        emit('cd:actionFailed', {'error': result['error']})


@socketio.on('cd:sellTower')
def handle_cd_sell_tower(data):
    """Sell a tower in Castle Defenders"""
    from flask import request
    
    game_id = cd_socket_to_game.get(request.sid)
    if not game_id:
        return
    
    game = cd_game_manager.get_game(game_id)
    if not game:
        return
    
    result = game.sell_tower(request.sid, data.get('plotId'))
    
    if result['success']:
        for player_id in game.players:
            socketio.emit('cd:towerSold', {
                'plotId': data.get('plotId'),
                'playerId': request.sid,
                'refund': result['refund']
            }, room=player_id)
    else:
        emit('cd:actionFailed', {'error': result['error']})


@socketio.on('cd:buyPerk')
def handle_cd_buy_perk(data):
    """Buy a perk upgrade in Castle Defenders"""
    from flask import request
    
    player = cd_player_manager.get_player_by_socket(request.sid)
    if not player:
        return
    
    perk_id = data.get('perkId')
    if player.buy_perk(perk_id):
        cd_player_manager.save_players()
        emit('cd:perkBought', {
            'perkId': perk_id,
            'newLevel': player.perks.get(perk_id, 0),
            'remainingPoints': player.perk_points
        })
    else:
        emit('cd:actionFailed', {'error': 'Could not buy perk'})


@socketio.on('cd:chat')
def handle_cd_chat(data):
    """Castle Defenders chat message"""
    from flask import request
    
    game_id = cd_socket_to_game.get(request.sid)
    player = cd_player_manager.get_player_by_socket(request.sid)
    
    if not game_id or not player:
        return
    
    game = cd_game_manager.get_game(game_id)
    if not game:
        return
    
    message = data.get('message', '')[:200]
    
    for player_id in game.players:
        socketio.emit('cd:chat', {
            'playerId': request.sid,
            'playerName': player.name,
            'message': message
        }, room=player_id)


@socketio.on('disconnect')
def handle_cd_disconnect():
    """Handle Castle Defenders player disconnect"""
    from flask import request
    
    # Handle Castle Defenders disconnect
    game_id = cd_socket_to_game.pop(request.sid, None)
    if game_id:
        game = cd_game_manager.get_game(game_id)
        if game:
            game.remove_player(request.sid)
            
            for player_id in game.players:
                socketio.emit('cd:playerLeft', {'playerId': request.sid}, room=player_id)
            
            if not game.players:
                cd_game_manager.remove_game(game_id)
    
    cd_player_manager.disconnect_player(request.sid)


# =============================================
# Background Tasks
# =============================================

def game_tick():
    """Main game loop - processes production and updates"""
    import time as time_module
    tick_count = 0
    while True:
        try:
            updates = game_state.process_tick()
            
            for player_id, update in updates.items():
                socket_id = game_state.get_player_socket(player_id)
                if socket_id:
                    socketio.emit('tick:update', update, room=socket_id)
            
            # Update leaderboard every second for real-time feel
            tick_count += 1
            if tick_count >= 1:  # Every tick (1 second)
                tick_count = 0
                socketio.emit('leaderboard:update', leaderboard.get_all())
            
            time_module.sleep(1)
        except Exception as e:
            print(f"Game tick error: {e}")
            import traceback
            traceback.print_exc()
            time_module.sleep(1)


def market_tick():
    """Market price fluctuation loop"""
    import time as time_module
    while True:
        try:
            time_module.sleep(30)  # Update every 30 seconds
            market.fluctuate_prices()
            socketio.emit('market:prices', market.get_prices())
        except Exception as e:
            print(f"Market tick error: {e}")


def event_tick():
    """Random events loop"""
    import time as time_module
    while True:
        try:
            time_module.sleep(30)  # Check every 30 seconds for more frequent events
            event = events.check_for_event()
            if event:
                socketio.emit('event:triggered', event)
                
                # Apply market effects
                if event.get('effect') in ['market_crash', 'market_boom', 'shortage', 'boom']:
                    affected = event.get('affected_resources')
                    if event['effect'] == 'market_crash':
                        market.trigger_market_event('crash', affected)
                    elif event['effect'] == 'market_boom':
                        market.trigger_market_event('boom', affected)
                    elif event['effect'] == 'shortage':
                        market.trigger_market_event('shortage', affected)
                    elif event['effect'] == 'boom':
                        market.trigger_market_event('boom', affected)
                    
                    socketio.emit('market:prices', market.get_prices())
        except Exception as e:
            print(f"Event tick error: {e}")
            import traceback
            traceback.print_exc()


def auction_tick():
    """Auction processing loop"""
    import time as time_module
    while True:
        try:
            time_module.sleep(5)  # Check every 5 seconds
            completed = auction.process_auctions()
            
            for completed_auction in completed:
                socketio.emit('auction:completed', completed_auction)
                
                if completed_auction.get('winner'):
                    winner_socket = game_state.get_player_socket(completed_auction['winner'])
                    if winner_socket:
                        events.update_challenge_progress(winner_socket, 'auction', 1)
                        winner = game_state.get_player_by_id(completed_auction['winner'])
                        socketio.emit('auction:won', {
                            'auction': completed_auction,
                            'resources': winner.resources if winner else {}
                        }, room=winner_socket)
        except Exception as e:
            print(f"Auction tick error: {e}")


def castle_defenders_tick():
    """Castle Defenders game update loop"""
    import time as time_module
    last_update = time_module.time() * 1000
    
    while True:
        try:
            time_module.sleep(0.05)  # 20 updates per second
            now = time_module.time() * 1000
            delta_time = now - last_update
            last_update = now
            
            for game in list(cd_game_manager.games.values()):
                if game.state == 'playing':
                    game.update(delta_time)
                    
                    # Send state to all players
                    state = game.get_state()
                    for player_id in game.players:
                        socketio.emit('cd:gameState', state, room=player_id)
                    
                    # Check for game end
                    if game.state == 'ended':
                        results = game.end_game()
                        cd_player_manager.save_players()
                        
                        for player_id in list(game.players.keys()):
                            socketio.emit('cd:gameEnded', {
                                'wave': game.wave,
                                'results': results
                            }, room=player_id)
        except Exception as e:
            print(f"Castle Defenders tick error: {e}")
            import traceback
            traceback.print_exc()


# =============================================
# Background Thread Management
# =============================================

_threads_started = False

def start_background_threads():
    """Start all background game threads (only once)"""
    global _threads_started
    if _threads_started:
        return
    _threads_started = True
    
    import threading
    
    # Start Resource Tycoon background tasks
    game_thread = threading.Thread(target=game_tick, daemon=True, name="GameTick")
    market_thread = threading.Thread(target=market_tick, daemon=True, name="MarketTick")
    event_thread = threading.Thread(target=event_tick, daemon=True, name="EventTick")
    auction_thread = threading.Thread(target=auction_tick, daemon=True, name="AuctionTick")
    
    # Start Castle Defenders background task
    cd_thread = threading.Thread(target=castle_defenders_tick, daemon=True, name="CastleDefendersTick")
    
    game_thread.start()
    market_thread.start()
    event_thread.start()
    auction_thread.start()
    cd_thread.start()
    
    print("Background threads started: GameTick, MarketTick, EventTick, AuctionTick, CastleDefendersTick")


# =============================================
# Main Entry Point
# =============================================

if __name__ == '__main__':
    import os
    
    # Get port from environment variable (for cloud hosting) or default to 5000
    port = int(os.environ.get('PORT', 5000))
    
    print(f"""
    ╔═══════════════════════════════════════════════════════════╗
    ║                   RESOURCE TYCOON                         ║
    ║═══════════════════════════════════════════════════════════║
    ║  A Multiplayer Resource Management Game                   ║
    ║                                                           ║
    ║  Starting server on http://localhost:{port}                 ║
    ║  Press Ctrl+C to stop                                     ║
    ╚═══════════════════════════════════════════════════════════╝
    """)
    
    # Start background threads
    start_background_threads()
    
    # Run the server
    socketio.run(app, host='0.0.0.0', port=port, debug=False, allow_unsafe_werkzeug=True)

