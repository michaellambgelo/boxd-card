export interface FilmEntry {
  title: string
  rating: string
  posterDataUrl: string
}

export interface CardOptions {
  films: FilmEntry[]
  username: string
  showDate: boolean
}

// Card dimensions (4:1 landscape ratio, 4 posters side by side)
const CARD_WIDTH = 1200
const CARD_HEIGHT = 400
const POSTER_WIDTH = 200
const POSTER_HEIGHT = 300
const PADDING = 24
const BG_COLOR = '#1a1a1a'
const TEXT_COLOR = '#ffffff'
const SUBTEXT_COLOR = '#99aabb'

export async function renderCard(options: CardOptions): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')!

  // Background
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // TODO: draw posters, titles, ratings, logo, username, date

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('canvas.toBlob returned null'))
      },
      'image/png'
    )
  })
}

export async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}
