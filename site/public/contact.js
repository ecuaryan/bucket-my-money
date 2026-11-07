// Builds the mailto: link in the browser so the address never appears in the
// page HTML (basic scraper bots read raw HTML). Served from the same origin
// because the site CSP is script-src 'self' (no inline scripts).
;(function () {
  var a = document.getElementById('contact-link')
  if (!a) return
  var addr = a.getAttribute('data-user') + '@' + a.getAttribute('data-host')
  a.href = 'mailto:' + addr
  a.textContent = addr
})()
