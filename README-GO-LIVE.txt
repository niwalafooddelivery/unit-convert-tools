UnitConvert — 1000 Free Converters (GO-LIVE PACK)
==================================================

This pack is the same 5-page site as unitconvert-all1000-website.zip,
plus SEO head tags on the home page (Open Graph, Twitter, WebSite +
FAQPage schema), a robots.txt and a sitemap.xml listing all 5 pages.

PAGES + FOLDERS:
  index.html          (home; has the meta tags)
  categories.html     (all 50 categories)
  tools.html          (all 1000 tools)
  formulas.html       (common formulas)
  faq.html            (frequently asked questions)
  global/global.css   (base styles)
  element/element.css (components)
  style/style.css     (header, hero and footer styles)
  js/data.js          (all 1000 tools + categories)
  js/app.js           (converter engine)
  robots.txt
  sitemap.xml

Keep all pages and folders together when you upload — the pages
load their styles and scripts from the folders.

BEFORE YOU DEPLOY — 2 places to change:
1. In index.html, replace YOUR-DOMAIN is not present in the head tags;
   add your real domain as the canonical + og:url when you pick one.
2. In robots.txt and sitemap.xml, replace YOUR-DOMAIN with your real domain.

DEPLOY (Cloudflare Pages, free):
1. Create a GitHub repo and upload everything in this zip.
2. In Cloudflare Pages, connect the repo and deploy (no build command needed).
3. In Google Search Console, submit https://YOUR-DOMAIN/sitemap.xml.

NOTE: the 5 pages are separate HTML files, so Google can index each
one (home, categories, tools, formulas, FAQ).
