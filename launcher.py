#!/usr/bin/env python3
"""
Resource Tycoon Server Launcher
Double-click to start the game server!
"""

import os
import sys
import webbrowser
import threading
import time

# Set up paths for PyInstaller
if getattr(sys, 'frozen', False):
    # Running as compiled executable
    BASE_DIR = os.path.dirname(sys.executable)
else:
    # Running as script
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

os.chdir(BASE_DIR)

# Add the base directory to path
sys.path.insert(0, BASE_DIR)

def open_browser():
    """Open browser after a short delay"""
    time.sleep(2)
    webbrowser.open('http://localhost:5000')

def main():
    print("""
    ╔═══════════════════════════════════════════════════════════╗
    ║                   RESOURCE TYCOON                         ║
    ║═══════════════════════════════════════════════════════════║
    ║  A Multiplayer Resource Management Game                   ║
    ║                                                           ║
    ║  Server starting on http://localhost:5000                 ║
    ║  Your browser will open automatically!                    ║
    ║                                                           ║
    ║  Press Ctrl+C to stop the server                          ║
    ╚═══════════════════════════════════════════════════════════╝
    """)
    
    # Open browser in background thread
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()
    
    # Import and run the app
    from app import app, socketio, start_background_threads
    
    # Start the game loop threads (production, market, events, auctions)
    start_background_threads()
    
    try:
        socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
    except KeyboardInterrupt:
        print("\nServer stopped.")

if __name__ == '__main__':
    main()

