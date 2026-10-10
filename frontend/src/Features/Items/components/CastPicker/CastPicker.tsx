import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SeedOption } from '@/Domain/types/models'
import './CastPicker.styles.scss'

interface CastPickerProps {
  label: string
  options: SeedOption[]
  value: number
  onChange: (id: number) => void
}

export function CastPicker({ label, options, value, onChange }: CastPickerProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.id === value)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const handleSelect = (id: number) => {
    onChange(id)
    setOpen(false)
  }

  const handleClear = () => {
    onChange(0)
  }

  return (
    <>
      <div className="cast-picker">
        <span className="cast-picker__label">{label}</span>
        <div className="cast-picker__control">
          <button
            type="button"
            className={[
              'cast-picker__trigger',
              selected ? 'cast-picker__trigger--selected' : 'cast-picker__trigger--empty',
              value > 0 ? 'cast-picker__trigger--clearable' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setOpen(true)}
          >
            {selected?.imageUrl && (
              <img src={selected.imageUrl} alt="" className="cast-picker__trigger-icon" />
            )}
            <span className="cast-picker__trigger-text">
              {selected?.name ?? 'Nenhum'}
            </span>
          </button>
          {value > 0 && (
            <button
              type="button"
              className="cast-picker__clear"
              aria-label="Remover cast"
              onClick={handleClear}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {open &&
        createPortal(
          <div
            className="cast-picker-modal"
            role="presentation"
            onClick={() => setOpen(false)}
          >
            <div
              className="cast-picker-modal__card"
              role="dialog"
              aria-modal="true"
              aria-label={label}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="cast-picker-modal__header">
                <h4>{label}</h4>
                <button
                  type="button"
                  className="cast-picker-modal__close"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>

              <div className="cast-picker-modal__grid" role="listbox">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === 0}
                  className={[
                    'cast-picker-modal__option',
                    'cast-picker-modal__option--none',
                    value === 0 ? 'cast-picker-modal__option--selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleSelect(0)}
                >
                  <span className="cast-picker-modal__option-name">Nenhum</span>
                </button>

                {options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={value === option.id}
                    className={[
                      'cast-picker-modal__option',
                      value === option.id ? 'cast-picker-modal__option--selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleSelect(option.id)}
                  >
                    {option.imageUrl && (
                      <img src={option.imageUrl} alt="" className="cast-picker-modal__option-icon" />
                    )}
                    <span className="cast-picker-modal__option-name">{option.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
