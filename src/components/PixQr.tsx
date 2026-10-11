import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

// The Pix code as a QR Code, drawn as SVG (dark on white, as bank apps expect).
export default function PixQr({ code }: { code: string }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(code)
    qr.make()
    const size = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) if (qr.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`
    }
    return { d, size: size + 8 }
  }, [code])
  return (
    <svg className="pix-qr" viewBox={`0 0 ${path.size} ${path.size}`} role="img" aria-label="QR Code do Pix" shapeRendering="crispEdges">
      <rect width={path.size} height={path.size} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  )
}
