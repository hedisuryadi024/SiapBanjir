export type WeatherData = {
  current: {
    precipitation: number
    precipitationProbability: number
    temperature: number
    humidity: number
    soilMoisture: number
    windSpeed: number
  }
  hourly: { jam: string; mm: number }[]
}

const LAT = -7.7956
const LON = 110.3695

export async function fetchOpenMeteo(): Promise<WeatherData> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(LAT))
  url.searchParams.set('longitude', String(LON))
  url.searchParams.set('timezone', 'Asia/Jakarta')
  url.searchParams.set('forecast_days', '2')
  url.searchParams.set('current', 'precipitation,precipitation_probability,temperature_2m,relative_humidity_2m,soil_moisture_0_to_7cm,wind_speed_10m')
  url.searchParams.set('hourly', 'precipitation,precipitation_probability')

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`)
  const data = await response.json()
  const now = new Date()
  let start = 0
  if (Array.isArray(data.hourly?.time)) {
    const idx = data.hourly.time.findIndex((t: string) => new Date(t).getTime() >= now.getTime() - 30 * 60 * 1000)
    if (idx >= 0) start = idx
  }

  return {
    current: {
      precipitation: Number(data.current?.precipitation ?? 0),
      precipitationProbability: Number(data.current?.precipitation_probability ?? 0),
      temperature: Number(data.current?.temperature_2m ?? 0),
      humidity: Number(data.current?.relative_humidity_2m ?? 0),
      soilMoisture: Number(data.current?.soil_moisture_0_to_7cm ?? 0),
      windSpeed: Number(data.current?.wind_speed_10m ?? 0),
    },
    hourly: (data.hourly?.time ?? []).slice(start, start + 12).map((t: string, i: number) => ({
      jam: new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      mm: Number(data.hourly.precipitation?.[start + i] ?? 0),
    })),
  }
}

export async function fetchTma() {
  const response = await fetch('/api/sih3-tma', { cache: 'no-store' })
  if (!response.ok) throw new Error('Data TMA SIH3 tidak dapat diambil')
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json() as Promise<{ station: string; tma: number; unit: string; observedAt: string | null; source: string }>
  }
  const html = await response.text()
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim()
  const candidates = ['AWLT POS NGRANCAH SERMO', 'DA BINTARAN KULON', 'AWLR KRANGGAN']
  for (const station of candidates) {
    const idx = text.toUpperCase().indexOf(station.toUpperCase())
    if (idx < 0) continue
    const section = text.slice(idx, idx + 900)
    const m = section.match(/Tinggi Muka Air \(TMA\)\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*m/i)
    if (m) {
      const tail = section.slice(m.index + m[0].length)
      const tm = tail.match(/(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)[^|]{0,100}?(\d{1,2}:\d{2})/i)
      return { station, tma: Number(m[1].replace(',', '.')), unit: 'm', observedAt: tm ? tm[0].trim() : null, source: 'SIH3 BBWS Serayu Opak' }
    }
  }
  throw new Error('TMA station data not found on SIH3')
}
