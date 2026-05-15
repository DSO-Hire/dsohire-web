/**
 * Dynamic Twitter card for dsohire.com. Same renderer as the OG image —
 * 1200x630 works for Twitter's summary_large_image card (cropped by
 * Twitter as needed). Single source of truth keeps both previews in
 * lockstep when the brand evolves.
 */

export {
  default,
  alt,
  size,
  contentType,
} from "./opengraph-image";
