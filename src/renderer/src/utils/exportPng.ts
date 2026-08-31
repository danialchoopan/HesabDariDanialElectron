/**
 * PNG export helper — rasterizes an inline SVG (chart) to a PNG file.
 *
 * Makes the SVG-to-canvas path robust:
 *   - guarantees the xmlns namespace is present (otherwise the <img> won't load)
 *   - forces an explicit width/height so the canvas draws at full resolution
 *   - fills a solid background (charts are transparent otherwise)
 */
export function exportSvgToPng(svgEl: SVGElement, filename: string, backgroundColor: string = '#ffffff', width = 1200, height = 800): void {
  let svgData = new XMLSerializer().serializeToString(svgEl)
  if (!svgData.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svgData = svgData.replace(/<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ')
  }
  svgData = svgData.replace(/<svg /, `<svg width="${width}" height="${height}" `)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const img = new Image()
  img.onload = () => {
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    const a = document.createElement('a')
    a.download = filename
    a.href = canvas.toDataURL('image/png')
    a.click()
  }
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
}
