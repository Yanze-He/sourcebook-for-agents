// Render the established flat Sourcebook mark on transparency for Codex.
// The macOS Dock icon intentionally uses a different, tiled 3D asset.
#import <AppKit/AppKit.h>

static void FillRoundedRect(CGContextRef context, CGRect rect, CGFloat radius) {
  CGPathRef path = CGPathCreateWithRoundedRect(rect, radius, radius, NULL);
  CGContextAddPath(context, path);
  CGContextFillPath(context);
  CGPathRelease(path);
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc != 2) return 2;
    const size_t size = 512;
    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc]
      initWithBitmapDataPlanes:NULL pixelsWide:size pixelsHigh:size
      bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO
      colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
    if (!bitmap) return 3;
    NSGraphicsContext *graphics = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
    [NSGraphicsContext saveGraphicsState];
    [NSGraphicsContext setCurrentContext:graphics];
    CGContextRef context = graphics.CGContext;
    CGContextScaleCTM(context, size / 256.0, size / 256.0);
    CGContextTranslateCTM(context, 0, 256);
    CGContextScaleCTM(context, 1, -1);
    CGContextClearRect(context, CGRectMake(0, 0, 256, 256));
    CGContextSetRGBFillColor(context, 0.06, 0.06, 0.06, 1);
    FillRoundedRect(context, CGRectMake(36, 60, 42, 28), 5);
    FillRoundedRect(context, CGRectMake(36, 105, 42, 28), 5);
    FillRoundedRect(context, CGRectMake(36, 150, 42, 28), 5);
    FillRoundedRect(context, CGRectMake(66, 36, 166, 166), 15);
    FillRoundedRect(context, CGRectMake(94, 190, 36, 34), 6);
    FillRoundedRect(context, CGRectMake(168, 190, 36, 34), 6);
    CGContextSetRGBStrokeColor(context, 1, 1, 1, 1);
    CGContextSetLineWidth(context, 18);
    CGContextSetLineCap(context, kCGLineCapRound);
    CGContextSetLineJoin(context, kCGLineJoinRound);
    CGContextMoveToPoint(context, 133, 100);
    CGContextAddLineToPoint(context, 152, 120);
    CGContextAddLineToPoint(context, 133, 140);
    CGContextStrokePath(context);
    CGContextSetRGBFillColor(context, 1, 1, 1, 1);
    FillRoundedRect(context, CGRectMake(179, 91, 18, 58), 9);
    [graphics flushGraphics];
    [NSGraphicsContext restoreGraphicsState];
    NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    return [png writeToFile:[NSString stringWithUTF8String:argv[1]] atomically:YES] ? 0 : 4;
  }
}
