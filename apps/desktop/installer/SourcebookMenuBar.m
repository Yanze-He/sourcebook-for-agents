#import <Cocoa/Cocoa.h>

@interface SourcebookMenuBar : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSTask *sourcebookTask;
@end

@implementation SourcebookMenuBar

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
  [self configureApplicationMenu];
  [self startServiceOpeningBrowser:YES];
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
  if ([self focusExistingSourcebookTab]) return;
  [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:@"http://127.0.0.1:4177/"]];
}

- (BOOL)focusExistingSourcebookTab {
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
    if ([self focusSourcebookTabInBrowser:bundleIdentifier safari:[browser[@"safari"] boolValue]]) return YES;
  }
  return NO;
}

- (BOOL)focusSourcebookTabInBrowser:(NSString *)bundleIdentifier safari:(BOOL)isSafari {
  NSString *selectTab = isSafari
    ? @"set current tab of sourcebookWindow to tab tabIndex of sourcebookWindow"
    : @"set active tab index of sourcebookWindow to tabIndex";
  NSString *scriptSource = [NSString stringWithFormat:
    @"tell application id \"%@\"\n"
    "  repeat with sourcebookWindow in windows\n"
    "    repeat with tabIndex from 1 to (count of tabs of sourcebookWindow)\n"
    "      set pageURL to URL of tab tabIndex of sourcebookWindow\n"
    "      if pageURL starts with \"http://127.0.0.1:4177/\" or pageURL starts with \"http://localhost:4177/\" or pageURL starts with \"http://127.0.0.1:4297/\" or pageURL starts with \"http://localhost:4297/\" then\n"
    "        %@\n"
    "        set index of sourcebookWindow to 1\n"
    "        activate\n"
    "        return \"focused\"\n"
    "      end if\n"
    "    end repeat\n"
    "  end repeat\n"
    "end tell\n"
    "return \"missing\"",
    bundleIdentifier, selectTab];
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

- (void)openSourcebookWhenReady:(NSInteger)attempt {
  NSURL *url = [NSURL URLWithString:@"http://127.0.0.1:4177/api/health"];
  [[[NSURLSession sharedSession] dataTaskWithURL:url completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
    NSHTTPURLResponse *http = [response isKindOfClass:[NSHTTPURLResponse class]] ? (NSHTTPURLResponse *)response : nil;
    if (!error && http.statusCode == 200) {
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
