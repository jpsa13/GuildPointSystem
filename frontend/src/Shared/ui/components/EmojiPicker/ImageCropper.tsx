import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Crop, NaturalSize } from './crop'

const BOX_WIDTH = 300
const BOX_HEIGHT = 240
const MIN_CROP = 16

interface ImageCropperProps {
  src: string
  natural: NaturalSize
  crop: Crop
  onChange: (crop: Crop) => void
}

/** Drag the square to move it, the corner handle to resize it. GIFs keep animating underneath. */
export function ImageCropper({ src, natural, crop, onChange }: ImageCropperProps) {
  const scale = Math.min(BOX_WIDTH / natural.width, BOX_HEIGHT / natural.height)
  const drag = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: Crop } | null>(null)

  const begin = (mode: 'move' | 'resize', e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: crop }
  }

  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.startX) / scale
    const dy = (e.clientY - d.startY) / scale
    const { start } = d
    if (d.mode === 'move') {
      onChange({
        ...start,
        x: Math.round(Math.min(Math.max(start.x + dx, 0), natural.width - start.size)),
        y: Math.round(Math.min(Math.max(start.y + dy, 0), natural.height - start.size)),
      })
    } else {
      const max = Math.min(natural.width - start.x, natural.height - start.y)
      const min = Math.min(MIN_CROP, max)
      onChange({ ...start, size: Math.round(Math.min(Math.max(start.size + Math.max(dx, dy), min), max)) })
    }
  }

  const end = () => {
    drag.current = null
  }

  return (
    <div
      className="image-cropper"
      style={{ width: natural.width * scale, height: natural.height * scale }}
    >
      <img src={src} alt="" draggable={false} />
      <div
        className="image-cropper__selection"
        style={{
          left: crop.x * scale,
          top: crop.y * scale,
          width: crop.size * scale,
          height: crop.size * scale,
        }}
        onPointerDown={(e) => begin('move', e)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span
          className="image-cropper__handle"
          onPointerDown={(e) => begin('resize', e)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      </div>
    </div>
  )
}

/** The cropped square at `size` px, done with CSS so an animated GIF stays animated. */
export function CropPreview({ src, natural, crop, size }: { src: string; natural: NaturalSize; crop: Crop; size: number }) {
  const k = size / crop.size
  return (
    <span className="crop-preview" style={{ width: size, height: size }}>
      <img
        src={src}
        alt=""
        style={{
          width: natural.width * k,
          height: natural.height * k,
          transform: `translate(${-crop.x * k}px, ${-crop.y * k}px)`,
        }}
      />
    </span>
  )
}
