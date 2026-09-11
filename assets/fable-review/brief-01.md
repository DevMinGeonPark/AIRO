You are the external art director collaborating with Codex on AIRO, a Korean AI travel planning landing page. The user explicitly asked to collaborate with Fable to improve design quality and research other interactive designs. They strongly dislike the current result: it feels weird/cheap despite passing technical tests. Give a candid design critique and a concrete, cohesive redesign specification. Do not edit any source yet. Do not run commands or access credentials/private app data. Only read the listed public landing files and screenshots. Return your assessment in Korean (technical specs may be English). Your reply will be saved verbatim.

Read and visually inspect these current screenshots with your Read tool:
- assets/validation/cinematic/tailscale-intro.png
- assets/validation/cinematic/tailscale-explore.png
- assets/validation/cinematic/explore-375-812.png
- assets/validation/feature-1-1440.png
- assets/validation/mcp-1440.png
Also read src/app/page.tsx, src/app/landing-map.css, src/components/landing/travel-preview.tsx if useful.

Non-negotiable: existing Next App Router home only; preserve Korean marketing copy and links/routes; same section order hero → feature01/02/03 → MCP → CTA → footer. Warm off-white #FAF7F2, orange #F26B21, ink text. Calm spacious travel. No dark/neon/cyber. Existing motion/react, GSAP/useGSAP/ScrollTrigger, Lenis. Reduced motion + global off. 375/768/1440. All code animations use transform/opacity except SVG route draw. Existing real-geographic engine supports date flights, pin drop, zoom/pan, route follow; reuse it but its composition and map styling may be replaced. User wants full viewport and palpable pin/coordinate movement, referenced https://kyro.team/ and 'Apple-like premium'. Do NOT interpret that as copying Apple huge type plus a crude 3D pin. Current app UI is tiny, map uncomposed and overly zoomed, product value unclear. Seven GPT Images2 illustrations already exist; NO more image generation is authorized (reserved 8–10 require user request). You may recommend code SVG/CSS graphic assets, and reusing existing /public/gen/ illustrations.

Please provide:
1. Screenshot-based critique: 5 highest-impact failures, in priority order, distinguish factual visible issues from aesthetic judgment.
2. ONE strong art direction that can actually be executed in this repo. Don't give generic menus of directions or buzzwords. Specify 1440×900 first-viewport composition, typography (sizes/weight/line lengths), spacing, map scale, UI hierarchy, palette. Also 375×812 composition. Explain why visitors would understand travel + AI rather than just a map.
3. A precise scroll/click storyboard with 3–4 meaningful beats. Every motion should have an understandable cause and effect. Prefer clarity and a cohesive scene over plentiful floaty elements.
4. Changes to features/MCP/CTA that make the whole page feel authored, not a repeated card template.
5. A buildable implementation brief with concrete dimensions and selectors. You can propose a more radical replacement of the hero, but preserve user constraints and useful interactions. No vague 'polish' suggestions.
6. Visual acceptance criteria for your second review after implementation. You will get new screenshots and may reject the work if those fail.

Codex is separately gathering actual screenshots/interaction evidence from KYRO, Chartogne-Taillet and other high-quality interactive sites. You have not seen those yet: do not pretend you browsed them. We will send research evidence in a follow-up.
