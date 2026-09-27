import { useEffect, useId, useRef, useState } from 'react'
import { uploadImage } from '../api/upload'
import { ApiError } from '../api/client'

interface Props {
  value?: string
  onChange: (url: string) => void
  onBusyChange: (busy: boolean) => void
  disabled?: boolean
}

export default function ImageUpload({ value = '', onChange, onBusyChange, disabled }: Props) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [failedPreview, setFailedPreview] = useState('')

  useEffect(() => () => controller.current?.abort(), [])

  const select = async (file?: File) => {
    if (!file || busy || disabled) return
    setError('')
    setStatus('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('请选择 JPG、PNG 或 WebP 图片')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('图片不能超过 5 MB')
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    onBusyChange(true)
    try {
      const result = await uploadImage(file, abort.signal)
      if (abort.signal.aborted) return
      onChange(result.url)
      setFailedPreview('')
      setStatus('上传成功，地址已填入。保存后生效。')
    } catch (err) {
      if (!abort.signal.aborted) setError(err instanceof ApiError ? (err.status === 413 ? '图片超过服务器上传限制，请换一张较小的图片' : err.message) : '上传失败，请检查网络后重试')
    } finally {
      if (!abort.signal.aborted) {
        setBusy(false)
        onBusyChange(false)
      }
    }
  }

  return <div className="image-upload" aria-busy={busy}>
    <label className="m-label" htmlFor={`${id}-url`}>图片</label>
    <div className="image-upload-panel">
      <div className="image-upload-preview">
        {value && failedPreview !== value ? <img src={value} alt="图片预览" onError={() => setFailedPreview(value)} /> : <span>{value ? '图片暂时无法预览' : '尚未选择图片'}</span>}
      </div>
      <div className="image-upload-controls">
        <input ref={input} id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy || disabled} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void select(file) }} />
        <button type="button" className="ghost-btn" disabled={busy || disabled} onClick={() => input.current?.click()}>{busy ? '正在上传…' : '选择图片并上传'}</button>
        <p className="image-upload-hint">JPG / PNG / WebP · 最大 5 MB</p>
      </div>
    </div>
    <input id={`${id}-url`} className="m-input" type="url" value={value} disabled={busy || disabled} placeholder="上传后自动填入，也可粘贴图片地址" onChange={e => { onChange(e.target.value); setStatus(''); setError('') }} />
    {error && <p className="image-upload-error" role="alert">{error}</p>}
    {status && <p className="image-upload-status" role="status">{status}</p>}
  </div>
}
