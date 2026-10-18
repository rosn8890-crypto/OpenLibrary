# 📚 OpenLibrary - Enhanced Focused Reader & PWA App

**A free e-book library and sharing website, built for learners with deep focus reading modes and offline Progressive Web App (PWA) support.**

OpenLibrary is a database-driven web application where students and book enthusiasts can read, browse, search, and upload books as PDFs. Now enhanced with **PWA installation** (install and run like a native app on mobile and desktop), **Web Audio ambient soundscapes**, **Text-to-Speech audiobook narration**, **ADHD & Dyslexia reading guides**, **Bionic Speed Reading**, and **Zen focus modes**.

🌐 **Live Website**: [https://rosn8890-crypto.github.io/OpenLibrary/](https://rosn8890-crypto.github.io/OpenLibrary/)  
📁 **Repository**: [https://github.com/rosn8890-crypto/OpenLibrary.git](https://github.com/rosn8890-crypto/OpenLibrary.git)

---

## 📱 1. Install & Download like an App (PWA)

OpenLibrary is built as a complete **Progressive Web App (PWA)**. While powered by a web backend, users can download and install it like an application on their phone, tablet, or desktop:

- **1-Click "Install App" Button**: Available in the top navigation bar, on the home hero banner, and in the website footer.
- **Standalone App Experience**: Launches with no browser address bar clutter, dedicated app window, custom splash screen, and smooth native app transitions.
- **Offline Library Shell**: Service Worker (`sw.js`) pre-caches core HTML, styles, fonts, and reading UI, allowing the app to load instantly even with no internet connection.
- **Cross-Platform Support**:
  - **Android (Chrome/Edge)**: Native `beforeinstallprompt` prompt for 1-tap installation.
  - **iOS (iPhone & iPad Safari)**: Interactive visual modal with 3 simple steps ("Share" → "Add to Home Screen").
  - **Desktop (Windows, Mac, Linux, ChromeOS)**: Chrome/Edge desktop app installation with window controls overlay.

---

## 🧘 2. Deep Focus & Anti-Boredom Reading Features

Reading online can often lead to fatigue, boredom, or distractions. OpenLibrary includes a suite of sensory and cognitive focus features:

| Feature | Description | How to Use |
|---|---|---|
| 🎧 **Ambient Focus Soundscapes** | 6 procedural soundscapes generated using Web Audio API (**Rain**, **Ocean Waves**, **Cozy Cafe**, **Campfire**, **Forest Breeze**, and **White Noise**). Zero MP3 downloads needed, 100% offline. | Click `🎧 Sounds` in the reader bar or press `A` |
| 🔊 **Text-to-Speech Audiobook** | Reads PDF book text aloud using high-quality browser speech synthesis. Includes voice selection, speed slider (0.8x to 2x), and auto-page advancement. | Click `🔊 Listen` in reader bar |
| 📏 **Reading Focus Ruler** | A semi-transparent overlay that highlights the current line/paragraph as you move your mouse or finger, dimming the rest of the page to eliminate eye strain and ADHD line-skipping. | Click `📏 Ruler` in reader bar or press `R` |
| ⚡ **RSVP Speed Reader** | Rapid Serial Visual Presentation mode. Flashes page text word-by-word with the Optimal Recognition Point (ORP) highlighted in red. Devour chapters at 200–500 WPM without getting bored! | Click `⚡ Speed` in reader bar or press `S` |
| 🎨 **Expanded Reading Palettes** | 5 carefully tuned palettes: **Dark (Cozy)**, **Sepia (Warm Paper)**, **Light (Clean)**, **Midnight (OLED True Black #000000)**, and **Forest (Sage Green)** + Paper Dimmer slider. | Click `🎨` in reader bar |
| 🔖 **In-Reader Bookmarks & Notes** | Bookmark any page with a custom note. View all saved bookmarks in a sliding drawer and jump directly to any page. | Click `🔖 Bookmark` or press `B` |
| ⏱️ **Focus Timer & Milestones** | Gentle session timer tracking uninterrupted reading time with celebration badges at 5m, 15m, 25m, and 45m. | Shown live in reader title bar |
| 📖 **Instant Dictionary & Audio Pronounce** | Double-click or select any English word on the page to view an instant definition, part of speech, and voice pronunciation audio. | Double-click any word |
| 🧘 **Zen Focus Mode** | Instantly hides all headers, footers, and progress bars. Only the sharp HD page remains. | Click `🧘 Focus` or press `F` (or tap middle of screen) |
| ⛶ **Fullscreen Mode** | True fullscreen distraction-free reading. | Click `⛶` or press `Z` |

---

## ⌨️ Reader Keyboard Shortcuts

Press **`?`** inside the reader at any time to open the shortcut cheat sheet:

- **`→`** or **`Space`** : Next Page
- **`←`** : Previous Page
- **`F`** : Toggle Zen Focus Mode
- **`Z`** : Toggle Fullscreen
- **`R`** : Toggle Reading Ruler Guide
- **`S`** : Launch Bionic Speed Reader
- **`B`** : Bookmark Current Page
- **`A`** : Play / Pause Ambient Focus Sound
- **`+`** / **`−`** : Zoom In / Out
- **`Esc`** : Close Modals / Exit Focus Mode

---

## 🧱 Architecture & Technology

```
Frontend:
  HTML5 + CSS3 + Vanilla JavaScript (No heavy frameworks, blazing fast)
  PDF.js: HD vector rendering on HTML5 Canvas
  Web Audio API: Synthesized ambient sound generator
  Web Speech API: Client-side text-to-speech engine
  PWA: Service Worker + Web App Manifest + Offline Cache

Backend (BaaS):
  Supabase: PostgreSQL database, Auth (email/password), and File Storage (PDFs & Covers)
  Hosting: GitHub Pages (SSL enabled)
```

---

## 🚀 How to Run Locally

1. Clone or download this repository.
2. Serve the root directory with any local static HTTP server:
   ```bash
   # Using Python:
   python -m http.server 8000
   
   # Or using Node:
   npx serve .
   ```
3. Open `http://localhost:8000` in your browser.
4. To test PWA features: Service Workers and PWA installation work on `localhost` or any `https://` domain (like GitHub Pages).

---

## 📦 Ready Zip File

The project has been packaged into a ready-to-deploy archive:
- **`OpenLibrary-Enhanced-PWA.zip`** in the repository root.
- Simply extract and push to your GitHub repository to update your live GitHub Pages site automatically!
