/**
 * Coarse browser / OS / device derivation from the User-Agent (build spec §4.3).
 *
 * Dependency-free and intentionally shallow — we want buckets ("Chrome",
 * "iOS", "mobile"), not a full UA database. The UA string is a derive input
 * ONLY: this runs in the beacon, and the caller discards the UA immediately
 * after. Nothing here stores or logs it.
 */

export interface DeviceInfo {
  browser: string | null;
  os: string | null;
  device: "mobile" | "tablet" | "desktop" | null;
}

export function deriveDevice(ua: string): DeviceInfo {
  if (!ua) return { browser: null, os: null, device: null };
  const s = ua.toLowerCase();

  // Browser — order matters (Edge/Brave/etc. also contain "chrome"/"safari").
  let browser: string | null = null;
  if (s.includes("edg/") || s.includes("edga/") || s.includes("edgios/"))
    browser = "Edge";
  else if (s.includes("opr/") || s.includes("opera")) browser = "Opera";
  else if (s.includes("samsungbrowser")) browser = "Samsung Internet";
  else if (s.includes("firefox/") || s.includes("fxios/")) browser = "Firefox";
  else if (s.includes("chrome/") || s.includes("crios/")) browser = "Chrome";
  else if (s.includes("safari/")) browser = "Safari";

  // OS.
  let os: string | null = null;
  if (s.includes("windows")) os = "Windows";
  else if (s.includes("iphone") || s.includes("ipad") || s.includes("ipod"))
    os = "iOS";
  else if (s.includes("mac os x") || s.includes("macintosh")) os = "macOS";
  else if (s.includes("android")) os = "Android";
  else if (s.includes("cros")) os = "ChromeOS";
  else if (s.includes("linux")) os = "Linux";

  // Device class.
  let device: DeviceInfo["device"] = "desktop";
  if (s.includes("ipad") || (s.includes("tablet") && !s.includes("mobile")))
    device = "tablet";
  else if (
    s.includes("mobile") ||
    s.includes("iphone") ||
    s.includes("ipod") ||
    (s.includes("android") && s.includes("mobile"))
  )
    device = "mobile";

  return { browser, os, device };
}
