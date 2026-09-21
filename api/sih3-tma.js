// Vercel/serverless endpoint for SIH3. It reads the public SIH3 homepage
// and extracts a verified TMA observation. No TMA value is fabricated.
export default async function handler(req, res) {
  try {
    const response = await fetch('https://www.sih3.bbwsserayuopak.id/', {
      headers: { 'User-Agent': 'SiapBanjir/1.0' },
    })
    if (!response.ok) throw new Error(`SIH3 HTTP ${response.status}`)
    const html = await response.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim()

    const candidates = ['AWLT POS NGRANCAH SERMO', 'DA BINTARAN KULON', 'AWLR KRANGGAN']
    let station = null
    let tma = null
    let observedAt = null
    for (const name of candidates) {
      const idx = text.toUpperCase().indexOf(name.toUpperCase())
      if (idx < 0) continue
      const section = text.slice(idx, idx + 900)
      const m = section.match(/Tinggi Muka Air \(TMA\)\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*m/i)
      if (m) {
        station = name
        tma = Number(m[1].replace(',', '.'))
        const tail = section.slice(m.index + m[0].length)
        const tm = tail.match(/(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)[^|]{0,100}?(\d{1,2}:\d{2})/i)
        observedAt = tm ? tm[0].trim() : null
        break
      }
    }
    if (tma === null) throw new Error('TMA station data not found on SIH3 homepage')
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.status(200).json({ station, tma, unit: 'm', observedAt, source: 'SIH3 BBWS Serayu Opak' })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to read SIH3' })
  }
}
