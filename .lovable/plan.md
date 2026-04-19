

User wants the design to follow the 6-screen mobile mockup they uploaded. Let me look at the images first.
<lov-tool-use id="toolu_vrtx_01VrFCaBR4uaKJM6ToiBXppg" name="code--exec" integration-id="code" data="{\"command\": \"ls /tmp/dama_* 2>/dev/null; echo \\\"---\\\"; ls user-uploads:// 2>/dev/null\", \"user_facing_description\": \"Checking uploaded files\"}">
</lov-tool-use>
I need to look at the uploaded mockup images first.
<lov-tool-use id="toolu_vrtx_01GLGtuThzE1D2tvzeTmgpjy" name="code--exec" integration-id="code" data="{\"command\": \"lov-copy user-uploads://image.png /tmp/dama1.png && lov-copy user-uploads://image-2.png /tmp/dama2.png && ls -la /tmp/dama*.png\", \"user_facing_description\": \"Copying uploaded mockup images\"}">
</lov-tool-use>
Right, I'm in read-only/plan mode. Let me view the images directly.
<lov-tool-use id="toolu_vrtx_01X32d8n9ntr5obauJxMxZDU" name="code--view" integration-id="code" data="{\"file_path\": \"user-uploads://image.png\"}">
<lov-image url="https://storage.googleapis.com/gpt-engineer-file-uploads/995ba9cb-443d-4b7c-946b-cec71b2af36c-user-uploads://image.png?Expires=1776501487&GoogleAccessId=go-api-on-aws%40gpt-engineer-390607.iam.gserviceaccount.com&Signature=1NGR2plSPOLFVjbIwE%2B%2FXfEdVJDEINwyIXrEmS6QIf2G0TKpUEyU2CV8e4fSdd4rYBNhC4rWCrrhIGXPnJsT9mBVSVG322NIgVlDmEdKllcWPtBF3zZAt%2BJSlmGbCdEQuc%2Fe0HDhuHoYJvwXnLTw7q%2FWd6DJU6Edav%2FVGpCBn%2BO87%2Bxfx6zt5cmCokEpYxmu5NhnqdHDE2Qv6e0HnfzrcCLMj6Rn%2FMtn6e0KZuvOvnZlTBuOhoi8hAv3yRNb%2B2%2B1iyhIhOWQzGDgl70yW9Z8ROXmblrAJf4SoXs0RW2t7KJnLBx8BCYQYgDpy5ZWOg%2F61OZq%2Bz3ecXb%2FS5nzMG1tHg%3D%3D" mimeType="image/png"/></lov-tool-use>

<lov-tool-use id="toolu_vrtx_01R1WfHjFgFTr1r1YugQFHU5" name="code--view" integration-id="code" data="{\"file_path\": \"user-uploads://image-2.png\"}">
<lov-image url="https://storage.googleapis.com/gpt-engineer-file-uploads/fb11198e-8d89-4eb9-846e-3262c8c77c8f-user-uploads://image-2.png?Expires=1776501487&GoogleAccessId=go-api-on-aws%40gpt-engineer-390607.iam.gserviceaccount.com&Signature=zh9qFvRH9fHvlsNzOxfWY0zEfvx7LiBy%2FdxMz2Yx3RS8Y6EP1AngYgT1CslRMCsQrHb3ZT%2BJtwJJQ9E63OhiraeLPwSrjW19NnQhFjs2ZlivP45QCmsYvcheuh9n%2F%2BOmOocJIlsLaDY1H%2FaiwUPM2bmpeVnPjxuWHrwHLYWv8S3GmUN5ldSEP%2FdT95H6%2F%2B5S0uZJRApBwBGcN0GpbXMnxo5fmxNLvAOUkwjrR0%2ByY6hT9U%2BwdwGWPHdFMghgUeVt4VIKAKi9tLZsi2mRE%2Br43RN11ujSHqiQkS5qctf6v0wdBJ8guWj1kqir%2BN%2FGh91bOTLRCMfGmIO6vWURzSNpzw%3D%3D" mimeType="image/png"/></lov-tool-use>
Now I have clear visual references — 6 mobile screens already designed.

<lov-plan>

The user has provided **6 designed mobile screens** in image-2.png. I'll match them exactly. Image-1 is the late-game AN 11.16 content reference.

## The 6 screens (from mockup, top-left → bottom-right)

1. **Sutta detail** — "The 11 Advantages of Radiation by Mind of Loving-Kindness" with audio player (Bhante Dhammavuddho), 11-item Advantages list with circular icons, "Read Full Sutta" button
2. **Comic / Visual grid** — "Comic 1/11" header, scrollable grid of the 11 illustrated panels with numbered chips
3. **Your Tree** — glowing bioluminescent tree, "Dhamma Tree" label, Today's Growth (studied 1h 15m, +12 leaves), Overall Progress bar (Level 7 Mindful Explorer, 620/1000 XP), bottom tab bar
4. **End of Day Reflection — question** — sunset/skyline hero image, "End of Day Question", "Why do you think that is?", textarea, "Get AI Answer" CTA
5. **End of Day Reflection — thinking** — same hero, "You asked: ...", purple glowing orb with meditating figure, "Analyzing your reflection with Dhamma wisdom..."
6. **End of Day Reflection — AI Answer** — "AI Answer" body text, highlighted magenta-bordered canon quote block (— AN 11.16), "Save to Journal" CTA

## Routes

- `/` → Sutta detail (screen 1) — seeded with AN 11.16
- `/comic` → Visual grid (screen 2)
- `/tree` → Your Tree (screen 3)
- `/reflect` → Reflection question (screen 4)
- `/reflect/thinking` → loading state (screen 5, auto-advances)
- `/reflect/answer` → AI Answer (screen 6)
- `/sutta` → Read Full Sutta (canon + commentary, separated)

## Bottom tab bar (persistent on tree + reflect screens, per mockup)
Home · Sutra · Tree · Journal · Profile

## Design tokens (`src/styles.css`)
- bg `oklch(0.13 0.04 295)` deep violet-black
- primary magenta `oklch(0.62 0.26 340)` with glow shadow utility
- glass card: `bg-white/5 backdrop-blur border border-white/10 rounded-2xl`
- mono uppercase labels (AN 11.16, ADVANTAGES)

## Components
`AudioPlayer` (circular play, progress, timestamp, "Bhante Dhammavuddho"), `AdvantageRow` (numbered icon + text), `ComicCard` (numbered illustrated panel), `TreeViz` (SVG glowing tree), `StatRow`, `ProgressBar`, `CanonQuote` (left magenta border), `BottomNav`, `ScreenHeader` (back chevron + title + bookmark).

## Imagery
Generate the 11 cyberpunk-spiritual panel illustrations once via the AI image gen flow, store in `src/assets/advantages/01..11.webp`, reuse on screens 1, 2, and 6. Generate 1 sunset-skyline meditation hero for the reflection screens. Generate 1 tree illustration for `/tree` (or build in SVG with glow filters).

## Mock data
Single static `src/data/an1116.ts` with title, canon excerpt, audio metadata (placeholder mp3 URL), and the 11 chain items. Reflection text + saved answers persist to `localStorage`.

## Out of scope this pass
Real backend, real LLM, multiple suttas, auth — all visual/mock for now.

After approval I'll generate the 11 panel images + hero, build the design system, all 6 screens + sutta route, and the bottom nav.

