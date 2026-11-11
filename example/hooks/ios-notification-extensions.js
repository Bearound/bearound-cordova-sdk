#!/usr/bin/env node
'use strict';

// Cordova hook (after_prepare, iOS): adds the two app extensions Bearound rich push needs
// on iOS, a Notification Service Extension (attaches the image or video) and a
// Notification Content Extension (draws the image, two-card and carousel layouts).
//
// A Cordova plugin cannot add targets, so an app that wants rich push on iOS does it in
// its own project. This hook is the example's way of doing it, and a starting point for
// an app: it is idempotent and safe to run on every prepare.
//
// What it does:
//   1. writes the sources and Info.plist of both extensions under platforms/ios/
//   2. adds both targets to App.xcodeproj, embedded in the app
//   3. adds both targets to the Podfile with the BearoundSDKNotificationExtensions pod
//      and runs `pod install`

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const POD_VERSION = '3.18.0';
const DEPLOYMENT_TARGET = '15.0';
const PODFILE_MARKER = '# bearound-notification-extensions';

const EXTENSIONS = [
  {
    name: 'NotificationService',
    sourceFile: 'NotificationService.swift',
    source: [
      'import BearoundSDKNotificationExtensions',
      '',
      'class NotificationService: BearoundNotificationService {}',
      '',
    ].join('\n'),
    extensionPoint: 'com.apple.usernotifications.service',
    principalClass: '$(PRODUCT_MODULE_NAME).NotificationService',
    attributes: '',
  },
  {
    name: 'NotificationContent',
    sourceFile: 'NotificationViewController.swift',
    source: [
      'import BearoundSDKNotificationExtensions',
      '',
      'class NotificationViewController: BearoundNotificationViewController {}',
      '',
    ].join('\n'),
    extensionPoint: 'com.apple.usernotifications.content-extension',
    principalClass: '$(PRODUCT_MODULE_NAME).NotificationViewController',
    // BEAROUND_PLAY is left out on purpose: a content extension that claims a category
    // replaces the system view, and for PLAY the system view is the video player.
    attributes: [
      '\t\t<key>NSExtensionAttributes</key>',
      '\t\t<dict>',
      '\t\t\t<key>UNNotificationExtensionCategory</key>',
      '\t\t\t<array>',
      '\t\t\t\t<string>BEAROUND_IMAGE</string>',
      '\t\t\t\t<string>BEAROUND_TWO_IMAGES</string>',
      '\t\t\t\t<string>BEAROUND_CAROUSEL</string>',
      '\t\t\t</array>',
      '\t\t\t<key>UNNotificationExtensionInitialContentSizeRatio</key>',
      '\t\t\t<real>0.75</real>',
      '\t\t\t<key>UNNotificationExtensionUserInteractionEnabled</key>',
      '\t\t\t<true/>',
      '\t\t</dict>',
      '',
    ].join('\n'),
  },
];

function infoPlist(extension) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '\t<key>CFBundleDevelopmentRegion</key>',
    '\t<string>$(DEVELOPMENT_LANGUAGE)</string>',
    '\t<key>CFBundleDisplayName</key>',
    `\t<string>${extension.name}</string>`,
    '\t<key>CFBundleExecutable</key>',
    '\t<string>$(EXECUTABLE_NAME)</string>',
    '\t<key>CFBundleIdentifier</key>',
    '\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>',
    '\t<key>CFBundleInfoDictionaryVersion</key>',
    '\t<string>6.0</string>',
    '\t<key>CFBundleName</key>',
    '\t<string>$(PRODUCT_NAME)</string>',
    '\t<key>CFBundlePackageType</key>',
    '\t<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>',
    '\t<key>CFBundleShortVersionString</key>',
    '\t<string>$(MARKETING_VERSION)</string>',
    '\t<key>CFBundleVersion</key>',
    '\t<string>$(CURRENT_PROJECT_VERSION)</string>',
    '\t<key>NSExtension</key>',
    '\t<dict>',
    extension.attributes + '\t\t<key>NSExtensionPointIdentifier</key>',
    `\t\t<string>${extension.extensionPoint}</string>`,
    '\t\t<key>NSExtensionPrincipalClass</key>',
    `\t\t<string>${extension.principalClass}</string>`,
    '\t</dict>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

function writeIfChanged(file, contents) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === contents) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function appVersions(iosDir) {
  // The extensions must carry the same version numbers as the app that embeds them.
  const config = fs.readFileSync(path.join(iosDir, 'App', 'config.xml'), 'utf8');
  const version = (config.match(/<widget[^>]*\sversion="([^"]+)"/) || [])[1] || '1.0.0';
  const build = (config.match(/<widget[^>]*\sios-CFBundleVersion="([^"]+)"/) || [])[1] || version;
  return { version, build };
}

function addTargets(context, iosDir, bundleId) {
  // The same Xcode project library cordova-ios uses.
  const xcode = require(require.resolve('xcode', { paths: [context.opts.projectRoot] }));
  const pbxPath = path.join(iosDir, 'App.xcodeproj', 'project.pbxproj');
  const project = xcode.project(pbxPath);
  project.parseSync();
  const versions = appVersions(iosDir);
  let changed = false;

  // A project with a single target has no dependency sections yet, and the library only
  // links the app to the new targets when they exist. Without that link the extensions
  // are not built with the app and CocoaPods finds no host target for them.
  // cordova-ios installs a plugin's files into the first build phase called "Sources" (or
  // "Frameworks") it finds, and project objects are stored sorted by id. Ids starting
  // with "FE" sort after the app target's own phases, so the app's phases stay first and
  // plugin files never land in an extension target, which could not build them. Phase
  // names cannot be used for this: CocoaPods drops them when it rewrites the project.
  const generateUuid = project.generateUuid.bind(project);
  project.generateUuid = function () {
    let id;
    do {
      id = 'FE' + generateUuid().slice(2);
    } while (project.allUuids().indexOf(id) !== -1);
    return id;
  };

  const objects = project.hash.project.objects;
  objects.PBXTargetDependency = objects.PBXTargetDependency || {};
  objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

  EXTENSIONS.forEach((extension) => {
    const directory = path.join(iosDir, extension.name);
    writeIfChanged(path.join(directory, extension.sourceFile), extension.source);
    writeIfChanged(path.join(directory, 'Info.plist'), infoPlist(extension));

    if (project.pbxTargetByName(extension.name)) return;

    const target = project.addTarget(extension.name, 'app_extension', extension.name, `${bundleId}.${extension.name}`);
    // Only the source file goes in the group: the library keys file references by name,
    // so listing each extension's Info.plist would put one reference in two groups, which
    // Xcode refuses to open. Info.plist is found through INFOPLIST_FILE.
    const group = project.addPbxGroup([extension.sourceFile], extension.name, extension.name);
    const mainGroup = project.getFirstProject().firstProject.mainGroup;
    project.addToPbxGroup(group.uuid, mainGroup);
    project.addBuildPhase([extension.sourceFile], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    const configurations = project.pbxXCBuildConfigurationSection();
    Object.keys(configurations).forEach((key) => {
      const settings = configurations[key].buildSettings;
      if (!settings || settings.PRODUCT_NAME !== `"${extension.name}"`) return;
      settings.INFOPLIST_FILE = `"${extension.name}/Info.plist"`;
      settings.PRODUCT_BUNDLE_IDENTIFIER = `"${bundleId}.${extension.name}"`;
      settings.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT_TARGET;
      settings.SWIFT_VERSION = '5.0';
      settings.TARGETED_DEVICE_FAMILY = '"1,2"';
      settings.CODE_SIGN_STYLE = 'Automatic';
      settings.MARKETING_VERSION = versions.version;
      settings.CURRENT_PROJECT_VERSION = versions.build;
      settings.GENERATE_INFOPLIST_FILE = 'NO';
      settings.SKIP_INSTALL = 'YES';
      settings.LD_RUNPATH_SEARCH_PATHS = '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
    });
    changed = true;
  });

  if (changed) fs.writeFileSync(pbxPath, project.writeSync());
  return changed;
}

function addPods(iosDir) {
  const podfilePath = path.join(iosDir, 'Podfile');
  if (!fs.existsSync(podfilePath)) return false;
  const podfile = fs.readFileSync(podfilePath, 'utf8');
  if (podfile.includes(PODFILE_MARKER)) return false;

  // One pod, the same line in both targets: both extensions then share the single
  // framework that holds both classes.
  const block = EXTENSIONS.map((extension) => [
    `target '${extension.name}' do`,
    "\tproject 'App.xcodeproj'",
    `\tpod 'BearoundSDKNotificationExtensions', '${POD_VERSION}'`,
    'end',
  ].join('\n')).join('\n');
  fs.writeFileSync(podfilePath, `${podfile.trimEnd()}\n${PODFILE_MARKER}\n${block}\n`);
  return true;
}

module.exports = function (context) {
  if (!context.opts.platforms || context.opts.platforms.indexOf('ios') === -1) return;
  const iosDir = path.join(context.opts.projectRoot, 'platforms', 'ios');
  if (!fs.existsSync(path.join(iosDir, 'App.xcodeproj'))) return;

  const config = fs.readFileSync(path.join(context.opts.projectRoot, 'config.xml'), 'utf8');
  const bundleId = (config.match(/<widget[^>]*\sid="([^"]+)"/) || [])[1];
  if (!bundleId) throw new Error('[bearound] widget id not found in config.xml');

  const targetsAdded = addTargets(context, iosDir, bundleId);
  const podsAdded = addPods(iosDir);
  // Cordova rewrites the project when it installs plugins, which can drop what CocoaPods
  // wired into the extension targets. Check the project itself, not only what this run did.
  const pbx = fs.readFileSync(path.join(iosDir, 'App.xcodeproj', 'project.pbxproj'), 'utf8');
  const integrated = EXTENSIONS.every((extension) => pbx.includes(`Pods-${extension.name}`));
  if (targetsAdded || podsAdded || !integrated) {
    console.log('[bearound] wiring the notification extensions, running pod install');
    execFileSync('pod', ['install'], {
      cwd: iosDir,
      stdio: 'inherit',
      env: Object.assign({}, process.env, { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' }),
    });
    // cordova-ios keeps the parsed project in memory and writes it back during the build.
    // Drop that copy, or the write would erase what CocoaPods just wired in.
    try {
      const projectFile = require(path.join(context.opts.projectRoot, 'node_modules', 'cordova-ios', 'lib', 'projectFile.js'));
      projectFile.purgeProjectFileCache(iosDir);
    } catch (error) {
      console.warn('[bearound] could not reset the cordova-ios project cache: ' + error.message);
    }
  }
};
