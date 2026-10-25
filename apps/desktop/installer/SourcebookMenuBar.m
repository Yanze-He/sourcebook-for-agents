#import <Cocoa/Cocoa.h>
#import <signal.h>
#import <unistd.h>

#ifndef SOURCEBOOK_DESKTOP_VERSION
#define SOURCEBOOK_DESKTOP_VERSION "0.1.0"
#endif

#ifndef SOURCEBOOK_DESKTOP_BUILD
#define SOURCEBOOK_DESKTOP_BUILD ""
#endif

static NSString *const SourcebookDesktopVersion = @SOURCEBOOK_DESKTOP_VERSION;
static NSString *const SourcebookDesktopBuild = @SOURCEBOOK_DESKTOP_BUILD;

@interface SourcebookMenuBar : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSTask *sourcebookTask;
@end

@implementation SourcebookMenuBar

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
  [self configureApplicationMenu];
  [self recordDesktopInstallation];
  [self startServiceOpeningBrowser:YES];
}

- (void)recordDesktopInstallation {
  NSFileManager *manager = [NSFileManager defaultManager];
  NSURL *support = [manager URLForDirectory:NSApplicationSupportDirectory inDomain:NSUserDomainMask appropriateForURL:nil create:YES error:nil];
  if (!support) return;
  NSURL *folder = [support URLByAppendingPathComponent:@"Sourcebook for Agents" isDirectory:YES];
  if (![manager createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:nil]) return;
  NSString *path = [NSBundle mainBundle].bundleURL.path;
  if (!path) return;
  NSData *data = [NSJSONSerialization dataWithJSONObject:@{ @"path": path } options:0 error:nil];
  NSURL *marker = [folder URLByAppendingPathComponent:@"desktop-install.json"];
  if ([data writeToURL:marker atomically:YES]) {
    [manager setAttributes:@{ NSFilePosixPermissions: @0600 } ofItemAtPath:marker.path error:nil];
  }
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)hasVisibleWindows {
  [self openSourcebook:nil];
  return NO;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
  [self stopService];
}

- (void)configureApplicationMenu {
  NSMenu *mainMenu = [[NSMenu alloc] initWithTitle:@"Sourcebook Desktop"];
  NSMenuItem *applicationItem = [[NSMenuItem alloc] initWithTitle:@"Sourcebook Desktop" action:nil keyEquivalent:@""];
  NSMenu *menu = [[NSMenu alloc] initWithTitle:@"Sourcebook Desktop"];
  [menu addItemWithTitle:@"Open Sourcebook" action:@selector(openSourcebook:) keyEquivalent:@"o"];
  [menu addItemWithTitle:@"Restart local service" action:@selector(restartService:) keyEquivalent:@"r"];
  [menu addItem:[NSMenuItem separatorItem]];
  [menu addItemWithTitle:@"Quit Sourcebook Desktop" action:@selector(quit:) keyEquivalent:@"q"];
  for (NSMenuItem *item in menu.itemArray) item.target = self;
  applicationItem.submenu = menu;
  [mainMenu addItem:applicationItem];
  [NSApp setMainMenu:mainMenu];
}

- (void)openSourcebook:(id)sender {
  NSString *target = [self sourcebookURL];
  if ([self focusExistingSourcebookTab:target]) return;
  [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:target]];
}

- (NSString *)sourcebookURL {
  return [NSString stringWithFormat:@"http://127.0.0.1:4177/?desktop=%@&openedAt=%.0f", SourcebookDesktopVersion, NSDate.date.timeIntervalSince1970 * 1000];
}

- (BOOL)focusExistingSourcebookTab:(NSString *)target {
  NSArray<NSDictionary<NSString *, id> *> *browsers = @[
    @{ @"bundleIdentifier": @"com.google.Chrome", @"safari": @NO },
    @{ @"bundleIdentifier": @"org.chromium.Chromium", @"safari": @NO },
    @{ @"bundleIdentifier": @"com.brave.Browser", @"safari": @NO },
    @{ @"bundleIdentifier": @"com.microsoft.edgemac", @"safari": @NO },
    @{ @"bundleIdentifier": @"com.apple.Safari", @"safari": @YES },
  ];

  for (NSDictionary<NSString *, id> *browser in browsers) {
    NSString *bundleIdentifier = browser[@"bundleIdentifier"];
    if ([[NSRunningApplication runningApplicationsWithBundleIdentifier:bundleIdentifier] count] == 0) continue;
    if ([self focusSourcebookTabInBrowser:bundleIdentifier safari:[browser[@"safari"] boolValue] target:target]) return YES;
  }
  return NO;
}

- (BOOL)focusSourcebookTabInBrowser:(NSString *)bundleIdentifier safari:(BOOL)isSafari target:(NSString *)target {
  NSString *selectTab = isSafari
    ? @"set current tab of sourcebookWindow to tab tabIndex of sourcebookWindow"
    : @"set active tab index of sourcebookWindow to tabIndex";
  NSString *escapedTarget = [target stringByReplacingOccurrencesOfString:@"\\\"" withString:@"\\\\\\\""];
  NSString *scriptSource = [NSString stringWithFormat:
    @"tell application id \"%@\"\n"
    "  repeat with sourcebookWindow in windows\n"
    "    repeat with tabIndex from 1 to (count of tabs of sourcebookWindow)\n"
    "      set pageURL to URL of tab tabIndex of sourcebookWindow\n"
    "      if pageURL starts with \"http://127.0.0.1:4177/\" or pageURL starts with \"http://localhost:4177/\" or pageURL starts with \"http://127.0.0.1:4297/\" or pageURL starts with \"http://localhost:4297/\" then\n"
    "        set URL of tab tabIndex of sourcebookWindow to \"%@\"\n"
    "        %@\n"
    "        set index of sourcebookWindow to 1\n"
    "        activate\n"
    "        return \"focused\"\n"
    "      end if\n"
    "    end repeat\n"
    "  end repeat\n"
    "end tell\n"
    "return \"missing\"",
    bundleIdentifier, escapedTarget, selectTab];
  NSAppleScript *script = [[NSAppleScript alloc] initWithSource:scriptSource];
  NSDictionary *error = nil;
  NSAppleEventDescriptor *result = [script executeAndReturnError:&error];
  return !error && [result.stringValue isEqualToString:@"focused"];
}

- (void)restartService:(id)sender {
  [self stopService];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.35 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    [self startServiceOpeningBrowser:NO];
  });
}

- (void)quit:(id)sender {
  [NSApp terminate:nil];
}

- (void)startServiceOpeningBrowser:(BOOL)openBrowser {
  if (self.sourcebookTask.running) return;

  [self existingSourcebookHealth:^(NSString *version, NSString *build) {
    if (version != nil && [version isEqualToString:SourcebookDesktopVersion] && [build isEqualToString:SourcebookDesktopBuild]) {
      if (openBrowser) [self openSourcebook:nil];
      return;
    }
    if (version != nil) {
      [self stopExistingSourcebookService:^(BOOL stopped) {
        if (stopped) {
          [self launchBundledServiceOpeningBrowser:openBrowser];
        } else {
          [self showServiceConflict];
        }
      }];
      return;
    }
    [self launchBundledServiceOpeningBrowser:openBrowser];
  }];
}

- (void)launchBundledServiceOpeningBrowser:(BOOL)openBrowser {
  if (self.sourcebookTask.running) return;

  NSURL *resources = [[NSBundle mainBundle] resourceURL];
  if (!resources) return;

  NSTask *task = [[NSTask alloc] init];
  NSURL *bundle = [[NSBundle mainBundle] bundleURL];
  task.executableURL = [bundle URLByAppendingPathComponent:@"Contents/MacOS/sourcebook-service"];

  NSMutableDictionary *environment = [NSMutableDictionary dictionaryWithDictionary:[NSProcessInfo processInfo].environment];
  environment[@"SOURCEBOOK_SOURCES_WEB_DIR"] = [resources URLByAppendingPathComponent:@"sources"].path;
  task.environment = environment;
  task.standardOutput = [NSFileHandle fileHandleWithNullDevice];
  task.standardError = [NSFileHandle fileHandleWithNullDevice];

  __weak typeof(self) weakSelf = self;
  task.terminationHandler = ^(NSTask *terminatedTask) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (weakSelf.sourcebookTask == terminatedTask) weakSelf.sourcebookTask = nil;
    });
  };

  NSError *error = nil;
  if ([task launchAndReturnError:&error]) {
    self.sourcebookTask = task;
    if (openBrowser) [self openSourcebookWhenReady:0];
  } else {
    [NSApp requestUserAttention:NSCriticalRequest];
  }
}

- (void)existingSourcebookHealth:(void (^)(NSString *version, NSString *build))completion {
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:@"http://127.0.0.1:4177/api/health"]];
  request.timeoutInterval = 0.5;
  [[[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
    NSString *version = nil;
    NSString *build = nil;
    NSHTTPURLResponse *http = [response isKindOfClass:[NSHTTPURLResponse class]] ? (NSHTTPURLResponse *)response : nil;
    if (!error && http.statusCode == 200 && data != nil) {
      NSDictionary *payload = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
      if ([payload[@"app"] isEqual:@"sourcebook-for-agents"]) {
        version = [payload[@"version"] isKindOfClass:NSString.class] ? payload[@"version"] : @"";
        build = [payload[@"build"] isKindOfClass:NSString.class] ? payload[@"build"] : @"";
      }
    }
    dispatch_async(dispatch_get_main_queue(), ^{ completion(version, build); });
  }] resume];
}

- (void)stopExistingSourcebookService:(void (^)(BOOL stopped))completion {
  NSTask *task = [[NSTask alloc] init];
  task.executableURL = [NSURL fileURLWithPath:@"/usr/sbin/lsof"];
  task.arguments = @[ @"-t", @"-iTCP:4177", @"-sTCP:LISTEN" ];
  NSPipe *output = [NSPipe pipe];
  task.standardOutput = output;
  NSError *error = nil;
  if (![task launchAndReturnError:&error]) {
    completion(NO);
    return;
  }
  [task waitUntilExit];
  NSString *pids = [[NSString alloc] initWithData:[[output fileHandleForReading] readDataToEndOfFile] encoding:NSUTF8StringEncoding];
  BOOL sentSignal = NO;
  for (NSString *line in [pids componentsSeparatedByCharactersInSet:NSCharacterSet.newlineCharacterSet]) {
    pid_t pid = (pid_t)line.integerValue;
    if (pid > 0 && pid != getpid() && kill(pid, SIGTERM) == 0) sentSignal = YES;
  }
  if (!sentSignal) {
    completion(NO);
    return;
  }
  [self waitForExistingServiceToStop:0 completion:completion];
}

- (void)waitForExistingServiceToStop:(NSInteger)attempt completion:(void (^)(BOOL stopped))completion {
  [self existingSourcebookHealth:^(NSString *version, NSString *build) {
    if (version == nil) {
      completion(YES);
      return;
    }
    if (attempt >= 12) {
      completion(NO);
      return;
    }
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.15 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      [self waitForExistingServiceToStop:attempt + 1 completion:completion];
    });
  }];
}

- (void)showServiceConflict {
  NSAlert *alert = [[NSAlert alloc] init];
  alert.messageText = @"Sourcebook is already running";
  alert.informativeText = @"Close the earlier Sourcebook Desktop instance, then open this version again.";
  [alert addButtonWithTitle:@"OK"];
  [alert runModal];
}

- (void)openSourcebookWhenReady:(NSInteger)attempt {
  NSURL *url = [NSURL URLWithString:@"http://127.0.0.1:4177/api/health"];
  [[[NSURLSession sharedSession] dataTaskWithURL:url completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
    NSHTTPURLResponse *http = [response isKindOfClass:[NSHTTPURLResponse class]] ? (NSHTTPURLResponse *)response : nil;
    NSDictionary *payload = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    if (!error && http.statusCode == 200 && [payload[@"app"] isEqual:@"sourcebook-for-agents"] && [payload[@"version"] isEqualToString:SourcebookDesktopVersion] && [payload[@"build"] isEqualToString:SourcebookDesktopBuild]) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [self openSourcebook:nil];
      });
      return;
    }
    if (attempt < 40) {
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.15 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self openSourcebookWhenReady:attempt + 1];
      });
    } else {
      dispatch_async(dispatch_get_main_queue(), ^{
        [NSApp requestUserAttention:NSCriticalRequest];
      });
    }
  }] resume];
}

- (void)stopService {
  if (self.sourcebookTask.running) [self.sourcebookTask terminate];
  self.sourcebookTask = nil;
}

@end

int main(int argc, const char * argv[]) {
  @autoreleasepool {
    NSApplication *application = [NSApplication sharedApplication];
    SourcebookMenuBar *delegate = [[SourcebookMenuBar alloc] init];
    application.delegate = delegate;
    [application run];
  }
  return 0;
}
