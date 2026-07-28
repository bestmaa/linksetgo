'use client'

import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

import { qrDownloadBaseName } from './test-lab-controller.helpers'

type QrAssets = {
  pngDataUrl: string
  svg: string
}

type QrState = {
  assets: QrAssets | null
  error: string | null
  sourceUrl: string
}

function triggerDownload(href: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.download = filename
  anchor.href = href
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

export function useTestLabQr(url: string | null) {
  const [state, setState] = useState<QrState | null>(null)

  useEffect(() => {
    if (!url) return

    let active = true
    void Promise.all([
      QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 768 }),
      QRCode.toString(url, { errorCorrectionLevel: 'M', margin: 2, type: 'svg', width: 768 }),
    ])
      .then(([pngDataUrl, svg]) => {
        if (active) {
          setState({ assets: { pngDataUrl, svg }, error: null, sourceUrl: url })
        }
      })
      .catch(() => {
        if (active) {
          setState({
            assets: null,
            error: 'The QR code could not be generated. Check the URL and try again.',
            sourceUrl: url,
          })
        }
      })

    return () => {
      active = false
    }
  }, [url])

  const current = state?.sourceUrl === url ? state : null
  const assets = current?.assets ?? null
  const filename = qrDownloadBaseName(url ?? '')

  return {
    onDownloadPng: () => {
      if (assets) triggerDownload(assets.pngDataUrl, `${filename}.png`)
    },
    onDownloadSvg: () => {
      if (!assets) return
      const objectUrl = URL.createObjectURL(
        new Blob([assets.svg], { type: 'image/svg+xml;charset=utf-8' }),
      )
      triggerDownload(objectUrl, `${filename}.svg`)
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    },
    qrDataUrl: assets?.pngDataUrl ?? null,
    qrError: current?.error ?? null,
  }
}
