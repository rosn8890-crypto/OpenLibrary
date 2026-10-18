/* focus-tools.js - Suite of Deep Focus & Anti-Boredom Reading Tools:
   - Reading Ruler (ADHD & Dyslexia guide)
   - Reading Habit & Focus Pomodoro Timer
   - In-Reader Bookmarks Drawer
   - RSVP Bionic Speed Reader Mode
   - Instant Definition / Dictionary Tooltip
*/

// ---------- 1. Reading Ruler (Focus Guide) ----------
class ReadingRuler {
  constructor() {
    this.active = localStorage.getItem('ol_ruler_active') === 'true';
    this.rulerEl = null;
    this.init();
  }

  init() {
    const el = document.createElement('div');
    el.id = 'readingRulerOverlay';
    el.className = 'reading-ruler-overlay';
    el.innerHTML = `
      <div class="ruler-dim ruler-top"></div>
      <div class="ruler-guide" id="rulerGuide">
        <span class="ruler-line"></span>
      </div>
      <div class="ruler-dim ruler-bottom"></div>
    `;
    document.body.appendChild(el);
    this.rulerEl = el;
    this.guideEl = el.querySelector('#rulerGuide');

    if (!this.active) {
      this.rulerEl.style.display = 'none';
    }

    // Track mouse & touch on stage
    const moveHandler = (clientY) => {
      if (!this.active) return;
      const height = 64; // height of the reading focus band
      const y = Math.max(80, Math.min(window.innerHeight - 80, clientY));
      this.rulerEl.style.setProperty('--ruler-y', `${y}px`);
      this.rulerEl.style.setProperty('--ruler-h', `${height}px`);
    };

    window.addEventListener('mousemove', (e) => moveHandler(e.clientY), { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) moveHandler(e.touches[0].clientY);
    }, { passive: true });
  }

  toggle() {
    this.active = !this.active;
    localStorage.setItem('ol_ruler_active', String(this.active));
    this.rulerEl.style.display = this.active ? 'block' : 'none';
    if (typeof showToast === 'function') {
      showToast(this.active ? 'Focus Ruler ON (Press R to toggle)' : 'Focus Ruler OFF');
    }
  }
}

// ---------- 2. Reading Habit / Pomodoro Timer ----------
class ReadingTimer {
  constructor() {
    this.seconds = 0;
    this.timerId = null;
    this.goalMinutes = 20;
    this.milestones = [5, 15, 25, 45];
    this.celebrated = new Set();
    this.displayEl = null;
    this.init();
  }

  init() {
    // Start interval
    this.timerId = setInterval(() => {
      if (!document.hidden) {
        this.seconds++;
        this.checkMilestones();
        this.updateDisplay();
      }
    }, 1000);
  }

  checkMilestones() {
    const mins = Math.floor(this.seconds / 60);
    if (this.milestones.includes(mins) && !this.celebrated.has(mins)) {
      this.celebrated.add(mins);
      if (typeof showToast === 'function') {
        showToast(`🎉 Great focus! You've been reading for ${mins} minutes straight!`);
      }
    }
  }

  getFormatted() {
    const m = Math.floor(this.seconds / 60);
    const s = this.seconds % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  }

  updateDisplay() {
    if (this.displayEl) {
      this.displayEl.textContent = this.getFormatted();
    }
  }
}

// ---------- 3. Bookmarks & Notes Manager ----------
class BookmarksManager {
  constructor(bookId) {
    this.bookId = bookId;
    this.storageKey = `ol_bm_${bookId}`;
    this.bookmarks = this.load();
  }

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    } catch (e) {
      return [];
    }
  }

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.bookmarks));
  }

  add(pageNum, note = '') {
    const existing = this.bookmarks.findIndex(b => b.page === pageNum);
    const item = {
      page: pageNum,
      note: note.trim(),
      time: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    };
    if (existing >= 0) {
      this.bookmarks[existing] = item;
    } else {
      this.bookmarks.push(item);
      this.bookmarks.sort((a, b) => a.page - b.page);
    }
    this.save();
    return item;
  }

  remove(pageNum) {
    this.bookmarks = this.bookmarks.filter(b => b.page !== pageNum);
    this.save();
  }

  isBookmarked(pageNum) {
    return this.bookmarks.some(b => b.page === pageNum);
  }
}

// ---------- 4. RSVP Bionic Speed Reader ----------
class SpeedReader {
  constructor() {
    this.words = [];
    this.currentIndex = 0;
    this.wpm = parseInt(localStorage.getItem('ol_rsvp_wpm') || '300', 10);
    this.intervalId = null;
    this.isPlaying = false;
    this.modalEl = null;
  }

  open(text, onJumpPage) {
    if (!text || text.trim().length === 0) {
      if (typeof showToast === 'function') showToast('No text available on this page to speed-read.');
      return;
    }

    this.words = text.trim().split(/\s+/).filter(w => w.length > 0);
    if (this.words.length === 0) return;
    this.currentIndex = 0;

    this.createModal(onJumpPage);
    this.play();
  }

  createModal(onJumpPage) {
    const existing = document.getElementById('rsvpModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'rsvpModal';
    modal.className = 'modal-backdrop rsvp-backdrop';
    modal.innerHTML = `
      <div class="rsvp-card">
        <div class="rsvp-head">
          <span style="font-weight:600;font-size:.9rem;color:var(--muted);">⚡ Speed Reader (Focus Flow)</span>
          <button class="modal-close" id="closeRsvp">&times;</button>
        </div>
        <div class="rsvp-viewport">
          <div class="rsvp-reticle">
            <span class="reticle-marker top"></span>
            <span class="reticle-marker bottom"></span>
          </div>
          <div class="rsvp-word" id="rsvpWordText">Ready...</div>
        </div>
        <div class="rsvp-progress">
          <div class="rsvp-progress-fill" id="rsvpProgressFill"></div>
        </div>
        <div class="rsvp-controls">
          <button class="btn btn-outline btn-sm" id="rsvpPrevWord">‹ 10</button>
          <button class="btn btn-sm" id="rsvpPlayPause">Pause</button>
          <button class="btn btn-outline btn-sm" id="rsvpNextWord">10 ›</button>
          <div class="rsvp-speed">
            <label style="margin:0;font-size:.8rem;color:var(--muted);">Speed:</label>
            <select id="rsvpSpeedSelect" style="padding:.2rem .4rem;font-size:.85rem;border-radius:6px;width:auto;">
              <option value="200" ${this.wpm === 200 ? 'selected' : ''}>200 WPM</option>
              <option value="250" ${this.wpm === 250 ? 'selected' : ''}>250 WPM</option>
              <option value="300" ${this.wpm === 300 ? 'selected' : ''}>300 WPM</option>
              <option value="350" ${this.wpm === 350 ? 'selected' : ''}>350 WPM</option>
              <option value="400" ${this.wpm === 400 ? 'selected' : ''}>400 WPM</option>
              <option value="500" ${this.wpm === 500 ? 'selected' : ''}>500 WPM</option>
            </select>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    // Handlers
    document.getElementById('closeRsvp').onclick = () => this.close();
    modal.onclick = (e) => { if (e.target === modal) this.close(); };

    const playPauseBtn = document.getElementById('rsvpPlayPause');
    playPauseBtn.onclick = () => {
      if (this.isPlaying) {
        this.pause();
        playPauseBtn.textContent = 'Play';
      } else {
        this.play();
        playPauseBtn.textContent = 'Pause';
      }
    };

    document.getElementById('rsvpPrevWord').onclick = () => {
      this.currentIndex = Math.max(0, this.currentIndex - 10);
      this.renderWord();
    };

    document.getElementById('rsvpNextWord').onclick = () => {
      this.currentIndex = Math.min(this.words.length - 1, this.currentIndex + 10);
      this.renderWord();
    };

    document.getElementById('rsvpSpeedSelect').onchange = (e) => {
      this.wpm = parseInt(e.target.value, 10);
      localStorage.setItem('ol_rsvp_wpm', String(this.wpm));
      if (this.isPlaying) {
        this.play();
      }
    };
  }

  renderWord() {
    if (this.currentIndex >= this.words.length) {
      this.pause();
      const wordEl = document.getElementById('rsvpWordText');
      if (wordEl) wordEl.innerHTML = '<span style="color:var(--primary);font-size:1.4rem;">🎉 Page Finished!</span>';
      return;
    }

    const word = this.words[this.currentIndex];
    // Optimal recognition point (ORP) index: approx 35% into word
    const orp = Math.min(Math.floor(word.length * 0.35), 3);
    const left = word.slice(0, orp);
    const focal = word.charAt(orp);
    const right = word.slice(orp + 1);

    const wordEl = document.getElementById('rsvpWordText');
    const fillEl = document.getElementById('rsvpProgressFill');
    if (wordEl) {
      wordEl.innerHTML = `${escapeHtml(left)}<span class="orp-letter">${escapeHtml(focal)}</span>${escapeHtml(right)}`;
    }
    if (fillEl) {
      fillEl.style.width = `${Math.round((this.currentIndex / this.words.length) * 100)}%`;
    }
  }

  play() {
    this.pause();
    this.isPlaying = true;
    const delay = (60 / this.wpm) * 1000;
    this.intervalId = setInterval(() => {
      this.renderWord();
      this.currentIndex++;
    }, delay);
  }

  pause() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  close() {
    this.pause();
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
  }
}

// ---------- 5. Quick Word Definition Tooltip ----------
class WordLookup {
  constructor() {
    this.tooltipEl = null;
    this.init();
  }

  init() {
    const tip = document.createElement('div');
    tip.id = 'wordLookupTip';
    tip.className = 'word-lookup-card';
    tip.hidden = true;
    document.body.appendChild(tip);
    this.tooltipEl = tip;

    // Listen for text selection
    document.addEventListener('mouseup', (e) => {
      if (this.tooltipEl.contains(e.target)) return;
      const selection = window.getSelection().toString().trim();
      if (selection && selection.length > 1 && selection.length < 32 && /^[a-zA-Z\-]+$/.test(selection)) {
        this.lookup(selection, e.clientX, e.clientY);
      } else {
        this.hide();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
  }

  async lookup(word, clientX, clientY) {
    this.tooltipEl.hidden = false;
    this.tooltipEl.innerHTML = `<span style="font-size:.85rem;color:var(--muted);">Looking up "${escapeHtml(word)}"...</span>`;
    
    // Position safely within viewport
    const left = Math.min(window.innerWidth - 280, Math.max(16, clientX - 100));
    const top = Math.min(window.innerHeight - 180, clientY + 16);
    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.top = `${top}px`;

    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      const entry = data[0];
      const meaning = entry.meanings && entry.meanings[0];
      const def = meaning && meaning.definitions && meaning.definitions[0]?.definition;
      const part = meaning?.partOfSpeech || 'word';

      this.tooltipEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem;">
          <strong style="font-size:1.05rem;color:var(--text);">${escapeHtml(word)}</strong>
          <span style="font-size:.75rem;padding:.15rem .45rem;border-radius:999px;background:var(--surface-2);color:var(--muted);">${escapeHtml(part)}</span>
        </div>
        <p style="font-size:.85rem;margin:.3rem 0;line-height:1.4;color:var(--muted);">${escapeHtml(def || 'Definition not found.')}</p>
        <div style="display:flex;justify-content:space-between;margin-top:.5rem;align-items:center;">
          <button class="btn btn-outline btn-sm" id="speakWordBtn" style="padding:.2rem .5rem;font-size:.78rem;">🔊 Listen</button>
          <button class="icon-btn" style="width:24px;height:24px;border:none;" onclick="document.getElementById('wordLookupTip').hidden=true">&times;</button>
        </div>
      `;

      document.getElementById('speakWordBtn').onclick = () => {
        if ('speechSynthesis' in window) {
          const utt = new SpeechSynthesisUtterance(word);
          window.speechSynthesis.speak(utt);
        }
      };
    } catch (e) {
      this.tooltipEl.innerHTML = `
        <div style="font-size:.85rem;">
          <strong>${escapeHtml(word)}</strong>
          <p style="margin:.3rem 0;color:var(--muted);">No instant definition found.</p>
          <a href="https://www.google.com/search?q=define+${encodeURIComponent(word)}" target="_blank" rel="noopener" style="color:var(--primary);font-size:.8rem;">Search online &rarr;</a>
        </div>
      `;
    }
  }

  hide() {
    if (this.tooltipEl) this.tooltipEl.hidden = true;
  }
}

// Export instances
window.readingRuler = new ReadingRuler();
window.readingTimer = new ReadingTimer();
window.speedReader = new SpeedReader();
window.wordLookup = new WordLookup();
