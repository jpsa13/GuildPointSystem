/** Square area of the image, in its natural pixels. */
export interface Crop {
  x: number
  y: number
  size: number
}

export interface NaturalSize {
  width: number
  height: number
}

/** Largest centered square: the starting selection. */
export function defaultCrop({ width, height }: NaturalSize): Crop {
  const size = Math.min(width, height)
  return { x: Math.round((width - size) / 2), y: Math.round((height - size) / 2), size }
}
