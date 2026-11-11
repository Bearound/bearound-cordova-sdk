#import <UIKit/UIKit.h>
#import <objc/runtime.h>

// Launch-time hook of the Bearound Cordova plugin.
//
// The native SDK has to be armed inside application:didFinishLaunchingWithOptions:
// (BGTaskScheduler rejects later registrations, and a push or a beacon region can relaunch
// the app with no web page to call configure()). A Cordova plugin cannot edit the app's
// AppDelegate, so this wraps the method on CDVAppDelegate at load time. The app delegate
// subclass calls super, which lands here.
//
// It also gives the app delegate the two background callbacks the SDK needs
// (background fetch and background URL session events), wrapping the host's own
// implementation when there is one.
//
// The Swift side (BearoundCordovaBootstrap) is reached through the runtime on purpose:
// the generated "-Swift.h" header is named after the host app's module.

@protocol BearoundBootstrapping
+ (void)applicationDidFinishLaunching:(UIApplication *)application launchOptions:(NSDictionary *)launchOptions;
+ (void)performFetch:(void (^)(BOOL success))completion;
+ (BOOL)handleBackgroundSession:(NSString *)identifier completion:(void (^)(void))completion;
@end

static Class<BearoundBootstrapping> BearoundBootstrap(void) {
  return (Class<BearoundBootstrapping>)NSClassFromString(@"BearoundCordovaBootstrap");
}

// Installs `block` as the implementation of `selector` on `cls` and returns the previous
// implementation (the class's own or an inherited one), or NULL when there was none.
static IMP BearoundInstall(Class cls, SEL selector, id block, const char *types) {
  Method existing = class_getInstanceMethod(cls, selector);
  IMP previous = existing ? method_getImplementation(existing) : NULL;
  IMP replacement = imp_implementationWithBlock(block);
  if (!class_addMethod(cls, selector, replacement, types)) {
    // The class implements the method itself: swap it in place.
    previous = method_setImplementation(class_getInstanceMethod(cls, selector), replacement);
  }
  return previous;
}

static void BearoundInstallBackgroundFetch(Class cls) {
  SEL selector = @selector(application:performFetchWithCompletionHandler:);
  __block IMP previous = NULL;
  previous = BearoundInstall(cls, selector, ^(id delegate, UIApplication *application,
                                              void (^completionHandler)(UIBackgroundFetchResult)) {
    [BearoundBootstrap() performFetch:^(BOOL success) {
      completionHandler(success ? UIBackgroundFetchResultNewData : UIBackgroundFetchResultNoData);
    }];
    if (previous) {
      // The system handler may only be called once; the host gets a no-op one.
      ((void (*)(id, SEL, UIApplication *, id))previous)(delegate, selector, application,
                                                        ^(UIBackgroundFetchResult result) {});
    }
  }, "v@:@@?");
}

static void BearoundInstallBackgroundSession(Class cls) {
  SEL selector = @selector(application:handleEventsForBackgroundURLSession:completionHandler:);
  __block IMP previous = NULL;
  previous = BearoundInstall(cls, selector, ^(id delegate, UIApplication *application,
                                              NSString *identifier, void (^completionHandler)(void)) {
    if ([BearoundBootstrap() handleBackgroundSession:identifier completion:completionHandler]) {
      return;
    }
    if (previous) {
      ((void (*)(id, SEL, UIApplication *, NSString *, id))previous)(delegate, selector, application,
                                                                    identifier, completionHandler);
    } else {
      completionHandler();
    }
  }, "v@:@@@?");
}

static void BearoundBootstrapApplication(UIApplication *application, id delegate, NSDictionary *launchOptions) {
  static BOOL done = NO;
  if (done) return;
  done = YES;

  if (!BearoundBootstrap()) {
    NSLog(@"[Bearound] BearoundCordovaBootstrap not found; launch wiring skipped");
    return;
  }
  @try {
    if (delegate) {
      BearoundInstallBackgroundFetch([delegate class]);
      BearoundInstallBackgroundSession([delegate class]);
    }
    [BearoundBootstrap() applicationDidFinishLaunching:application launchOptions:launchOptions];
  } @catch (NSException *exception) {
    // Never crash the host at launch.
    NSLog(@"[Bearound] launch wiring failed: %@", exception);
  }
}

@interface BearoundAppDelegateHook : NSObject
@end

@implementation BearoundAppDelegateHook

+ (void)load {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    SEL selector = @selector(application:didFinishLaunchingWithOptions:);
    Class cordovaDelegate = NSClassFromString(@"CDVAppDelegate");
    Method method = cordovaDelegate ? class_getInstanceMethod(cordovaDelegate, selector) : NULL;

    if (method) {
      __block IMP original = NULL;
      IMP replacement = imp_implementationWithBlock(^BOOL(id delegate, UIApplication *application,
                                                         NSDictionary *launchOptions) {
        BearoundBootstrapApplication(application, delegate, launchOptions);
        return ((BOOL (*)(id, SEL, UIApplication *, NSDictionary *))original)(delegate, selector,
                                                                             application, launchOptions);
      });
      original = method_setImplementation(method, replacement);
      return;
    }

    // No CDVAppDelegate to wrap (custom app delegate): fall back to the launch
    // notification, which UIKit posts right after didFinishLaunching returns.
    [[NSNotificationCenter defaultCenter]
        addObserverForName:UIApplicationDidFinishLaunchingNotification
                    object:nil
                     queue:nil
                usingBlock:^(NSNotification *note) {
                  UIApplication *application = UIApplication.sharedApplication;
                  BearoundBootstrapApplication(application, application.delegate, note.userInfo);
                }];
  });
}

@end
