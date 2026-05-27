// Server-side static map rendering via the `staticmaps` npm lib + OSM
// tiles. Used by /api/static-map (which the LocationPanel <img src=...>
// hits). Wrapped here so the route handler stays tiny and the lib is
// constructed with our defaults in one place.
//
// We use OSM's public tile server. The lib will fetch the necessary
// tiles, composite them with the marker, and return a PNG buffer.

import StaticMaps from "staticmaps";

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 450;
const DEFAULT_ZOOM = 15;
const OSM_USER_AGENT = "DIM/1.0 (https://dim.ar; contact: ignaciodelvalle2014@gmail.com)";

export type RenderStaticMapOptions = {
  lat: number;
  lng: number;
  zoom?: number;
  width?: number;
  height?: number;
};

export async function renderStaticMapPng(opts: RenderStaticMapOptions): Promise<Buffer> {
  const map = new StaticMaps({
    width: opts.width ?? DEFAULT_WIDTH,
    height: opts.height ?? DEFAULT_HEIGHT,
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileSize: 256,
    tileRequestHeader: { "User-Agent": OSM_USER_AGENT },
  });

  map.addMarker({
    coord: [opts.lng, opts.lat],
    img: undefined,
    width: 36,
    height: 48,
    offsetX: 18,
    offsetY: 48,
    color: "#dc2626",
  });

  await map.render([opts.lng, opts.lat], opts.zoom ?? DEFAULT_ZOOM);
  return map.image.buffer("image/png");
}
