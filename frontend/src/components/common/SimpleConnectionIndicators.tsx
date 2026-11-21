import React from 'react';
import { Wifi, Radio, Cpu } from 'lucide-react';

interface SimpleConnectionIndicatorsProps {
  isWifiConnected: boolean;
  isMavlinkConnected: boolean;
  isPixhawkConnected: boolean;
  className?: string;
}

/**
 * Simplified 3-Symbol Connection Indicators
 * 
 * Requirements:
 * - Only 3 symbols: Wi-Fi, MAVLink, Pixhawk
 * - Green symbol = Connected
 * - Default/neutral symbol colour = Not connected (text-slate-500)
 * - NO additional text (e.g. no "Connected", "Not Connected", or "Link Lost")
 * - Compact and aligned in top navigation area
 */
export const SimpleConnectionIndicators: React.FC<SimpleConnectionIndicatorsProps> = ({
  isWifiConnected,
  isMavlinkConnected,
  isPixhawkConnected,
  className = ''
}) => {
  return (
    <div
      className={`flex items-center gap-2 sm:gap-2.5 px-2.5 py-1 rounded-[8px] bg-[#161B22] border border-[var(--uav-card-border)] shrink-0 shadow-sm ${className}`}
      title={`Wi-Fi: ${isWifiConnected ? 'Connected' : 'Not Connected'} | MAVLink: ${isMavlinkConnected ? 'Connected' : 'Not Connected'} | Pixhawk: ${isPixhawkConnected ? 'Connected' : 'Not Connected'}`}
    >
      {/* 1. Wi-Fi Symbol */}
      <span
        title={isWifiConnected ? 'Wi-Fi: Connected' : 'Wi-Fi: Not Connected'}
        className="flex items-center justify-center transition-colors"
      >
        <Wifi
          className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${
            isWifiConnected ? 'text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'text-slate-500'
          }`}
        />
      </span>

      {/* 2. MAVLink Symbol */}
      <span
        title={isMavlinkConnected ? 'MAVLink: Connected' : 'MAVLink: Not Connected'}
        className="flex items-center justify-center transition-colors"
      >
        <Radio
          className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${
            isMavlinkConnected ? 'text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'text-slate-500'
          }`}
        />
      </span>

      {/* 3. Pixhawk Symbol */}
      <span
        title={isPixhawkConnected ? 'Pixhawk: Connected' : 'Pixhawk: Not Connected'}
        className="flex items-center justify-center transition-colors"
      >
        <Cpu
          className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${
            isPixhawkConnected ? 'text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'text-slate-500'
          }`}
        />
      </span>
    </div>
  );
};

export default SimpleConnectionIndicators;
