"""
Resource Tycoon - Main Application
A multiplayer resource management tycoon game
"""

import time
import threading
from flask import Flask, render_template, send_from_directory
from flask_socketio import SocketIO, emit

from game import GameState
from game.systems import MarketSystem, AuctionSystem, EventSystem, LeaderboardSystem
from game.data import RESOURCES, BUILDINGS, RECIPES

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

# Initialize game systems
game_state = GameState(data_dir='data')
market = MarketSystem(game_state)
auction = AuctionSystem(game_state, socketio)
events = EventSystem(game_state, socketio)
leaderboard = LeaderboardSystem(game_state)


# =============================================
# HTTP Routes
# =============================================

@app.route('/')
def index():
    """Serve the main game page"""
    return render_template('index.html')


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
    
    # Start background tasks as daemon threads
    game_thread = threading.Thread(target=game_tick, daemon=True, name="GameTick")
    market_thread = threading.Thread(target=market_tick, daemon=True, name="MarketTick")
    event_thread = threading.Thread(target=event_tick, daemon=True, name="EventTick")
    auction_thread = threading.Thread(target=auction_tick, daemon=True, name="AuctionTick")
    
    game_thread.start()
    market_thread.start()
    event_thread.start()
    auction_thread.start()
    
    print("Background threads started: GameTick, MarketTick, EventTick, AuctionTick")


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

