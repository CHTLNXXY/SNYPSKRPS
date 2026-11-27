// Language switch (Indonesian / English). Indonesian is the default; the choice is remembered per device.
(function () {
  let lang = 'id';
  try { lang = localStorage.getItem('snyp-lang') || 'id'; } catch (e) { /* ignore */ }
  const I = {
    get lang() { return lang; },
    set(l) { lang = l === 'en' ? 'en' : 'id'; try { localStorage.setItem('snyp-lang', lang); } catch (e) { /* ignore */ } document.documentElement.lang = lang; },
    L: (en, id) => (lang === 'id' ? id : en),
  };
  document.documentElement.lang = lang;
  window.SNYP_I18N = I;
})();
