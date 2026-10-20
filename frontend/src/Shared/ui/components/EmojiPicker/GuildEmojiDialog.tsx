import { useEffect, useState } from 'react'
import { useCreateGuildEmoji, useGuildEmojis } from '@/Domain/Emoji/hooks/useGuildEmojis'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { ConfirmDialog } from '@/Shared/ui/components/ConfirmDialog/ConfirmDialog'
import { defaultCrop, type Crop, type NaturalSize } from './crop'
import { CropPreview, ImageCropper } from './ImageCropper'
import './GuildEmojiDialog.styles.scss'

const EMOJI_PX = 128
/** GIFs are cropped server-side (keeping the animation), so the upload itself may be large. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const NAME_PATTERN = /^\w{2,32}$/

interface Picked {
  file: File
  url: string
  natural: NaturalSize
}

/** "Pepe Laugh!.png" → "Pepe_Laugh" */
function nameFromFile(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\W+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
}

function loadNaturalSize(url: string): Promise<NaturalSize> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    img.src = url
  })
}

/** Static images: the chosen square becomes a 128×128 PNG right here. */
async function cropToPng(file: File, crop: Crop): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = EMOJI_PX
  canvas.height = EMOJI_PX
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, crop.x, crop.y, crop.size, crop.size, 0, 0, EMOJI_PX, EMOJI_PX)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível ler a imagem.'))), 'image/png'),
  )
}

/** Líder/Administrador: pick an image, choose the square to use, name it `:name:`. */
export function GuildEmojiDialog({ onClose }: { onClose: () => void }) {
  const { data: emojis = [] } = useGuildEmojis()
  const createEmoji = useCreateGuildEmoji()
  const { showToast } = useAppToast()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Picked | null>(null)
  const [crop, setCrop] = useState<Crop | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () => () => {
      if (picked) URL.revokeObjectURL(picked.url)
    },
    [picked],
  )

  const nameTaken = emojis.some((e) => e.name.toLowerCase() === name.toLowerCase())
  const problem = !picked
    ? 'Escolha uma imagem.'
    : !NAME_PATTERN.test(name)
      ? 'O nome precisa ter de 2 a 32 letras, números ou _.'
      : nameTaken
        ? `Já existe um emoji :${name}:.`
        : null

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Imagem muito grande (máx. 5 MB).')
      return
    }
    const url = URL.createObjectURL(file)
    try {
      const natural = await loadNaturalSize(url)
      setPicked({ file, url, natural })
      setCrop(defaultCrop(natural))
      setError(null)
      if (!name) setName(nameFromFile(file.name))
    } catch (err) {
      URL.revokeObjectURL(url)
      setError(err instanceof Error ? err.message : 'Não foi possível ler a imagem.')
    }
  }

  const handleCreate = async () => {
    if (problem || !picked || !crop) {
      setError(problem)
      return
    }
    try {
      const isGif = picked.file.type === 'image/gif'
      await createEmoji.mutateAsync({
        name,
        file: isGif ? picked.file : await cropToPng(picked.file, crop),
        crop: isGif ? crop : undefined,
      })
      showToast(`Emoji :${name}: adicionado.`, 'success')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar o emoji.')
    }
  }

  const fileInput = (
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      onChange={(e) => {
        void pickFile(e.target.files?.[0])
        e.target.value = '' // picking the same file again still fires
      }}
    />
  )

  return (
    <ConfirmDialog
      open
      title="Adicionar emoji"
      code="ADM"
      variant="primary"
      confirmLabel="Adicionar"
      loading={createEmoji.isPending}
      onConfirm={handleCreate}
      onCancel={onClose}
    >
      <div className="guild-emoji-form">
        {picked && crop ? (
          <>
            <div className="guild-emoji-form__crop">
              <ImageCropper src={picked.url} natural={picked.natural} crop={crop} onChange={setCrop} />
              <label className="guild-emoji-form__change">
                Trocar imagem
                {fileInput}
              </label>
            </div>
            <div className="guild-emoji-form__previews" aria-label="Prévia">
              <CropPreview src={picked.url} natural={picked.natural} crop={crop} size={64} />
              <CropPreview src={picked.url} natural={picked.natural} crop={crop} size={32} />
              <CropPreview src={picked.url} natural={picked.natural} crop={crop} size={20} />
            </div>
          </>
        ) : (
          <label className="guild-emoji-form__drop">
            <span>Escolher imagem</span>
            {fileInput}
          </label>
        )}

        <label className="guild-emoji-form__name">
          <span>:</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value.replace(/\W/g, '').slice(0, 32))
              setError(null)
            }}
            placeholder="nome_do_emoji"
            aria-label="Nome do emoji"
          />
          <span>:</span>
        </label>
        <p className={`guild-emoji-form__hint${error ? ' guild-emoji-form__hint--error' : ''}`}>
          {error ??
            (picked
              ? 'Arraste o quadrado para escolher a parte; puxe o canto para mudar o tamanho.'
              : 'PNG, JPG, WebP ou GIF animado, até 5 MB.')}
        </p>
      </div>
    </ConfirmDialog>
  )
}
