import { useState, useEffect, useRef } from 'react'

interface Props {
  value: number
  onChange: (val: number) => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
}

export function formatNumberInput(val: string): string {
  const cleaned = val.replace(/[^\d]/g, '')
  if (!cleaned) return ''
  return Number(cleaned).toLocaleString('en-US')
}

export function parseFormattedNumber(formatted: string): number {
  return parseInt(formatted.replace(/,/g, ''), 10) || 0
}

export default function FormattedPriceInput({ value, onChange, placeholder = '0', className = '', style }: Props) {
  const [display, setDisplay] = useState(value ? formatNumberInput(String(value)) : '')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focused) {
      setDisplay(value ? formatNumberInput(String(value)) : '')
    }
  }, [value, focused])

  const handleChange = (raw: string) => {
    const formatted = formatNumberInput(raw)
    setDisplay(formatted)
    onChange(parseFormattedNumber(formatted))
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      className={className}
      style={style}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => handleChange(e.target.value)}
    />
  )
}

interface InlineEditProps {
  value: number
  onSave: (val: number) => void
  display?: string
  className?: string
  style?: React.CSSProperties
  align?: 'center' | 'right' | 'left'
}

export function InlineEditCell({ value, onSave, display, className = '', style, align = 'center' }: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [temp, setTemp] = useState(formatNumberInput(String(value)))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setTemp(formatNumberInput(String(value)))
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 10)
    }
  }, [editing, value])

  const commit = () => {
    const num = parseFormattedNumber(temp)
    if (num >= 0) onSave(num)
    setEditing(false)
  }

  const cancel = () => { setEditing(false) }

  if (editing) {
    return (
      <div className="flex items-center gap-1" style={{ justifyContent: align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end' }}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={temp}
          onChange={(e) => setTemp(formatNumberInput(e.target.value))}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') cancel()
          }}
          className="w-24 text-center text-sm font-bold rounded-lg px-2 py-1 outline-none"
          style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '2px solid #3b82f6' }}
        />
        <button onClick={commit}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-xs text-white flex-shrink-0"
          style={{ backgroundColor: '#22c55e' }}
          title="تأیید">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
        <button onClick={cancel}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-xs text-white flex-shrink-0"
          style={{ backgroundColor: '#ef4444' }}
          title="لغو">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    )
  }

  return (
    <span
      onDoubleClick={() => setEditing(true)}
      className={`cursor-pointer px-2 py-1 rounded-lg hover:bg-blue-500/10 transition-all select-none ${className}`}
      style={style}
      title="دوبار کلیک برای ویرایش"
    >
      {display ?? value.toLocaleString('fa-IR')}
    </span>
  )
}
