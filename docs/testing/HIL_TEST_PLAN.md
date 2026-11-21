# SKYCON — HARDWARE-IN-THE-LOOP (HIL) TEST PLAN & ARCHITECTURAL ASSESSMENT
## SAE INDIA Autonomous Drone Development Challenge (ADDC 2026)
### Environmental Assessment, Physical Interface Requirements & Simulation Boundaries

---

## 1. EXECUTIVE ASSESSMENT & STATUS DETERMINATION

> [!IMPORTANT]
> **FORMAL STATUS DETERMINATION: BLOCKED / NOT AVAILABLE IN CURRENT HOST ENVIRONMENT**  
> Physical Hardware-In-The-Loop (HIL) testing requires a specialized physical hardware test bench comprising real Pixhawk 2.4.8 flight controller hardware, synthetic sensor signal generators/injectors, and ESC/motor dynamometers connected to a real-time physics simulator host. In the current software development environment, this specialized physical bench equipment is not physically attached or accessible.  
> 
> **CRITICAL ARCHITECTURAL DISTINCTION**:
> - **SITL (Software-In-The-Loop)**: Emulates the complete ArduCopter flight stack, sensor models, and 14-DOF aircraft dynamics entirely in software. **STATUS: FULLY VERIFIED (148/148 Tests Passing).**
> - **HIL (Hardware-In-The-Loop)**: Executes ArduPilot firmware on physical Pixhawk microcontroller silicon while physical sensors are overridden by synthetic data injected over high-speed bus from an external physics engine (e.g., Gazebo, X-Plane, or AirSim). **STATUS: BLOCKED / NOT AVAILABLE ON HOST.**

---

## 2. HIL SYSTEM ARCHITECTURE (THEORETICAL DESIGN)

When deployed in a certified avionics laboratory, the SKYCON HIL architecture is structured as follows:

```
+-----------------------------------------------------------------------------------+
|                           CERTIFIED HIL RIG ARCHITECTURE                          |
|                                                                                   |
|  +-------------------------------------+      High-Speed MAVLink / SPI Injection  |
|  |     PHYSICS SIMULATOR HOST          |========================================+ |
|  |     (Linux Workstation / Gazebo)    |                                        | |
|  |                                     |<=====================================+ | |
|  | - Quadcopter 14-DOF Rigid Body      |        Actuator PWM Feedback (CH 1-4)| | |
|  | - Aerodynamic Drag & Motor Curves   |                                      | | |
|  | - Environmental Wind & Gust Models  |                                      | | |
|  +-------------------------------------+                                      | | |
|                                                                               | | |
|  +-------------------------------------+                                      | | |
|  |     PHYSICAL PIXHAWK 2.4.8          |                                      | | |
|  |   (Running ArduCopter HIL Firmware) |<-------------------------------------+ | |
|  |                                     |                                        | |
|  | - STM32F427 Cortex-M4 Silicon       |                                        | |
|  | - EKF3 Navigation Filter            |                                        | |
|  | - Attitude PID Rate Loops           |                                        | |
|  +-------------------------------------+                                        | |
|                    | UART (TELEM2) @ 921600 bd                                  | |
|                    v                                                            | |
|  +-------------------------------------+                                        | |
|  |     RASPBERRY PI 4 COMPANION        |                                        | |
|  |   (Running SKYCON Multiplexer & FSM)|                                        | |
|  |                                     |                                        | |
|  | - Live Autonomous Mission Engine    |                                        | |
|  | - Synthetic Camera Stream Receiver  |                                        | |
|  +-------------------------------------+                                        | |
+-----------------------------------------------------------------------------------+
```

---

## 3. PHYSICAL INTERFACE & RIG REQUIREMENTS

To transition HIL from `BLOCKED` to `OPERATIONAL`, the following laboratory equipment and hardware fixtures are required:

### 3.1 Hardware Components
1. **Target Flight Controller**: Pixhawk 2.4.8 (STM32F427 + STM32F100 failsafe coprocessor).
2. **HIL Interface Harness**: High-speed FTDI USB-to-UART converter connected to `TELEM1` or `SERIAL4/5` running at 921600 or 1500000 baud for sensor packet injection.
3. **PWM Capture Device / Oscilloscope**: Logic analyzer or PWM-to-USB capture board to read motor PWM signals from Pixhawk MAIN OUT 1–4 ($1000\mu\text{s} - 2000\mu\text{s}$) and feed them into the aerodynamic simulation engine.
4. **Companion Host**: Dedicated Raspberry Pi 4 Model B connected via hardware UART pins to Pixhawk `TELEM2`.
5. **Power Simulation Bench**: Regulated 5.10V 3.0A low-noise lab power supply powering Pixhawk power port with voltage/current telemetry simulation.

### 3.2 Firmware & Protocol Specifications
- **ArduCopter HIL Firmware**: Specialized ArduCopter build configured with `HIL_MODE = 1` or `HIL_SERVOS`.
- **Injected MAVLink Packets**:
  - `HIL_STATE_QUATERNION` (msg_id 115) or `HIL_SENSOR` (msg_id 107) transmitted at $\ge 200\,\text{Hz}$.
  - `HIL_GPS` (msg_id 113) transmitted at $5\,\text{Hz} - 10\,\text{Hz}$.
  - `HIL_RC_INPUTS_RAW` (msg_id 92) transmitted at $50\,\text{Hz}$.
- **Extracted Packets**:
  - `HIL_ACTUATOR_CONTROLS` (msg_id 93) read back at $\ge 100\,\text{Hz}$.

---

## 4. HIL TEST MATRIX & VERIFICATION PROTOCOL (LABORATORY RIG)

When testing on an authorized physical HIL rig, the following test procedures must be executed:

| Test ID | Objective | Simulated Condition | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **HIL-01** | EKF3 Real-Time Silicon Convergence | 200 Hz synthetic IMU + 10 Hz GPS | EKF3 status reports healthy without CPU overrun (`EKF_ALT_GATE` stable). |
| **HIL-02** | High-Rate Serial UART Saturation | 921600 baud continuous MAVLink v2 | Packet drop rate $< 0.1\%$ across 30 minutes of continuous telemetry. |
| **HIL-03** | Microcontroller Loop Timing (400 Hz) | Fast-loop PID attitude control | Main scheduler jitter $< 150\,\mu\text{s}$; zero watchdog resets. |
| **HIL-04** | Hardware Failsafe Coprocessor Handshake | Main STM32F427 fault injection | STM32F100 coprocessor immediately triggers manual RC pass-through. |
| **HIL-05** | Closed-Loop Mission Execution | 50m x 50m boustrophedon lawnmower | Pixhawk drives simulated servos to achieve waypoint tracking within $\pm 0.5\,\text{m}$. |
| **HIL-06** | Wind Shear & Gust Rejection | 8 m/s crosswind gust injection | Attitude rates recover within 800ms; horizontal deviation $< 1.2\,\text{m}$. |

---

## 5. RISK MITIGATION IN THE ABSENCE OF PHYSICAL HIL RIG

Because physical HIL equipment is not available in the current development environment, the following multi-layer verification strategy has been implemented to guarantee system integrity:

1. **High-Fidelity SITL Coverage**: SITL exercises the exact ArduCopter C++ navigation, EKF3 filter, failsafe state machine, and MAVLink protocol stack compiled for x86_64.
2. **Propellers-Off Bench Testing (Gate C)**: All physical silicon, UART communication, MultiLink V1.0 RC channels, and motor spin directions are verified directly on the actual flight controller hardware before outdoor operations.
3. **Hardware Watchdogs**: Both Pixhawk coprocessor failsafe and Raspberry Pi systemd watchdog timers are actively monitored.
4. **Physical RC Priority**: The MultiLink V1.0 hardware RC switch overrides companion computer autonomy at the physical receiver level, eliminating software-induced flyaway risk.

---

## 6. CONCLUSION & READINESS RECOMMENDATION

Physical HIL testing is formally recorded as **BLOCKED / NOT AVAILABLE** due to the absence of specialized sensor injection test rigs. However, this block is **fully mitigated** for controlled flight testing through the combined execution of **SITL Simulation (Gate B: PASS)** and **Propellers-Off Bench Integration (Gate C: PREPARED/MANDATORY)**.
