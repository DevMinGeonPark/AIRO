# AIRO editorial landing assets

The UI follows the user-approved reference supplied in the conversation. Its layout, text, buttons, globe and cards are implemented in code.

- Hero: **Cormorant Garamond Italic 400**, a real italic font, compared against Bodoni Moda Italic 400 in `../validation/editorial/font-comparison.png`. The final page uses Cormorant's lighter stroke contrast; it does not synthesize slant or alter the header logo. Source: https://github.com/google/fonts/tree/main/ofl/cormorantgaramond . SIL Open Font License: `fonts/cormorantgaramond-OFL.txt` and `/fonts/cormorant-garamond-LICENSE.txt`.
- Korean serif titles: **Noto Serif KR 400**, subset to all city names and all 53 feature titles. Source: https://github.com/google/fonts/tree/main/ofl/notoserifkr . SIL Open Font License: `fonts/notoserifkr-OFL.txt` and `/fonts/noto-serif-kr-LICENSE.txt` (current font: `/fonts/airo-korean-editorial-cities.woff2`).
- Fonts are served locally. Subsets were downloaded from Google Fonts; their exact request responses are preserved under `fonts/`.
- Bird: existing approved `public/brand/airo-mark-swift-gpt.webp` silhouette, using the existing brand blue. The navigation logo remains unchanged.
- Rome alley: **Tobias Tullius**, “Strolling through Rome.” https://unsplash.com/photos/Jfm2JZ6XguM . Source image: https://images.unsplash.com/photo-1579451487483-216239267b4d . Local asset: `/travel/rome-alley.jpg`.
- Rome city view: **Nicolas Jehly**, “Un coucher de soleil sur le Vatican.” https://unsplash.com/photos/aCHQLKWrAbI . Source image: https://images.unsplash.com/photo-1751980965356-26eb62d4efaf . Local asset: `/travel/rome-skyline.jpg`.
- Both published photos are free under the [Unsplash License](https://unsplash.com/license); selected/downloaded 2026-09-09. They are locally hosted, resized by Next Image and cropped with CSS. They are real photos, not generated replacements or crops of the supplied mockup.


## All-city extension

All 53 destinations have individual editorial photographs and Korean feature/card copy in `src/lib/landing-editorial.json`. Rome retains its two previously selected photos; the other 52 city photographs come from Wikimedia Commons under the individual CC BY, CC BY-SA, CC0 or public domain terms recorded in `cities/photo-manifest.json`. Full source metadata is retained in `cities/*-metadata.json`. Local files preserve the downloaded photographs; Next Image and CSS provide display resizing/cropping. Attribution, source links and license links are publicly accessible at `/credits/photos` through the globe attribution row, backed by `src/lib/landing-photo-credits.json`.

The contact sheet was reviewed to exclude flags, maps and satellite images. Hong Kong, Jeju, Bali and San Francisco were replaced with the Hong Kong skyline, Seongsan Ilchulbong, rice terraces and Golden Gate Bridge respectively. No unrelated city photograph is reused as a fallback. Acquisition is an explicit maintenance script, not a runtime dependency. The landing UI requires an editorial entry for every destination and tests all 53 selections in both Chrome and WebKit.

## Lower-page editorial sections

The three supplied references are sequential sections implemented as live UI in `lower-page.tsx` and `landing-lower.css`. The hero is retained. The lower map uses the same Mapcn/MapLibre component and checked-in OpenStreetMap geometry and pedestrian route snapshots. No mockup pin positions or straight connecting segments are used.

Nine real Rome landmark photographs and a photograph of Antico Caffè Greco are locally hosted in `/travel/rome/`. Individual authors, licenses and source pages are in `lower/photos.json`, retained Commons metadata, and the public `/credits/photos` page. A model of Capitoline Hill was rejected during visual review and replaced with an actual photograph of the piazza. Lower photos use CSS cropping; the files preserve the acquired photographs.

The lower Korean editorial headings use a separate Noto Serif KR 400 subset (`/fonts/airo-lower-serif.woff2`, exact Google Fonts response in `lower/serif.css`) so the existing hero fonts remain unchanged. The same SIL OFL applies. The final street photograph and the conversation banner reuse the already credited Rome assets.

The downloadable `/examples/airo-reservation-sample.pdf` is a newly authored, explicitly labeled sample document, not a real reservation or voucher. Budget amounts and the AI integration conversation are local previews and create no external booking or AI connection.
