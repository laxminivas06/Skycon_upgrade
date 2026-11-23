# api_response()

> God node · 89 connections · [backend\main.py](file:///C:/Antigravityyyyy/pydrone/Skycon_upgrade/backend/main.py#L74)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as api_response()
    participant P1 as qr_submit()
    participant P2 as now
    participant P3 as .logDiagnostic()
    participant P4 as .save()
    participant P5 as .setFlightMode()
    participant P6 as .get_status()
    participant P7 as .log_event()
    participant P8 as .sendArmCommand()
    participant P9 as .addStatusMessage()
    participant P10 as .handleRawDetectionEvent()
    participant P11 as fetchWithFallback()
    participant P12 as .start()
    participant P13 as .handleParsedMavlinkMessage()
    participant P14 as .transitionTo()
    participant P15 as .sendDisarmCommand()
    participant P16 as .commandRTL()
    participant P17 as .executeMission()
    participant P18 as .startGroundStationMission()
    participant P19 as .executeMission()
    participant P20 as .probe_network()
    participant P21 as .rebuildMission()
    participant P22 as .getConnectionState()
    participant P23 as .triggerEmergencyRTL()
    participant P24 as .save_georeferenced_detection()
    participant P25 as confirmArmAndLaunch()
    participant P26 as .uploadMissionWaypoints()
    participant P27 as .processFrame()
    participant P28 as .generate_full_audit()
    participant P29 as .addEvent()
    participant P30 as .switchToAutonomousControl()
    participant P31 as .setCircleRadius()
    participant P32 as .switchToSimulationMode()
    participant P33 as .finalizeMission()
    participant P34 as .scanLiveFrameEdgeToEdge()
    participant P35 as .captureAndAnalyzePhoto()
    participant P36 as .configure_hotspot_profile()
    participant P37 as ingest_phone_frame()
    participant P38 as .handleSuccessfulDecode()
    participant P39 as .checkHeartbeatWatchdog()
    participant P40 as .validateMission()
    participant P41 as .recordDetection()
    participant P42 as .triggerSimulatedDetection()
    participant P43 as .reportDecodedQR()
    participant P44 as handleConfirmBoundary()
    participant P45 as .handleIncomingPayload()
    participant P46 as .evaluateBreach()
    participant P47 as .processIncomingSerialBytes()
    participant P48 as .rawSendCommandLong()
    participant P49 as .handleRevisitVerificationComplete()
    participant P50 as .pushAlert()
    participant P51 as ._build_sync_payload()
    participant P52 as .save_payload()
    participant P53 as .startPublishing()
    participant P54 as .uploadItem()
    participant P55 as .generateCircleMission()
    participant P56 as .generateAutonomousSearchMission()
    participant P57 as .ingestCompanionTelemetry()
    participant P58 as .requestMavlinkDataStreams()
    participant P59 as .executeCommandLong()
    participant P60 as .commandFlightModeSafely()
    participant P61 as .logEvent()
    participant P62 as decodeQRFromImageData()
    participant P63 as .export_report_to_disk()
    participant P64 as handleDeleteWaypoint()
    participant P65 as .handleCandidateIdentified()
    participant P66 as .startCircularOrbit()
    participant P67 as .startSubscribing()
    participant P68 as .executeBreachAction()
    participant P69 as .generateConcentricCircleMission()
    participant P70 as .generatePolygonGridMission()
    participant P71 as .runGuidedWaypointSequencer()
    participant P72 as .setHomePoint()
    participant P73 as .onFcMotorsStartedConfirmed()
    participant P74 as .requestRTL()
    participant P75 as .sendQRToRunner()
    participant P76 as .captureAreaSnapshot()
    participant P77 as .handlePotentialTargetDetected()
    participant P78 as missions_collection()
    participant P79 as flask_receive_cloud_telemetry()
    participant P80 as handleSelectPattern()
    participant P81 as .generateWaypointMission()
    participant P82 as .restorePersistentState()
    participant P83 as .getProgress()
    participant P84 as .performPreflightCheck()
    participant P85 as .sendAckToDrone()
    participant P86 as .handleInspectionQRNotFound()
    participant P87 as flask_receive_cloud_events()
    participant P88 as .log_mission_event()
    participant P89 as pollLatestDetection()
    participant P90 as getCenterPoint()
    participant P91 as handleSaveKml()
    participant P92 as .login()
    participant P93 as .returnToCenterTakeoffPoint()
    participant P94 as .stopPublishing()
    participant P95 as .enqueueAndUpload()
    participant P96 as .evaluateTelemetry()
    participant P97 as .generatePathMission()
    participant P98 as .evaluatePreArmSafety()
    participant P99 as .connectDrone()
    participant P100 as .handleIncomingMessage()
    participant P101 as .connect()
    participant P102 as .test_09_offline_spooling_and_deduplication()
    participant P103 as .test_12_laptop_accesses_gcs_from_different_network()
    participant P104 as receive_cloud_telemetry()
    participant P105 as receive_cloud_events()
    participant P106 as handleDedicatedArmClick()
    participant P107 as handleDedicatedDisarmClick()
    participant P108 as handleExportJSON()
    participant P109 as handleExportCSV()
    participant P110 as .computeBoxMetrics()
    participant P111 as .captureAndSendSingleFrame()
    participant P112 as .handleWebRTCSignal()
    participant P113 as .checkSubscriberLiveness()
    participant P114 as .getMetrics()
    participant P115 as .initDefaultLogs()
    participant P116 as .evaluateConnection()
    participant P117 as .startHeartbeatWaitTimeout()
    participant P118 as .updateLuminanceForAutoTorch()
    participant P119 as .isDuplicateDetection()
    participant P120 as .handleHeatmapUpdate()
    participant P121 as .startPathFollowingLoop()
    participant P122 as .handleQRConfirmed()
    participant P123 as handleArm()
    participant P124 as handleDisarm()
    participant P125 as useDashboardTelemetry()
    participant P126 as .switchRole()
    participant P127 as .getEmptyDetection()
    participant P128 as .exportReportCSV()
    participant P129 as .notifyTakeoffInitiated()
    participant P130 as .emitPacket()
    participant P131 as updateHeatmap()
    participant P132 as loop()
    participant P133 as .exportReportJSON()
    participant P134 as .constructor()
    participant P135 as .createAck()
    participant P136 as .generateTargetInspectionWaypoint()
    participant P137 as .generateResumeWaypoint()
    participant P138 as str
    participant P139 as .handle_qr_detected()
    participant P140 as validate_strict_two_digit()
    participant P141 as compute_sha256()
    participant P142 as .append_bounded()
    participant P143 as .register_qr_observation()
    participant P144 as legacy_recon_detections()
    participant P145 as legacy_generic_command()
    participant P146 as drone_mode()
    participant P147 as camera_push_frame()
    participant P148 as drone_emergency_rtl()
    participant P149 as flask_generate_plan()
    participant P150 as system_config_endpoint()
    participant P151 as drone_arm()
    participant P152 as drone_disarm()
    participant P153 as drone_takeoff()
    participant P154 as drone_land()
    participant P155 as drone_rtl()
    participant P156 as geofence_endpoint()
    participant P157 as geomapping_project()
    participant P158 as missions_start()
    participant P159 as camera_status()
    participant P160 as georeferencing_calibrate_endpoint()
    participant P161 as geofence_active()
    participant P162 as missions_active()
    participant P163 as missions_abort()
    participant P164 as flask_get_hotspot_profiles()
    participant P165 as flask_trigger_network_reconnect()
    participant P166 as flask_validate_coordinate()
    participant P167 as flask_receive_coordinate_package()
    participant P168 as auth_login()
    participant P169 as drone_state()
    participant P170 as telemetry_get_history()
    participant P171 as mavlink_connection_status()
    participant P172 as mavlink_set_parameter()
    participant P173 as vision_status()
    participant P174 as vision_heatmap()
    participant P175 as vision_targets()
    participant P176 as qr_latest()
    participant P177 as qr_history()
    participant P178 as mapping_summary()
    participant P179 as geofence_sync_params()
    participant P180 as missions_pause()
    participant P181 as flask_validate_plan()
    participant P182 as events_endpoint()
    participant P183 as flask_hardware_diagnostics()
    participant P184 as flask_export_hardware_diagnostics()
    participant P185 as flask_cloud_sync_status()
    participant P186 as flask_trigger_cloud_sync()
    participant P187 as flask_network_status()
    participant P188 as flask_configure_hotspot_profile()
    participant P189 as flask_delete_hotspot_profile()
    participant P190 as flask_latest_coordinate_package()
    participant P191 as flask_coverage_tracker_status()
    participant P192 as flask_reset_coverage_tracker()
    participant P193 as serve_static_assets()
    participant P194 as auth_logout()
    participant P195 as auth_get_session()
    participant P196 as auth_get_roles()
    participant P197 as system_health_status()
    participant P198 as system_metrics()
    participant P199 as telemetry_get_gps()
    participant P200 as telemetry_get_battery()
    participant P201 as telemetry_get_attitude()
    participant P202 as mavlink_parameters()
    participant P203 as mavlink_prearm_check()
    participant P204 as mavlink_stats()
    participant P205 as camera_health_diagnostics()
    participant P206 as vision_stats()
    participant P207 as qr_validate_payload()
    participant P208 as timesync_status_endpoint()
    participant P209 as georeferencing_status_endpoint()
    participant P210 as mapping_layer_a()
    participant P211 as mapping_layer_b()
    participant P212 as mapping_layer_c()
    participant P213 as geomapping_distance()
    participant P214 as flask_estimate_budget()
    participant P215 as flask_mission_status()
    participant P216 as flask_marshal_auth()
    participant P217 as flask_upload_mission_pixhawk()
    participant P218 as flask_ground_puzzle()
    participant P219 as flask_confirm_unlock()
    participant P220 as flask_confirm_retrieval()
    participant P221 as health_probe()
    participant P222 as mavlink_modes_dict()
    participant P223 as camera_configuration()
    participant P224 as qr_candidates_endpoint()
    participant P225 as qr_confirmed_endpoint()
    participant P226 as flask_mission_stages()
    P0->>+ P1: calls
    P1-->>- P0: return
    P1->>+ P2: calls
    P2-->>- P1: return
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
    P2->>+ P1: calls
    P1-->>- P2: return
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
    P2->>+ P39: calls
    P39-->>- P2: return
    P2->>+ P40: calls
    P40-->>- P2: return
    P2->>+ P41: calls
    P41-->>- P2: return
    P2->>+ P42: calls
    P42-->>- P2: return
    P2->>+ P43: calls
    P43-->>- P2: return
    P2->>+ P44: calls
    P44-->>- P2: return
    P2->>+ P45: calls
    P45-->>- P2: return
    P2->>+ P46: calls
    P46-->>- P2: return
    P2->>+ P47: calls
    P47-->>- P2: return
    P2->>+ P48: calls
    P48-->>- P2: return
    P2->>+ P49: calls
    P49-->>- P2: return
    P2->>+ P50: calls
    P50-->>- P2: return
    P2->>+ P51: calls
    P51-->>- P2: return
    P2->>+ P52: calls
    P52-->>- P2: return
    P2->>+ P53: calls
    P53-->>- P2: return
    P2->>+ P54: calls
    P54-->>- P2: return
    P2->>+ P55: calls
    P55-->>- P2: return
    P2->>+ P56: calls
    P56-->>- P2: return
    P2->>+ P57: calls
    P57-->>- P2: return
    P2->>+ P58: calls
    P58-->>- P2: return
    P2->>+ P59: calls
    P59-->>- P2: return
    P2->>+ P60: calls
    P60-->>- P2: return
    P2->>+ P61: calls
    P61-->>- P2: return
    P2->>+ P62: calls
    P62-->>- P2: return
    P2->>+ P63: calls
    P63-->>- P2: return
    P2->>+ P64: calls
    P64-->>- P2: return
    P2->>+ P65: calls
    P65-->>- P2: return
    P2->>+ P66: calls
    P66-->>- P2: return
    P2->>+ P67: calls
    P67-->>- P2: return
    P2->>+ P68: calls
    P68-->>- P2: return
    P2->>+ P69: calls
    P69-->>- P2: return
    P2->>+ P70: calls
    P70-->>- P2: return
    P2->>+ P71: calls
    P71-->>- P2: return
    P2->>+ P72: calls
    P72-->>- P2: return
    P2->>+ P73: calls
    P73-->>- P2: return
    P2->>+ P74: calls
    P74-->>- P2: return
    P2->>+ P75: calls
    P75-->>- P2: return
    P2->>+ P76: calls
    P76-->>- P2: return
    P2->>+ P77: calls
    P77-->>- P2: return
    P2->>+ P78: calls
    P78-->>- P2: return
    P2->>+ P79: calls
    P79-->>- P2: return
    P2->>+ P80: calls
    P80-->>- P2: return
    P2->>+ P81: calls
    P81-->>- P2: return
    P2->>+ P82: calls
    P82-->>- P2: return
    P2->>+ P83: calls
    P83-->>- P2: return
    P2->>+ P84: calls
    P84-->>- P2: return
    P2->>+ P85: calls
    P85-->>- P2: return
    P2->>+ P86: calls
    P86-->>- P2: return
    P2->>+ P87: calls
    P87-->>- P2: return
    P2->>+ P88: calls
    P88-->>- P2: return
    P2->>+ P89: calls
    P89-->>- P2: return
    P2->>+ P90: calls
    P90-->>- P2: return
    P2->>+ P91: calls
    P91-->>- P2: return
    P2->>+ P92: calls
    P92-->>- P2: return
    P2->>+ P93: calls
    P93-->>- P2: return
    P2->>+ P94: calls
    P94-->>- P2: return
    P2->>+ P95: calls
    P95-->>- P2: return
    P2->>+ P96: calls
    P96-->>- P2: return
    P2->>+ P97: calls
    P97-->>- P2: return
    P2->>+ P98: calls
    P98-->>- P2: return
    P2->>+ P99: calls
    P99-->>- P2: return
    P2->>+ P100: calls
    P100-->>- P2: return
    P2->>+ P101: calls
    P101-->>- P2: return
    P2->>+ P102: calls
    P102-->>- P2: return
    P2->>+ P103: calls
    P103-->>- P2: return
    P2->>+ P104: calls
    P104-->>- P2: return
    P2->>+ P105: calls
    P105-->>- P2: return
    P2->>+ P106: calls
    P106-->>- P2: return
    P2->>+ P107: calls
    P107-->>- P2: return
    P2->>+ P108: calls
    P108-->>- P2: return
    P2->>+ P109: calls
    P109-->>- P2: return
    P2->>+ P110: calls
    P110-->>- P2: return
    P2->>+ P111: calls
    P111-->>- P2: return
    P2->>+ P112: calls
    P112-->>- P2: return
    P2->>+ P113: calls
    P113-->>- P2: return
    P2->>+ P114: calls
    P114-->>- P2: return
    P2->>+ P115: calls
    P115-->>- P2: return
    P2->>+ P116: calls
    P116-->>- P2: return
    P2->>+ P117: calls
    P117-->>- P2: return
    P2->>+ P118: calls
    P118-->>- P2: return
    P2->>+ P119: calls
    P119-->>- P2: return
    P2->>+ P120: calls
    P120-->>- P2: return
    P2->>+ P121: calls
    P121-->>- P2: return
    P2->>+ P122: calls
    P122-->>- P2: return
    P2->>+ P123: calls
    P123-->>- P2: return
    P2->>+ P124: calls
    P124-->>- P2: return
    P2->>+ P125: calls
    P125-->>- P2: return
    P2->>+ P126: calls
    P126-->>- P2: return
    P2->>+ P127: calls
    P127-->>- P2: return
    P2->>+ P128: calls
    P128-->>- P2: return
    P2->>+ P129: calls
    P129-->>- P2: return
    P2->>+ P130: calls
    P130-->>- P2: return
    P2->>+ P131: calls
    P131-->>- P2: return
    P2->>+ P132: calls
    P132-->>- P2: return
    P2->>+ P133: calls
    P133-->>- P2: return
    P2->>+ P134: calls
    P134-->>- P2: return
    P2->>+ P135: calls
    P135-->>- P2: return
    P2->>+ P136: calls
    P136-->>- P2: return
    P2->>+ P137: calls
    P137-->>- P2: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P138: calls
    P138-->>- P1: return
    P1->>+ P7: calls
    P7-->>- P1: return
    P1->>+ P139: calls
    P139-->>- P1: return
    P1->>+ P140: calls
    P140-->>- P1: return
    P1->>+ P141: calls
    P141-->>- P1: return
    P1->>+ P142: calls
    P142-->>- P1: return
    P1->>+ P143: calls
    P143-->>- P1: return
    P1->>+ P144: calls
    P144-->>- P1: return
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
    P0->>+ P78: calls
    P78-->>- P0: return
    P0->>+ P158: calls
    P158-->>- P0: return
    P0->>+ P79: calls
    P79-->>- P0: return
    P0->>+ P159: calls
    P159-->>- P0: return
    P0->>+ P160: calls
    P160-->>- P0: return
    P0->>+ P144: calls
    P144-->>- P0: return
    P0->>+ P161: calls
    P161-->>- P0: return
    P0->>+ P162: calls
    P162-->>- P0: return
    P0->>+ P163: calls
    P163-->>- P0: return
    P0->>+ P87: calls
    P87-->>- P0: return
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
    P0->>+ P188: calls
    P188-->>- P0: return
    P0->>+ P189: calls
    P189-->>- P0: return
    P0->>+ P190: calls
    P190-->>- P0: return
    P0->>+ P191: calls
    P191-->>- P0: return
    P0->>+ P192: calls
    P192-->>- P0: return
    P0->>+ P193: calls
    P193-->>- P0: return
    P0->>+ P194: calls
    P194-->>- P0: return
    P0->>+ P195: calls
    P195-->>- P0: return
    P0->>+ P196: calls
    P196-->>- P0: return
    P0->>+ P197: calls
    P197-->>- P0: return
    P0->>+ P198: calls
    P198-->>- P0: return
    P0->>+ P199: calls
    P199-->>- P0: return
    P0->>+ P200: calls
    P200-->>- P0: return
    P0->>+ P201: calls
    P201-->>- P0: return
    P0->>+ P202: calls
    P202-->>- P0: return
    P0->>+ P203: calls
    P203-->>- P0: return
    P0->>+ P204: calls
    P204-->>- P0: return
    P0->>+ P205: calls
    P205-->>- P0: return
    P0->>+ P206: calls
    P206-->>- P0: return
    P0->>+ P207: calls
    P207-->>- P0: return
    P0->>+ P208: calls
    P208-->>- P0: return
    P0->>+ P209: calls
    P209-->>- P0: return
    P0->>+ P210: calls
    P210-->>- P0: return
    P0->>+ P211: calls
    P211-->>- P0: return
    P0->>+ P212: calls
    P212-->>- P0: return
    P0->>+ P213: calls
    P213-->>- P0: return
    P0->>+ P214: calls
    P214-->>- P0: return
    P0->>+ P215: calls
    P215-->>- P0: return
    P0->>+ P216: calls
    P216-->>- P0: return
    P0->>+ P217: calls
    P217-->>- P0: return
    P0->>+ P218: calls
    P218-->>- P0: return
    P0->>+ P219: calls
    P219-->>- P0: return
    P0->>+ P220: calls
    P220-->>- P0: return
    P0->>+ P221: calls
    P221-->>- P0: return
    P0->>+ P222: calls
    P222-->>- P0: return
    P0->>+ P223: calls
    P223-->>- P0: return
    P0->>+ P224: calls
    P224-->>- P0: return
    P0->>+ P225: calls
    P225-->>- P0: return
    P0->>+ P226: calls
    P226-->>- P0: return
```

## Connections by Relation

### calls
- [[qr_submit()]] `EXTRACTED`
- [[legacy_generic_command()]] `EXTRACTED`
- [[drone_mode()]] `EXTRACTED`
- [[camera_push_frame()]] `EXTRACTED`
- [[drone_emergency_rtl()]] `EXTRACTED`
- [[flask_generate_plan()]] `EXTRACTED`
- [[system_config_endpoint()]] `EXTRACTED`
- [[drone_arm()]] `EXTRACTED`
- [[drone_disarm()]] `EXTRACTED`
- [[drone_takeoff()]] `EXTRACTED`
- [[drone_land()]] `EXTRACTED`
- [[drone_rtl()]] `EXTRACTED`
- [[geofence_endpoint()]] `EXTRACTED`
- [[geomapping_project()]] `EXTRACTED`
- [[missions_collection()]] `EXTRACTED`
- [[missions_start()]] `EXTRACTED`
- [[flask_receive_cloud_telemetry()]] `EXTRACTED`
- [[camera_status()]] `EXTRACTED`
- [[georeferencing_calibrate_endpoint()]] `EXTRACTED`
- [[legacy_recon_detections()]] `EXTRACTED`

### contains
- [[main.py]] `EXTRACTED`

### rationale_for
- [[Standardized response envelope across all API endpoints.]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*