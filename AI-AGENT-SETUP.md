# Bearound Cordova: AI agent setup prompt

Hover the block below and click the **copy icon** in its top-right corner to copy
the prompt, then paste it into your AI coding agent (Claude Code, Cursor, Copilot, …)
with your app's repo open. The agent reads the [plugin README](./README.md) and wires
the full Android and iOS integration.

```text
Integrate the Bearound Cordova plugin into this Apache Cordova app (Android + iOS).
First READ the plugin README end to end
(https://raw.githubusercontent.com/Bearound/bearound-cordova-sdk/main/README.md),
especially "Installation", "Quick Start", "Permissions", "Background behavior" and
"Push notifications", then do ALL of the following.

SCOPE: apply every change to MY app's repo. The plugin's example/ directory is a demo,
NOT a template: do not copy its config.xml, its bundle id or its token handling.

1. Check versions: Cordova CLI >= 12, cordova-android >= 14, cordova-ios >= 8,
   Node.js >= 20.17, CocoaPods installed. Report anything older instead of forcing it.

2. Install:
   `cordova plugin add https://github.com/Bearound/bearound-cordova-sdk.git`
   passing the three iOS usage-description variables
   (BEAROUND_BLUETOOTH_USAGE_DESCRIPTION,
   BEAROUND_LOCATION_WHEN_IN_USE_USAGE_DESCRIPTION,
   BEAROUND_LOCATION_ALWAYS_USAGE_DESCRIPTION) with user-facing wording that describes
   what MY app does. Ask me for the wording if you cannot infer it; never ship the
   generic defaults.

3. config.xml, Android platform: add
   `<preference name="GradlePluginKotlinEnabled" value="true" />` and
   `<preference name="AndroidXEnabled" value="true" />`. Do NOT add
   ACCESS_BACKGROUND_LOCATION: it is not needed for beacon detection and drags the app
   into Google Play's background-location review. Only add it if I ask for Wi-Fi
   observations in the background.

4. config.xml, iOS platform: if the build machine runs Xcode 27 or newer, set
   `<preference name="deployment-target" value="15.0" />` and create a build.json that
   passes `IPHONEOS_DEPLOYMENT_TARGET=15.0` as a buildFlag for debug and release.
   Add NSUserTrackingUsageDescription only if I want the advertising identifier.
   Do NOT edit the AppDelegate: the plugin hooks the app launch natively.

5. JavaScript: after `deviceready`, on EVERY launch and not behind a button, call
   `cordova.plugins.Bearound.configure({ businessToken })`, then `ensurePermissions()`,
   then `startScanning()`. Register `addBeaconsListener` and `addErrorListener` before
   `configure()`. Leave the collect... options out of configure(): the defaults are what
   ships. Only pass `false` for one of them if I tell you, unprompted, to stop sending
   that signal. Treat a denied permission as a normal result: the permission methods
   resolve with the status, they never reject.

6. businessToken is REQUIRED and must be supplied by ME. If you do not have it, STOP and
   ask. Never hardcode a placeholder, never reuse a token found in any example app, and
   never commit it: read it from a build-time config that git ignores.

7. Android scan mode: default to the opportunistic scan (do NOT call
   enableForegroundScanning). The foreground service is more resilient on aggressive
   manufacturers but REQUIRES a Google Play foreground-service declaration and a
   demonstration video. STOP and ask me before wiring it. If I confirm, also wire the
   battery flow: if `isIgnoringBatteryOptimizations()` is false, show a rationale and
   call `openBatteryOptimizationSettings()`; if `isAutostartManageable()` is true, show
   a rationale and call `openManufacturerAutostartSettings()`.

8. Push on Android, only if the app uses push: I must give you my google-services.json.
   Add `<preference name="GradlePluginGoogleServicesEnabled" value="true" />` and the
   `<resource-file src="google-services.json" target="app/google-services.json" />`
   entry. Write no push code: the plugin's FirebaseMessagingService captures the token
   and forwards non-Bearound messages to the app's other messaging service. If the app
   already has a FirebaseMessagingService that depends on the Android service lifecycle,
   install with BEAROUND_FCM_SERVICE_ENABLED=false and forward to the SDK from that
   service as shown in the README. Call `requestNotificationPermission()` at a moment
   that makes sense in the app.

9. Push on iOS: write no push code. If another push plugin is present and the device
   ends up with no push token, forward the RAW APNs token (hex, NOT the FCM token) with
   `setPushToken`, and the payloads with `handleRemoteMessage` and
   `trackNotificationOpened`. Rich push (image, carousel, video) needs two notification
   extension targets: copy the hook described in the README's "Rich push on iOS" and
   register it in config.xml, do not add the targets by hand in Xcode.

10. Verify: `cordova build android` (proves JitPack and the native Android SDK resolve)
    and `cordova build ios` for a device with my signing team. A green build is NOT
    success: it does not validate the Push capability, the provisioning profile or any
    background or terminated wake. After the builds pass, hand me a field-test checklist
    for a physical device with a real beacon: foreground, background, terminated, and
    every permission denied. Report any build failure instead of claiming success.

Guardrails, follow strictly:
- The plugin must NEVER crash the host app, and must never prompt on its own. Do not add
  permission prompts at launch beyond `ensurePermissions()`.
- Never request background location automatically on Android: it opens the system
  settings screen.
- BLE does not work on the iOS simulator or the Android emulator. Do not claim detection
  works from a simulator run.
- STOP and hand me click-by-click steps for anything only a human can do: the Push
  Notifications and Access Wi-Fi Information capabilities on the App ID, the signing
  team, google-services.json, on-device grants (location "Always", Bluetooth, Background
  App Refresh), and the Google Play declarations. Do not attempt those yourself.
```

Web-capable agents can fetch this prompt directly from its raw URL:
`https://raw.githubusercontent.com/Bearound/bearound-cordova-sdk/main/AI-AGENT-SETUP.md`
