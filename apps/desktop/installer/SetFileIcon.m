#import <Cocoa/Cocoa.h>
#import <sys/xattr.h>
#import <unistd.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc != 3) return 2;
    NSString *iconPath = [NSString stringWithUTF8String:argv[1]];
    NSString *targetPath = [NSString stringWithUTF8String:argv[2]];
    NSImage *icon = [[NSImage alloc] initWithContentsOfFile:iconPath];
    if (!icon || ![[NSWorkspace sharedWorkspace] setIcon:icon forFile:targetPath options:0]) return 1;

    const char *path = targetPath.fileSystemRepresentation;
    for (int attempt = 0; attempt < 40; attempt += 1) {
      if (getxattr(path, "com.apple.ResourceFork", NULL, 0, 0, 0) > 0) return 0;
      usleep(50 * 1000);
    }
  }
  return 1;
}
