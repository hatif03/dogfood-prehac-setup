/*! Portal gallery embed. MIT.
 * <script src="https://your-portal/embed.js" data-token="WIDGET_TOKEN" data-height="520" async></script>
 * Inserts an iframe to /widget/<token> right after this script tag. The origin comes from the script's own src,
 * so the embed keeps working wherever the portal is hosted.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var token = script.getAttribute("data-token");
  if (!token) {
    console.warn("[portal embed] data-token is missing");
    return;
  }
  var origin = new URL(script.src, window.location.href).origin;
  var height = parseInt(script.getAttribute("data-height") || "", 10) || 520;
  var iframe = document.createElement("iframe");
  iframe.src = origin + "/widget/" + encodeURIComponent(token);
  iframe.title = script.getAttribute("data-title") || "Hackathon project gallery";
  iframe.loading = "lazy";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.setAttribute("frameborder", "0");
  iframe.style.cssText =
    "display:block;width:100%;height:" + height + "px;border:0;border-radius:16px;background:#0a0b0d;color-scheme:dark";
  script.parentNode.insertBefore(iframe, script.nextSibling);
})();
