"""
=====================================================================================
SKYCON MASTER ARCHITECTURE - COMMUNICATION FOUNDATION
MODULE: communication_monitor.py
Real-Time Link Health, Latency Tracking & Communication Diagnostics
=====================================================================================
Features:
  - Calculates Rolling Round-Trip Latency (RTT) & Exponential Moving Average (EMA)
  - Tracks Link Health (HEALTHY, DEGRADED, CRITICAL, OFFLINE)
  - Monitors Packet Loss Rate & Retransmission Ratios
  - Produces Standardized Diagnostic Telemetry for GCS Diagnostics Panel
=====================================================================================
"""

import time
from typing import Dict, Any, Optional
from collections import deque


class CommunicationMonitor:
    """
    Monitors bidirectional wireless link performance between companion computer,
    ESP32-S3, and Ground Station.
    """
    def __init__(
        self,
        rtt_window_size: int = 20,
        degraded_rtt_threshold_ms: float = 350.0,
        critical_rtt_threshold_ms: float = 1000.0,
        loss_threshold_degraded: float = 0.10,   # 10% loss
        loss_threshold_critical: float = 0.25    # 25% loss
    ):
        self.rtt_window_size = rtt_window_size
        self.degraded_rtt_ms = degraded_rtt_threshold_ms
        self.critical_rtt_ms = critical_rtt_threshold_ms
        self.loss_threshold_degraded = loss_threshold_degraded
        self.loss_threshold_critical = loss_threshold_critical

        # RTT Tracking
        self._rtt_samples: deque = deque(maxlen=rtt_window_size)
        self.avg_rtt_ms: float = 0.0
        self.ema_rtt_ms: float = 0.0

        # Physical link state
        self.pi_agent_connected: bool = True
        self.esp32_connected: bool = True
        self.wifi_connected: bool = False
        self.wifi_ssid: str = "Unknown"
        self.rssi_dbm: int = -99
        self.last_rx_timestamp: float = 0.0
        self.last_tx_timestamp: float = 0.0

        # Rolling counters
        self.packets_transmitted: int = 0
        self.packets_received: int = 0
        self.packets_lost: int = 0
        self.acks_received: int = 0
        self.retries_count: int = 0

    def record_tx(self, count: int = 1):
        self.packets_transmitted += count
        self.last_tx_timestamp = time.time()

    def record_rx(self, count: int = 1):
        self.packets_received += count
        self.last_rx_timestamp = time.time()

    def record_ack(self, rtt_ms: Optional[float] = None):
        self.acks_received += 1
        self.last_rx_timestamp = time.time()
        if rtt_ms is not None and rtt_ms > 0:
            self._rtt_samples.append(rtt_ms)
            self.avg_rtt_ms = sum(self._rtt_samples) / len(self._rtt_samples)
            if self.ema_rtt_ms == 0.0:
                self.ema_rtt_ms = rtt_ms
            else:
                self.ema_rtt_ms = (0.2 * rtt_ms) + (0.8 * self.ema_rtt_ms)

    def record_retry(self, count: int = 1):
        self.retries_count += count

    def record_packet_drop(self, count: int = 1):
        self.packets_lost += count

    def update_hardware_status(
        self,
        esp32_connected: bool,
        wifi_connected: bool,
        rssi_dbm: int,
        wifi_ssid: Optional[str] = None
    ):
        self.esp32_connected = esp32_connected
        self.wifi_connected = wifi_connected
        self.rssi_dbm = rssi_dbm
        if wifi_ssid:
            self.wifi_ssid = wifi_ssid

    def get_loss_rate(self) -> float:
        total = self.packets_transmitted
        if total == 0:
            return 0.0
        return min(1.0, max(0.0, self.packets_lost / float(total)))

    def get_health_status(self) -> str:
        """
        Determines qualitative connection health state:
        HEALTHY, DEGRADED, CRITICAL, or OFFLINE.
        """
        now = time.time()
        silence_s = now - self.last_rx_timestamp if self.last_rx_timestamp > 0 else 999.0

        if not self.pi_agent_connected or silence_s > 6.0:
            return "OFFLINE"

        loss_rate = self.get_loss_rate()
        effective_rtt = self.ema_rtt_ms or self.avg_rtt_ms

        if loss_rate >= self.loss_threshold_critical or effective_rtt >= self.critical_rtt_ms or silence_s > 3.0:
            return "CRITICAL"
        elif loss_rate >= self.loss_threshold_degraded or effective_rtt >= self.degraded_rtt_ms:
            return "DEGRADED"

        return "HEALTHY"

    def get_diagnostic_report(self) -> Dict[str, Any]:
        """Produces full diagnostic payload matching Frontend Diagnostics Panel."""
        now = time.time()
        time_since_last_rx_ms = int((now - self.last_rx_timestamp) * 1000) if self.last_rx_timestamp > 0 else -1

        return {
            "health_status": self.get_health_status(),
            "pi_agent_connected": self.pi_agent_connected,
            "companion_connected": self.pi_agent_connected,
            "esp32_connected": self.esp32_connected,
            "wifi_connected": self.wifi_connected,
            "wifi_ssid": self.wifi_ssid,
            "rssi_dbm": self.rssi_dbm,
            "packets_transmitted": self.packets_transmitted,
            "packets_received": self.packets_received,
            "packets_lost": self.packets_lost,
            "retries_count": self.retries_count,
            "acks_received": self.acks_received,
            "avg_latency_ms": round(self.avg_rtt_ms, 2),
            "ema_latency_ms": round(self.ema_rtt_ms, 2),
            "packet_loss_rate": round(self.get_loss_rate() * 100.0, 1),
            "last_rx_age_ms": time_since_last_rx_ms,
            "timestamp": int(now * 1000)
        }
