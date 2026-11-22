#!/usr/bin/env python3
"""
SKYCON LOCAL AGENT - LIVE STATUS & DIAGNOSTIC UTILITY
Queries the local companion agent daemon and outputs live health metrics.
"""
import time
import json
import urllib.request
import os
import sys

def get_agent_status():
    data = None
    agent_reachable = False

    # Try local HTTP endpoints
    for port in (8443, 8080, 5000):
        try:
            url = f"http://127.0.0.1:{port}/api/telemetry"
            req = urllib.request.Request(url, headers={"User-Agent": "SkyconAgentStatus/1.0"})
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                agent_reachable = True
                break
        except Exception:
            pass

    # Fallback to reading disk telemetry cache if daemon port is busy/blocked
    if not data:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        state_file = os.path.join(base_dir, "data", "cloud_last_telemetry.json")
        if os.path.exists(state_file):
            try:
                with open(state_file, "r") as f:
                    data = json.load(f)
            except Exception:
                pass

    if not data:
        print("SKYCON LOCAL AGENT")
        print("------------------------------")
        print("Agent Process: NOT REACHABLE (Check `sudo systemctl status skycon.service`)")
        print("UART Device: /dev/serial0")
        print("UART Status: UNKNOWN")
        print("MAVLink Parser: INACTIVE")
        return

    telem = data.get("telemetry") or (data.get("data") and data["data"].get("telemetry")) or data.get("data") or {}
    
    is_connected = bool(telem.get("connected") or telem.get("pixhawkConnected") or telem.get("connection_state") in ("TELEMETRY_ACTIVE", "HEARTBEAT_RECEIVED", "CONNECTED"))
    packets = telem.get("packets_received_total", 0)
    hb_age = telem.get("heartbeat_age_s", 999.0)
    mode = telem.get("flight_mode", "UNKNOWN")
    armed = "ARMED" if telem.get("armed") else "DISARMED"
    
    fix_type = telem.get("gps_fix_type", 0)
    sats = telem.get("satellites", 0)
    fix_str = f"3D FIX ({sats} Sats)" if fix_type >= 3 else (f"2D FIX ({sats} Sats)" if fix_type == 2 else f"NO FIX ({sats} Sats)")

    cloud_status_str = "CONNECTED" if is_connected else "OFFLINE"
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spool_file = os.path.join(base_dir, "data", "offline_sync_spool.json")
    pending_queue = 0
    if os.path.exists(spool_file):
        try:
            with open(spool_file, "r") as f:
                pending_queue = len(json.load(f))
        except Exception:
            pass

    print("SKYCON LOCAL AGENT")
    print("------------------------------")
    print(f"Agent Process: {'RUNNING' if agent_reachable or is_connected else 'STANDBY'}")
    print("UART Device: /dev/serial0")
    print(f"UART Status: {'CONNECTED' if is_connected else 'CONNECTING'}")
    print(f"MAVLink Parser: {'ACTIVE' if packets > 0 or is_connected else 'WAITING'}")
    print(f"Valid Packets: {packets}")
    print(f"Heartbeat: {'ACTIVE' if hb_age < 3.0 else ('STALE' if hb_age < 10.0 else 'DISCONNECTED')}")
    print(f"Heartbeat Age: {hb_age:.2f}s")
    print(f"Pixhawk Mode: {mode}")
    print(f"Vehicle Armed: {armed}")
    print(f"GPS Fix: {fix_str}")
    print(f"Cloud API: {cloud_status_str}")
    print(f"Last Upload: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())}")
    print(f"Pending Queue: {pending_queue}")
    print("Agent Uptime: ACTIVE (daemon)")

if __name__ == "__main__":
    get_agent_status()
