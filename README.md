# Image Compressor

Batch-compress images in your browser. No uploads, no servers, no signup.

**Supports:** JPG · PNG · WebP · AVIF · HEIC  
**Outputs:** JPG · WebP · AVIF  
**Download:** All results bundled as a ZIP

---

## Features

- Drag-and-drop or click-to-browse upload
- Three quality presets (High q85 / Balanced q75 / Small q60)
- Optional max-dimension resizing (800 → 2560 px, longest edge)
- Sequential processing — no memory spikes on large batches
- AVIF encoding via WebAssembly (`@jsquash/avif`)
- HEIC input supported via `browser-image-compression`
- EXIF stripped automatically (canvas round-trip)
- ZIP download with collision-safe filenames
- 100% client-side — nothing leaves your device

---

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

```bash
# One-liner after pushing to GitHub
vercel --prod
```

Or connect the repo in the Vercel dashboard — no configuration needed.  
Works on the Hobby plan with zero serverless functions.

---

## Stack

| Package | Purpose |
|---|---|
| Next.js 14 (App Router) | Framework |
| Tailwind CSS | Styling |
| Framer Motion | Animation |
| browser-image-compression | JPG/WebP encoding + HEIC handling |
| @jsquash/avif | AVIF encoding (WASM) |
| jszip + file-saver | ZIP creation and download |
| Geist | Typography |
