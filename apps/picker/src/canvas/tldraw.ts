export type TldrawPoint = {
  x: number;
  y: number;
};

type RectLike = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

type CachedShapeLayer = {
  layer: HTMLElement;
  images: HTMLImageElement[];
  dirty: boolean;
  observer: MutationObserver;
};

const shapeLayerCache = new WeakMap<HTMLElement, CachedShapeLayer>();

export function isPointWithinRect(point: TldrawPoint, rect: RectLike, minimumSize = 120): boolean {
  return (
    rect.width >= minimumSize &&
    rect.height >= minimumSize &&
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

/**
 * Finds the uppermost image under a tldraw canvas pointer. tldraw often sends
 * pointer events to its canvas layer instead of the nested image element.
 */
export function tldrawImageAtPoint(target: Element, point: TldrawPoint): HTMLImageElement | null {
  if (target.closest(".tlui-layout, .tl-canvas__in-front")) return null;

  const root = target.closest<HTMLElement>("[data-tldraw]");
  if (!root) return null;

  const layer = root.querySelector<HTMLElement>(".tl-html-layer.tl-shapes");
  if (!layer) return null;

  const images = cachedImages(root, layer);
  for (let index = images.length - 1; index >= 0; index -= 1) {
    const image = images[index];
    if (!image.isConnected || !(image.currentSrc || image.src)) continue;
    if (isPointWithinRect(point, image.getBoundingClientRect())) return image;
  }

  return null;
}

function cachedImages(root: HTMLElement, layer: HTMLElement): HTMLImageElement[] {
  let cache = shapeLayerCache.get(root);
  if (!cache || cache.layer !== layer) {
    cache?.observer.disconnect();
    cache = {
      layer,
      images: [],
      dirty: true,
      observer: new MutationObserver(() => {
        if (cache) cache.dirty = true;
      })
    };
    cache.observer.observe(layer, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "srcset", "class"]
    });
    shapeLayerCache.set(root, cache);
  }

  if (cache.dirty) {
    cache.images = Array.from(layer.querySelectorAll<HTMLImageElement>("img"));
    cache.dirty = false;
  }

  return cache.images;
}
