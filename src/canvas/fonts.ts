/**
 * The card typeface.
 *
 * Every canvas font string used to end in the generic `sans-serif`, which meant
 * a card rendered in whatever the host happened to pick — Helvetica for a Mac
 * extension user, DejaVu on a Linux box, something else again under node-canvas.
 * The same card looked different on every surface, and golden images could not
 * be compared across machines at all.
 *
 * Letterboxd's own site sets Graphik (Commercial Type), alongside Tiempos and
 * Pitch Sans (Klim). All are commercial retail faces and none are
 * redistributable, so this is the nearest open-licence substitute rather than
 * Letterboxd's actual font. Inter is SIL OFL, ships static weights that
 * node-canvas can register, and is the conventional Graphik stand-in.
 *
 * `sans-serif` stays on the end as a genuine fallback: if the webfont has not
 * loaded, a card still renders, just in the host face.
 */
export const CARD_FONT_FAMILY = 'Inter'
export const CARD_FONT_STACK = `'${CARD_FONT_FAMILY}', sans-serif`

/** The only two weights renderCard draws. Adding one means shipping the file. */
const REQUIRED_FACES = [`400 16px ${CARD_FONT_STACK}`, `700 16px ${CARD_FONT_STACK}`]

/**
 * Canvas does not participate in CSS font loading: setting `ctx.font` to a
 * family the document has not loaded yet silently falls back, and the card is
 * drawn in the wrong face with no error. So the font has to be forced resident
 * before the first draw.
 *
 * Absent in node-canvas (fonts are registered up front instead) and harmless
 * where `document.fonts` is missing, so both test and product paths are safe.
 */
export async function ensureCardFontsLoaded(): Promise<void> {
  const fonts = typeof document !== 'undefined'
    ? (document as Document & { fonts?: FontFaceSet }).fonts
    : undefined
  if (!fonts?.load) return
  try {
    await Promise.all(REQUIRED_FACES.map((face) => fonts.load(face)))
  } catch {
    // A failed webfont must not fail the card — sans-serif still renders.
  }
}
