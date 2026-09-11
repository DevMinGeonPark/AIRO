/** Decode Valhalla's lossless-to-six-decimals route geometry in longitude/latitude order. */
export function decodePolyline(shape: string): [number, number][] {
  let index = 0, lat = 0, lng = 0;
  const points: [number, number][] = [];
  const next = () => {
    let result = 0, shift = 0, byte = 0;
    do {
      if (index >= shape.length || shift > 30) throw new Error("Invalid route geometry");
      byte = shape.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error("Invalid route geometry");
      result |= (byte & 31) << shift; shift += 5;
    } while (byte >= 32);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < shape.length) {
    lat += next(); lng += next();
    if (Math.abs(lat) > 90e6 || Math.abs(lng) > 180e6) throw new Error("Invalid route coordinate");
    points.push([lng / 1e6, lat / 1e6]);
  }
  return points;
}
