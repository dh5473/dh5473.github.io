// Dark mode flash prevention
// Reads localStorage / system preference before React hydrates.
// This script runs synchronously in <head> to set data-theme before paint.
(function () {
  try {
    var t = localStorage.getItem('theme')
    if (t === 'dark' || t === 'light') {
      document.documentElement.setAttribute('data-theme', t)
      return
    }
    var prefer = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    document.documentElement.setAttribute('data-theme', prefer)
  } catch (e) {}
})()
