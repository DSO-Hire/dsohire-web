/**
 * GET /embed/widget.js — dependency-free embeddable careers widget
 * (Job Distribution Phase 3).
 *
 * A DSO drops this on their site:
 *   <div id="dsohire-jobs"></div>
 *   <script src="https://dsohire.com/embed/widget.js"
 *           data-dso="their-slug" data-accent="#0b5cad" data-limit="10"></script>
 *
 * The script reads its own data-* attributes, fetches the public JSON API
 * (/api/public/companies/[slug]/jobs.json) cross-origin, and renders a clean
 * roles list into the target div. Each role links to the job with
 * ?source=careers-embed:[slug] (baked in by the JSON API) for Vantage
 * attribution.
 *
 * Launch safety is inherited: the widget only renders whatever the JSON API
 * returns, and that API is empty pre-launch / for demo DSOs. The script itself
 * is static code, safe to serve always. It builds DOM with textContent (never
 * innerHTML on remote data), so masked values can't inject markup.
 */

export const dynamic = "force-static";

const WIDGET_JS = `(function () {
  var script = document.currentScript;
  if (!script) return;
  var dso = script.getAttribute("data-dso");
  if (!dso) return;
  var origin;
  try { origin = new URL(script.src).origin; } catch (e) { return; }

  var accent = script.getAttribute("data-accent") || "#0b5cad";
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(accent)) accent = "#0b5cad";
  var limit = parseInt(script.getAttribute("data-limit") || "25", 10);
  if (isNaN(limit) || limit < 1) limit = 25;
  if (limit > 50) limit = 50;

  var targetSel = script.getAttribute("data-target");
  var container = null;
  if (targetSel) container = document.querySelector(targetSel);
  if (!container) container = document.getElementById("dsohire-jobs");
  if (!container) {
    container = document.createElement("div");
    if (script.parentNode) script.parentNode.insertBefore(container, script.nextSibling);
  }

  function el(tag, style, text) {
    var e = document.createElement(tag);
    if (style) e.setAttribute("style", style);
    if (text != null) e.textContent = text;
    return e;
  }

  function money(c) {
    if (!c) return "";
    var suf = c.period === "hourly" ? "/hr" : c.period === "daily" ? "/day" : "/yr";
    function f(n) { return "$" + Number(n).toLocaleString("en-US"); }
    var r = (c.max && c.max !== c.min) ? f(c.min) + "–" + f(c.max) : f(c.min);
    return r + suf;
  }

  function render(data) {
    container.innerHTML = "";
    var jobs = (data && data.jobs) || [];
    var list = el("div", "display:flex;flex-direction:column;gap:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;");
    if (jobs.length === 0) {
      list.appendChild(el("div", "font-size:14px;color:#555;padding:16px;text-align:center;", "No open roles right now."));
      container.appendChild(list);
      return;
    }
    jobs.slice(0, limit).forEach(function (job) {
      var card = document.createElement("a");
      card.setAttribute("href", job.url);
      card.setAttribute("target", "_blank");
      card.setAttribute("rel", "noopener");
      card.setAttribute("style", "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;text-decoration:none;color:#111114;");
      var main = el("div", "");
      main.appendChild(el("div", "font-weight:600;font-size:15px;color:#111114;", job.title));
      var loc = "";
      if (job.locations && job.locations[0]) {
        loc = [job.locations[0].city, job.locations[0].state].filter(Boolean).join(", ");
        if (job.locations.length > 1) loc += " +" + (job.locations.length - 1) + " more";
      }
      var meta = job.employerName + (loc ? " · " + loc : "");
      main.appendChild(el("div", "font-size:13px;color:#555560;margin-top:2px;", meta));
      card.appendChild(main);
      var comp = money(job.compensation);
      if (comp) card.appendChild(el("div", "font-size:13px;font-weight:600;white-space:nowrap;color:" + accent + ";", comp));
      list.appendChild(card);
    });
    container.appendChild(list);
  }

  fetch(origin + "/api/public/companies/" + encodeURIComponent(dso) + "/jobs.json")
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function () {});
})();
`;

export async function GET() {
  return new Response(WIDGET_JS, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
