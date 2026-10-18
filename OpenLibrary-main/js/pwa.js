/* pwa.js - Progressive Web App installation & offline management */

let deferredPrompt = null;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              if (typeof showToast === 'function') {
                showToast('OpenLibrary updated in background. Ready offline!');
              }
            }
          });
        });
      })
      .catch(err => console.log('ServiceWorker registration error:', err));
  });
}

// Capture install prompt
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  // Reveal install buttons
  document.querySelectorAll('[data-install-btn]').forEach(el => {
    el.style.display = 'inline-flex';
    el.removeAttribute('hidden');
  });
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  if (typeof showToast === 'function') {
    showToast('🎉 OpenLibrary installed successfully!');
  }
  document.querySelectorAll('[data-install-btn]').forEach(el => {
    el.textContent = 'App Installed ✓';
    el.classList.add('installed');
  });
});

// Main Install function triggered by user click
window.promptInstallApp = async function () {
  if (isStandalone) {
    if (typeof showToast === 'function') showToast('OpenLibrary is already installed as an app!');
    return;
  }

  if (deferredPrompt) {
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        if (typeof showToast === 'function') showToast('Installing OpenLibrary...');
      }
      deferredPrompt = null;
    } catch (err) {
      showInstallInstructionsModal();
    }
  } else {
    // Show instruction modal for iOS Safari / Chrome / Edge
    showInstallInstructionsModal();
  }
};

// Modal for iOS / desktop / manual install instructions
function showInstallInstructionsModal() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const isAndroid = /Android/.test(navigator.userAgent);

  let stepsHtml = '';

  if (isIOS) {
    stepsHtml = `
      <div class="install-step">
        <span class="step-num">1</span>
        <div>Tap the <strong>Share</strong> button <span style="font-size:1.2rem;">⎋</span> or <svg style="display:inline-block;vertical-align:middle;width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> at the bottom of Safari.</div>
      </div>
      <div class="install-step">
        <span class="step-num">2</span>
        <div>Scroll down and select <strong>"Add to Home Screen"</strong> <span style="font-size:1.2rem;">➕</span>.</div>
      </div>
      <div class="install-step">
        <span class="step-num">3</span>
        <div>Tap <strong>"Add"</strong> in the top-right corner. OpenLibrary will appear on your home screen like a native app!</div>
      </div>
    `;
  } else if (isAndroid) {
    stepsHtml = `
      <div class="install-step">
        <span class="step-num">1</span>
        <div>Tap the three-dot menu <strong style="font-size:1.2rem;">⋮</strong> in Chrome or your browser.</div>
      </div>
      <div class="install-step">
        <span class="step-num">2</span>
        <div>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</div>
      </div>
      <div class="install-step">
        <span class="step-num">3</span>
        <div>Confirm <strong>"Install"</strong>. The app launches independently with fast offline reading!</div>
      </div>
    `;
  } else {
    stepsHtml = `
      <div class="install-step">
        <span class="step-num">1</span>
        <div>Look at the right side of your browser's address bar for the <strong>Install</strong> icon <svg style="display:inline-block;vertical-align:middle;width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>.</div>
      </div>
      <div class="install-step">
        <span class="step-num">2</span>
        <div>Click <strong>Install</strong> or click browser menu (<strong>⋮</strong>) &rarr; <strong>"Install OpenLibrary..."</strong></div>
      </div>
      <div class="install-step">
        <span class="step-num">3</span>
        <div>Enjoy a dedicated window, offline access, and distraction-free book reading.</div>
      </div>
    `;
  }

  const existing = document.getElementById('pwaInstallModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'pwaInstallModal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <div style="display:flex;align-items:center;gap:.7rem;">
          <img src="favicon.svg" alt="App Icon" style="width:36px;height:36px;border-radius:8px;">
          <div>
            <h3 style="margin:0;font-size:1.2rem;">Install OpenLibrary App</h3>
            <p style="margin:0;font-size:.82rem;color:var(--muted);">Read books like an app &bull; Works offline</p>
          </div>
        </div>
        <button class="modal-close" aria-label="Close" onclick="document.getElementById('pwaInstallModal').remove()">&times;</button>
      </div>
      <div class="modal-body" style="padding:1.4rem 0;">
        <p style="font-size:.92rem;margin-bottom:1.2rem;line-height:1.5;">
          You can install OpenLibrary directly on your device. It runs smoothly with zero clutter, faster page turns, and offline library support!
        </p>
        <div class="install-steps">
          ${stepsHtml}
        </div>
      </div>
      <div class="modal-foot" style="display:flex;justify-content:flex-end;gap:.6rem;">
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('pwaInstallModal').remove()">Got it</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}
