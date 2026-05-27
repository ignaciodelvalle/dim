// Minimal type declaration for the `staticmaps` npm lib. The package
// ships without types; we use a narrow shape covering only what
// lib/static-map.ts touches. If the API surface grows here, widen this.

declare module "staticmaps" {
  type StaticMapsOptions = {
    width: number;
    height: number;
    tileUrl: string;
    tileSize?: number;
    tileRequestHeader?: Record<string, string>;
  };

  type MarkerOptions = {
    coord: [number, number];
    img?: string | undefined;
    width?: number;
    height?: number;
    offsetX?: number;
    offsetY?: number;
    color?: string;
  };

  type Image = {
    buffer(mime: string): Promise<Buffer>;
  };

  class StaticMaps {
    constructor(options: StaticMapsOptions);
    addMarker(marker: MarkerOptions): void;
    render(coord: [number, number], zoom: number): Promise<void>;
    image: Image;
  }

  export default StaticMaps;
}
