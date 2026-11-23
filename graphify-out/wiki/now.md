# now

> God node · 137 connections · [frontend\src\features\dashboard\TacticalLeafletMap.tsx](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/frontend/src/features/dashboard/TacticalLeafletMap.tsx#L375)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as now
    participant P1 as .logDiagnostic()
    participant P2 as .setFlightMode()
    participant P3 as .notifyConnection()
    participant P4 as .sendArmCommand()
    participant P5 as .notifyTelemetry()
    participant P6 as .addStatusMessage()
    participant P7 as fetchWithFallback()
    participant P8 as .commandTakeoff()
    participant P9 as .executeMission()
    participant P10 as .startGroundStationMission()
    participant P11 as .executeMission()
    participant P12 as .flyToPosition()
    participant P13 as confirmArmAndLaunch()
    participant P14 as handlePatternClick()
    participant P15 as .abort()
    participant P16 as .isDirectByteTransportOpen()
    participant P17 as .isTransportConnected()
    participant P18 as .commandHold()
    participant P19 as .sendSetModeMessage()
    participant P20 as .commandVerticalAltitude()
    participant P21 as .commandLand()
    participant P22 as .configureFlightControllerSearchArea()
    participant P23 as .executeCommandLong()
    participant P24 as .commandOrbit()
    participant P25 as .commandStartMission()
    participant P26 as .commandStartSearch()
    participant P27 as .abort()
    participant P28 as .commandFlightModeSafely()
    participant P29 as .executeBreachAction()
    participant P30 as handleStartAutonomousMission()
    participant P31 as handleResetMission()
    participant P32 as .stopExecution()
    participant P33 as .enterLoiterHold()
    participant P34 as .emergencyAbort()
    participant P35 as handleLoiter()
    participant P36 as handleLand()
    participant P37 as encodePx4FlightMode()
    participant P38 as handleModeChange()
    participant P39 as .handleParsedMavlinkMessage()
    participant P40 as .sendDisarmCommand()
    participant P41 as .commandRTL()
    participant P42 as .handleUsbHostStateChange()
    participant P43 as .uploadMissionWaypoints()
    participant P44 as .cleanupMavlinkConnection()
    participant P45 as .switchToSimulationMode()
    participant P46 as .checkHeartbeatWatchdog()
    participant P47 as .sendMavlinkCommandInt()
    participant P48 as .processIncomingSerialBytes()
    participant P49 as .rawSendCommandLong()
    participant P50 as .requestMavlinkDataStreams()
    participant P51 as .setHomePoint()
    participant P52 as .connectHardware()
    participant P53 as .sendRequestDataStream()
    participant P54 as .setCurrentMissionItem()
    participant P55 as .sendMissionItemInt()
    participant P56 as .sendMissionRequestInt()
    participant P57 as .sendMissionAck()
    participant P58 as .sendStatusText()
    participant P59 as .uploadFencePolygon()
    participant P60 as .toggleRCOverride()
    participant P61 as .sendMissionItem()
    participant P62 as .sendMissionRequestList()
    participant P63 as .clearHomePoint()
    participant P64 as .constructor()
    participant P65 as .calibrateGroundAltitude()
    participant P66 as .setWifiSsid()
    participant P67 as .resetWifi()
    participant P68 as .setTransport()
    participant P69 as .sendConditionYaw()
    participant P70 as .sendFenceEnable()
    participant P71 as .clearMissionWaypoints()
    participant P72 as .scanUsbDevices()
    participant P73 as .requestUsbPermission()
    participant P74 as .save()
    participant P75 as .get_status()
    participant P76 as .log_event()
    participant P77 as .handleRawDetectionEvent()
    participant P78 as .start()
    participant P79 as .transitionTo()
    participant P80 as .probe_network()
    participant P81 as .rebuildMission()
    participant P82 as .getConnectionState()
    participant P83 as .triggerEmergencyRTL()
    participant P84 as .save_georeferenced_detection()
    participant P85 as .processFrame()
    participant P86 as .generate_full_audit()
    participant P87 as .addEvent()
    participant P88 as .switchToAutonomousControl()
    participant P89 as qr_submit()
    participant P90 as .setCircleRadius()
    participant P91 as .finalizeMission()
    participant P92 as .scanLiveFrameEdgeToEdge()
    participant P93 as .captureAndAnalyzePhoto()
    participant P94 as .configure_hotspot_profile()
    participant P95 as ingest_phone_frame()
    participant P96 as .handleSuccessfulDecode()
    participant P97 as .validateMission()
    participant P98 as .recordDetection()
    participant P99 as .triggerSimulatedDetection()
    participant P100 as .reportDecodedQR()
    participant P101 as handleConfirmBoundary()
    participant P102 as .handleIncomingPayload()
    participant P103 as .evaluateBreach()
    participant P104 as .handleRevisitVerificationComplete()
    participant P105 as .pushAlert()
    participant P106 as ._build_sync_payload()
    participant P107 as .save_payload()
    participant P108 as .startPublishing()
    participant P109 as .uploadItem()
    participant P110 as .generateCircleMission()
    participant P111 as .generateAutonomousSearchMission()
    participant P112 as .ingestCompanionTelemetry()
    participant P113 as .logEvent()
    participant P114 as decodeQRFromImageData()
    participant P115 as .export_report_to_disk()
    participant P116 as handleDeleteWaypoint()
    participant P117 as .handleCandidateIdentified()
    participant P118 as .startCircularOrbit()
    participant P119 as .startSubscribing()
    participant P120 as .generateConcentricCircleMission()
    participant P121 as .generatePolygonGridMission()
    participant P122 as .runGuidedWaypointSequencer()
    participant P123 as .onFcMotorsStartedConfirmed()
    participant P124 as .requestRTL()
    participant P125 as .sendQRToRunner()
    participant P126 as .captureAreaSnapshot()
    participant P127 as .handlePotentialTargetDetected()
    participant P128 as missions_collection()
    participant P129 as flask_receive_cloud_telemetry()
    participant P130 as handleSelectPattern()
    participant P131 as .generateWaypointMission()
    participant P132 as .restorePersistentState()
    participant P133 as .getProgress()
    participant P134 as .performPreflightCheck()
    participant P135 as .sendAckToDrone()
    participant P136 as .handleInspectionQRNotFound()
    participant P137 as flask_receive_cloud_events()
    participant P138 as .log_mission_event()
    participant P139 as pollLatestDetection()
    participant P140 as getCenterPoint()
    participant P141 as handleSaveKml()
    participant P142 as .login()
    participant P143 as .returnToCenterTakeoffPoint()
    participant P144 as .stopPublishing()
    participant P145 as .enqueueAndUpload()
    participant P146 as .evaluateTelemetry()
    participant P147 as .generatePathMission()
    participant P148 as .evaluatePreArmSafety()
    participant P149 as .connectDrone()
    participant P150 as .handleIncomingMessage()
    participant P151 as .connect()
    participant P152 as .test_09_offline_spooling_and_deduplication()
    participant P153 as .test_12_laptop_accesses_gcs_from_different_network()
    participant P154 as receive_cloud_telemetry()
    participant P155 as receive_cloud_events()
    participant P156 as handleDedicatedArmClick()
    participant P157 as handleDedicatedDisarmClick()
    participant P158 as handleExportJSON()
    participant P159 as handleExportCSV()
    participant P160 as .computeBoxMetrics()
    participant P161 as .captureAndSendSingleFrame()
    participant P162 as .handleWebRTCSignal()
    participant P163 as .checkSubscriberLiveness()
    participant P164 as .getMetrics()
    participant P165 as .initDefaultLogs()
    participant P166 as .evaluateConnection()
    participant P167 as .startHeartbeatWaitTimeout()
    participant P168 as .updateLuminanceForAutoTorch()
    participant P169 as .isDuplicateDetection()
    participant P170 as .handleHeatmapUpdate()
    participant P171 as .startPathFollowingLoop()
    participant P172 as .handleQRConfirmed()
    participant P173 as handleArm()
    participant P174 as handleDisarm()
    participant P175 as useDashboardTelemetry()
    participant P176 as .switchRole()
    participant P177 as .getEmptyDetection()
    participant P178 as .exportReportCSV()
    participant P179 as .notifyTakeoffInitiated()
    participant P180 as .emitPacket()
    participant P181 as updateHeatmap()
    participant P182 as loop()
    participant P183 as .exportReportJSON()
    participant P184 as .constructor()
    participant P185 as .createAck()
    participant P186 as .generateTargetInspectionWaypoint()
    participant P187 as .generateResumeWaypoint()
    P0->>+ P1: calls
    P1-->>- P0: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P2: calls
    P2-->>- P1: return
    P2->>+ P0: calls
    P0-->>- P2: return
    P2->>+ P1: calls
    P1-->>- P2: return
    P2->>+ P3: calls
    P3-->>- P2: return
    P2->>+ P4: calls
    P4-->>- P2: return
    P2->>+ P5: calls
    P5-->>- P2: return
    P2->>+ P6: calls
    P6-->>- P2: return
    P2->>+ P7: calls
    P7-->>- P2: return
    P2->>+ P8: calls
    P8-->>- P2: return
    P2->>+ P9: calls
    P9-->>- P2: return
    P2->>+ P10: calls
    P10-->>- P2: return
    P2->>+ P11: calls
    P11-->>- P2: return
    P2->>+ P12: calls
    P12-->>- P2: return
    P2->>+ P13: calls
    P13-->>- P2: return
    P2->>+ P14: calls
    P14-->>- P2: return
    P2->>+ P15: calls
    P15-->>- P2: return
    P2->>+ P16: calls
    P16-->>- P2: return
    P2->>+ P17: calls
    P17-->>- P2: return
    P2->>+ P18: calls
    P18-->>- P2: return
    P2->>+ P19: calls
    P19-->>- P2: return
    P2->>+ P20: calls
    P20-->>- P2: return
    P2->>+ P21: calls
    P21-->>- P2: return
    P2->>+ P22: calls
    P22-->>- P2: return
    P2->>+ P23: calls
    P23-->>- P2: return
    P2->>+ P24: calls
    P24-->>- P2: return
    P2->>+ P25: calls
    P25-->>- P2: return
    P2->>+ P26: calls
    P26-->>- P2: return
    P2->>+ P27: calls
    P27-->>- P2: return
    P2->>+ P28: calls
    P28-->>- P2: return
    P2->>+ P29: calls
    P29-->>- P2: return
    P2->>+ P30: calls
    P30-->>- P2: return
    P2->>+ P31: calls
    P31-->>- P2: return
    P2->>+ P32: calls
    P32-->>- P2: return
    P2->>+ P33: calls
    P33-->>- P2: return
    P2->>+ P34: calls
    P34-->>- P2: return
    P2->>+ P35: calls
    P35-->>- P2: return
    P2->>+ P36: calls
    P36-->>- P2: return
    P2->>+ P37: calls
    P37-->>- P2: return
    P2->>+ P38: calls
    P38-->>- P2: return
    P1->>+ P3: calls
    P3-->>- P1: return
    P1->>+ P4: calls
    P4-->>- P1: return
    P1->>+ P39: calls
    P39-->>- P1: return
    P1->>+ P40: calls
    P40-->>- P1: return
    P1->>+ P41: calls
    P41-->>- P1: return
    P1->>+ P8: calls
    P8-->>- P1: return
    P1->>+ P42: calls
    P42-->>- P1: return
    P1->>+ P43: calls
    P43-->>- P1: return
    P1->>+ P44: calls
    P44-->>- P1: return
    P1->>+ P18: calls
    P18-->>- P1: return
    P1->>+ P45: calls
    P45-->>- P1: return
    P1->>+ P46: calls
    P46-->>- P1: return
    P1->>+ P19: calls
    P19-->>- P1: return
    P1->>+ P20: calls
    P20-->>- P1: return
    P1->>+ P47: calls
    P47-->>- P1: return
    P1->>+ P48: calls
    P48-->>- P1: return
    P1->>+ P49: calls
    P49-->>- P1: return
    P1->>+ P50: calls
    P50-->>- P1: return
    P1->>+ P24: calls
    P24-->>- P1: return
    P1->>+ P25: calls
    P25-->>- P1: return
    P1->>+ P26: calls
    P26-->>- P1: return
    P1->>+ P51: calls
    P51-->>- P1: return
    P1->>+ P52: calls
    P52-->>- P1: return
    P1->>+ P53: calls
    P53-->>- P1: return
    P1->>+ P54: calls
    P54-->>- P1: return
    P1->>+ P55: calls
    P55-->>- P1: return
    P1->>+ P56: calls
    P56-->>- P1: return
    P1->>+ P57: calls
    P57-->>- P1: return
    P1->>+ P58: calls
    P58-->>- P1: return
    P1->>+ P59: calls
    P59-->>- P1: return
    P1->>+ P60: calls
    P60-->>- P1: return
    P1->>+ P61: calls
    P61-->>- P1: return
    P1->>+ P62: calls
    P62-->>- P1: return
    P1->>+ P63: calls
    P63-->>- P1: return
    P1->>+ P64: calls
    P64-->>- P1: return
    P1->>+ P65: calls
    P65-->>- P1: return
    P1->>+ P66: calls
    P66-->>- P1: return
    P1->>+ P67: calls
    P67-->>- P1: return
    P1->>+ P68: calls
    P68-->>- P1: return
    P1->>+ P69: calls
    P69-->>- P1: return
    P1->>+ P70: calls
    P70-->>- P1: return
    P1->>+ P71: calls
    P71-->>- P1: return
    P1->>+ P72: calls
    P72-->>- P1: return
    P1->>+ P73: calls
    P73-->>- P1: return
    P0->>+ P74: calls
    P74-->>- P0: return
    P0->>+ P2: calls
    P2-->>- P0: return
    P0->>+ P75: calls
    P75-->>- P0: return
    P0->>+ P76: calls
    P76-->>- P0: return
    P0->>+ P4: calls
    P4-->>- P0: return
    P0->>+ P6: calls
    P6-->>- P0: return
    P0->>+ P77: calls
    P77-->>- P0: return
    P0->>+ P7: calls
    P7-->>- P0: return
    P0->>+ P78: calls
    P78-->>- P0: return
    P0->>+ P39: calls
    P39-->>- P0: return
    P0->>+ P79: calls
    P79-->>- P0: return
    P0->>+ P40: calls
    P40-->>- P0: return
    P0->>+ P41: calls
    P41-->>- P0: return
    P0->>+ P9: calls
    P9-->>- P0: return
    P0->>+ P10: calls
    P10-->>- P0: return
    P0->>+ P11: calls
    P11-->>- P0: return
    P0->>+ P80: calls
    P80-->>- P0: return
    P0->>+ P81: calls
    P81-->>- P0: return
    P0->>+ P82: calls
    P82-->>- P0: return
    P0->>+ P83: calls
    P83-->>- P0: return
    P0->>+ P84: calls
    P84-->>- P0: return
    P0->>+ P13: calls
    P13-->>- P0: return
    P0->>+ P43: calls
    P43-->>- P0: return
    P0->>+ P85: calls
    P85-->>- P0: return
    P0->>+ P86: calls
    P86-->>- P0: return
    P0->>+ P87: calls
    P87-->>- P0: return
    P0->>+ P88: calls
    P88-->>- P0: return
    P0->>+ P89: calls
    P89-->>- P0: return
    P0->>+ P90: calls
    P90-->>- P0: return
    P0->>+ P45: calls
    P45-->>- P0: return
    P0->>+ P91: calls
    P91-->>- P0: return
    P0->>+ P92: calls
    P92-->>- P0: return
    P0->>+ P93: calls
    P93-->>- P0: return
    P0->>+ P94: calls
    P94-->>- P0: return
    P0->>+ P95: calls
    P95-->>- P0: return
    P0->>+ P96: calls
    P96-->>- P0: return
    P0->>+ P46: calls
    P46-->>- P0: return
    P0->>+ P97: calls
    P97-->>- P0: return
    P0->>+ P98: calls
    P98-->>- P0: return
    P0->>+ P99: calls
    P99-->>- P0: return
    P0->>+ P100: calls
    P100-->>- P0: return
    P0->>+ P101: calls
    P101-->>- P0: return
    P0->>+ P102: calls
    P102-->>- P0: return
    P0->>+ P103: calls
    P103-->>- P0: return
    P0->>+ P48: calls
    P48-->>- P0: return
    P0->>+ P49: calls
    P49-->>- P0: return
    P0->>+ P104: calls
    P104-->>- P0: return
    P0->>+ P105: calls
    P105-->>- P0: return
    P0->>+ P106: calls
    P106-->>- P0: return
    P0->>+ P107: calls
    P107-->>- P0: return
    P0->>+ P108: calls
    P108-->>- P0: return
    P0->>+ P109: calls
    P109-->>- P0: return
    P0->>+ P110: calls
    P110-->>- P0: return
    P0->>+ P111: calls
    P111-->>- P0: return
    P0->>+ P112: calls
    P112-->>- P0: return
    P0->>+ P50: calls
    P50-->>- P0: return
    P0->>+ P23: calls
    P23-->>- P0: return
    P0->>+ P28: calls
    P28-->>- P0: return
    P0->>+ P113: calls
    P113-->>- P0: return
    P0->>+ P114: calls
    P114-->>- P0: return
    P0->>+ P115: calls
    P115-->>- P0: return
    P0->>+ P116: calls
    P116-->>- P0: return
    P0->>+ P117: calls
    P117-->>- P0: return
    P0->>+ P118: calls
    P118-->>- P0: return
    P0->>+ P119: calls
    P119-->>- P0: return
    P0->>+ P29: calls
    P29-->>- P0: return
    P0->>+ P120: calls
    P120-->>- P0: return
    P0->>+ P121: calls
    P121-->>- P0: return
    P0->>+ P122: calls
    P122-->>- P0: return
    P0->>+ P51: calls
    P51-->>- P0: return
    P0->>+ P123: calls
    P123-->>- P0: return
    P0->>+ P124: calls
    P124-->>- P0: return
    P0->>+ P125: calls
    P125-->>- P0: return
    P0->>+ P126: calls
    P126-->>- P0: return
    P0->>+ P127: calls
    P127-->>- P0: return
    P0->>+ P128: calls
    P128-->>- P0: return
    P0->>+ P129: calls
    P129-->>- P0: return
    P0->>+ P130: calls
    P130-->>- P0: return
    P0->>+ P131: calls
    P131-->>- P0: return
    P0->>+ P132: calls
    P132-->>- P0: return
    P0->>+ P133: calls
    P133-->>- P0: return
    P0->>+ P134: calls
    P134-->>- P0: return
    P0->>+ P135: calls
    P135-->>- P0: return
    P0->>+ P136: calls
    P136-->>- P0: return
    P0->>+ P137: calls
    P137-->>- P0: return
    P0->>+ P138: calls
    P138-->>- P0: return
    P0->>+ P139: calls
    P139-->>- P0: return
    P0->>+ P140: calls
    P140-->>- P0: return
    P0->>+ P141: calls
    P141-->>- P0: return
    P0->>+ P142: calls
    P142-->>- P0: return
    P0->>+ P143: calls
    P143-->>- P0: return
    P0->>+ P144: calls
    P144-->>- P0: return
    P0->>+ P145: calls
    P145-->>- P0: return
    P0->>+ P146: calls
    P146-->>- P0: return
    P0->>+ P147: calls
    P147-->>- P0: return
    P0->>+ P148: calls
    P148-->>- P0: return
    P0->>+ P149: calls
    P149-->>- P0: return
    P0->>+ P150: calls
    P150-->>- P0: return
    P0->>+ P151: calls
    P151-->>- P0: return
    P0->>+ P152: calls
    P152-->>- P0: return
    P0->>+ P153: calls
    P153-->>- P0: return
    P0->>+ P154: calls
    P154-->>- P0: return
    P0->>+ P155: calls
    P155-->>- P0: return
    P0->>+ P156: calls
    P156-->>- P0: return
    P0->>+ P157: calls
    P157-->>- P0: return
    P0->>+ P158: calls
    P158-->>- P0: return
    P0->>+ P159: calls
    P159-->>- P0: return
    P0->>+ P160: calls
    P160-->>- P0: return
    P0->>+ P161: calls
    P161-->>- P0: return
    P0->>+ P162: calls
    P162-->>- P0: return
    P0->>+ P163: calls
    P163-->>- P0: return
    P0->>+ P164: calls
    P164-->>- P0: return
    P0->>+ P165: calls
    P165-->>- P0: return
    P0->>+ P166: calls
    P166-->>- P0: return
    P0->>+ P167: calls
    P167-->>- P0: return
    P0->>+ P168: calls
    P168-->>- P0: return
    P0->>+ P169: calls
    P169-->>- P0: return
    P0->>+ P170: calls
    P170-->>- P0: return
    P0->>+ P171: calls
    P171-->>- P0: return
    P0->>+ P172: calls
    P172-->>- P0: return
    P0->>+ P173: calls
    P173-->>- P0: return
    P0->>+ P174: calls
    P174-->>- P0: return
    P0->>+ P175: calls
    P175-->>- P0: return
    P0->>+ P176: calls
    P176-->>- P0: return
    P0->>+ P177: calls
    P177-->>- P0: return
    P0->>+ P178: calls
    P178-->>- P0: return
    P0->>+ P179: calls
    P179-->>- P0: return
    P0->>+ P180: calls
    P180-->>- P0: return
    P0->>+ P181: calls
    P181-->>- P0: return
    P0->>+ P182: calls
    P182-->>- P0: return
    P0->>+ P183: calls
    P183-->>- P0: return
    P0->>+ P184: calls
    P184-->>- P0: return
    P0->>+ P185: calls
    P185-->>- P0: return
    P0->>+ P186: calls
    P186-->>- P0: return
    P0->>+ P187: calls
    P187-->>- P0: return
```

## Connections by Relation

### calls
- [[.logDiagnostic()]] `INFERRED`
- [[.save()]] `INFERRED`
- [[.setFlightMode()]] `INFERRED`
- [[.get_status()]] `INFERRED`
- [[.log_event()]] `INFERRED`
- [[.sendArmCommand()]] `INFERRED`
- [[.addStatusMessage()]] `INFERRED`
- [[.handleRawDetectionEvent()]] `INFERRED`
- [[fetchWithFallback()]] `INFERRED`
- [[.start()]] `INFERRED`
- [[.handleParsedMavlinkMessage()]] `INFERRED`
- [[.transitionTo()]] `INFERRED`
- [[.sendDisarmCommand()]] `INFERRED`
- [[.commandRTL()]] `INFERRED`
- [[.executeMission()]] `INFERRED`
- [[.startGroundStationMission()]] `INFERRED`
- [[.executeMission()]] `INFERRED`
- [[.probe_network()]] `INFERRED`
- [[.rebuildMission()]] `INFERRED`
- [[.getConnectionState()]] `INFERRED`

### contains
- [[TacticalLeafletMap.tsx]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*