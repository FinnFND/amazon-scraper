// Export the extendOutputFunction string EXACTLY as required by the spec
const extendOutputFunction = `($) => {
  // Safe helpers that work with both Cheerio and jQuery-like $
  const get = (sel) => {
    try { const el = $(sel).first(); return el && el.length ? el : null; } catch (_) { return null; }
  };
  const attr = (el, a) => {
    try { return el ? (el.attr ? (el.attr(a) || '').trim() : null) : null; } catch (_) { return null; }
  };
  const val = (el) => {
    try { return el ? (el.val ? (el.val() || '').trim() : null) : null; } catch (_) { return null; }
  };
  const text = (el) => {
    try { return el ? (el.text ? (el.text() || '').trim() : null) : null; } catch (_) { return null; }
  };

  // Best-effort way to get page HTML as a string without relying on $.html()
  const getHtml = () => {
    try {
      if ($ && $.root && typeof $.root === 'function') {
        const r = $.root();
        if (r && r.html) return r.html() || '';
      }
    } catch (_) {}
    try {
      const h = $('html');
      if (h && h.length && h.html) return h.html() || '';
    } catch (_) {}
    return '';
  };

  const html = getHtml();

  // Collect candidate sources for sellerId
  const candidates_dataMerchant = [];
  try {
    $('[data-merchant-id]').each((_, el) => {
      const v = attr($(el), 'data-merchant-id');
      if (v) candidates_dataMerchant.push(v);
    });
  } catch (_) {}

  const merchantInput = val(get('#merchantID'));

  const sellerLinks = [];
  try {
    $('a[href*="seller="]').each((_, el) => {
      const v = attr($(el), 'href');
      if (v) sellerLinks.push(v);
    });
  } catch (_) {}

  const sellerTriggerHref = attr(get('#sellerProfileTriggerId'), 'href');

  // Inline JSON search (do NOT rely on document)
  const inlineMatches = [];
  try {
    const re = /"sellerId"\\s*:\\s*"([A-Z0-9]{10,})"/gi;
    let m;
    while ((m = re.exec(html))) inlineMatches.push(m[1]);
  } catch (_) {}

  const matchSellerFromHref = (href) => {
    if (!href) return null;
    const m = href.match(/[?&]seller=([A-Z0-9]{10,})/i);
    return m && m[1] ? m[1] : null;
  };

  // Decide sellerId by priority
  let sellerId =
    (candidates_dataMerchant.find((x) => /^[A-Z0-9]{10,}$/.test(x)) || null) ||
    (merchantInput && /^[A-Z0-9]{10,}$/.test(merchantInput) ? merchantInput : null) ||
    matchSellerFromHref(sellerTriggerHref) ||
    (sellerLinks.map(matchSellerFromHref).find(Boolean) || null) ||
    (inlineMatches.find((x) => /^[A-Z0-9]{10,}$/.test(x)) || null);

  // Track where it came from (for debugging in the dataset)
  let sellerIdSource = null;
  if (sellerId) {
    if (candidates_dataMerchant.includes(sellerId)) sellerIdSource = 'data-merchant-id';
    else if (merchantInput === sellerId) sellerIdSource = '#merchantID';
    else if ((sellerTriggerHref && sellerTriggerHref.includes(sellerId)) || sellerLinks.some((h) => h && h.includes(sellerId))) sellerIdSource = 'seller= link';
    else if (inlineMatches.includes(sellerId)) sellerIdSource = 'inline JSON';
  }

  // Derive TLD from <link rel="canonical"> or fall back to ".com"
  let canonical = null;
  try { canonical = attr(get('link[rel="canonical"]'), 'href'); } catch (_) {}
  let tld = 'com';
  try {
    const urlStr = canonical || '';
    const m = urlStr.match(/https?:\\/\\/[^/]*amazon\\.([^/]+)\\//i);
    if (m && m[1]) tld = m[1];
  } catch (_) {}

  const sellerProfileUrl    = sellerId ? ('https://www.amazon.' + tld + '/sp?seller=' + sellerId) : null;
  const sellerStorefrontUrl = sellerId ? ('https://www.amazon.' + tld + '/s?me=' + sellerId)    : null;

  // Compact per-item debug (kept small to avoid dataset bloat)
  const _debug = {
    hasSellerProfileTrigger: !!get('#sellerProfileTriggerId'),
    dataMerchant_samples: candidates_dataMerchant.slice(0, 5),
    merchantID_input: merchantInput || null,
    sellerLink_samples: sellerLinks.slice(0, 3),
    inlineSellerId_samples: inlineMatches.slice(0, 3),
    canonical: canonical || null,
    tld,
    html
  };


  return {
    sellerId: sellerId || null,
    sellerIdSource: sellerId ? sellerIdSource : null,
    sellerProfileUrl,
    sellerStorefrontUrl,
    _debug
  };
}`;

export default extendOutputFunction;