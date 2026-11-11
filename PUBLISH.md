# Release guide: @bearound/cordova-sdk

The major and minor version follow the native Bearound SDK the plugin is built on. A patch
release may carry changes of the plugin alone (documentation, bridge fixes).

## Before releasing

The native SDKs must already be published in the target version:

| SDK | Registry |
| --- | --- |
| Android (`bearound-android-sdk`) | [JitPack](https://jitpack.io/#Bearound/bearound-android-sdk), tag with the `v` prefix |
| iOS (`BearoundSDK`) | [CocoaPods](https://cocoapods.org/pods/BearoundSDK) |

## Steps

1. Update the native pins, which must stay in lockstep:
   - `src/android/bearound.gradle`: `com.github.Bearound:bearound-android-sdk:vX.Y.Z`
   - `plugin.xml`: the `BearoundSDK` pod `spec`, the plugin `version`
   - `package.json`: `version` and the `engines.cordovaDependencies` key
2. Update `CHANGELOG.md` and the versions quoted in `README.md`.
3. Run `npm test`, then build the example on both platforms (see `README.md`, "Example
   app") and repeat the device checks on a physical Android and iOS device.
4. Open a pull request and merge it into `main`.
5. Tag `main` with `vX.Y.Z` and push the tag. The `Publish` workflow runs the tests,
   checks that the tag matches `package.json` and publishes to npm.
6. Create the GitHub release from the tag, with the changelog entry as notes.

## npm token

The `Publish` workflow needs the `NPM_TOKEN` repository secret: a Granular Access Token
or an Automation token with publish rights on the `@bearound` scope. A token that asks
for a one-time password fails in CI.

The workflow skips the publish step when the version is already on npm, so re-running it
is safe.
