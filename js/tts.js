/* tts.js - Text-to-Speech (Read Aloud) Engine for OpenLibrary Reader
   Turns any PDF book into an engaging audiobook with voice selection & auto-page-turn.
*/

class TextToSpeechManager {
  constructor() {
    this.synth = window.speechSynthesis;
    this.isSpeaking = false;
    this.isPaused = false;
    this.currentUtterance = null;
    this.rate = parseFloat(localStorage.getItem('ol_tts_rate') || '1.0');
    this.autoTurn = localStorage.getItem('ol_tts_autoturn') !== 'false';
    this.voices = [];
    this.selectedVoice = null;
    this.pageText = '';
    this.onStateChange = null;

    if (this.synth) {
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices().filter(v => v.lang.startsWith('en') || v.lang.includes('-'));
    const savedVoiceName = localStorage.getItem('ol_tts_voice');
    if (savedVoiceName) {
      this.selectedVoice = this.voices.find(v => v.name === savedVoiceName) || this.voices[0];
    } else {
      this.selectedVoice = this.voices.find(v => v.default || v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')) || this.voices[0];
    }
  }

  setRate(r) {
    this.rate = Math.max(0.5, Math.min(2.5, r));
    localStorage.setItem('ol_tts_rate', String(this.rate));
  }

  setVoice(voiceName) {
    const v = this.voices.find(voice => voice.name === voiceName);
    if (v) {
      this.selectedVoice = v;
      localStorage.setItem('ol_tts_voice', v.name);
    }
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
    this.isPaused = false;
    this.currentUtterance = null;
    if (this.onStateChange) this.onStateChange({ status: 'stopped' });
  }

  pause() {
    if (this.synth && this.isSpeaking && !this.isPaused) {
      this.synth.pause();
      this.isPaused = true;
      if (this.onStateChange) this.onStateChange({ status: 'paused' });
    }
  }

  resume() {
    if (this.synth && this.isSpeaking && this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
      if (this.onStateChange) this.onStateChange({ status: 'speaking' });
    }
  }

  async readCurrentPage(pdfDoc, pageNum, onPageFinish) {
    if (!this.synth) {
      if (typeof showToast === 'function') showToast('Speech synthesis not supported in this browser.');
      return;
    }

    if (this.isSpeaking) {
      if (this.isPaused) {
        this.resume();
        return;
      } else {
        this.pause();
        return;
      }
    }

    this.stop();

    try {
      if (this.onStateChange) this.onStateChange({ status: 'loading' });
      const page = await pdfDoc.getPage(pageNum);
      const content = await page.getTextContent();
      const rawText = content.items.map(item => item.str).join(' ');
      const cleanText = rawText.replace(/\s+/g, ' ').trim();

      if (!cleanText || cleanText.length < 5) {
        if (typeof showToast === 'function') showToast('No readable text found on this page.');
        this.stop();
        return;
      }

      this.pageText = cleanText;
      const utterance = new SpeechSynthesisUtterance(cleanText);
      if (this.selectedVoice) utterance.voice = this.selectedVoice;
      utterance.rate = this.rate;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.isPaused = false;
        if (this.onStateChange) this.onStateChange({ status: 'speaking', text: cleanText });
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.isPaused = false;
        this.currentUtterance = null;
        if (this.onStateChange) this.onStateChange({ status: 'finished' });

        if (this.autoTurn && typeof onPageFinish === 'function') {
          onPageFinish();
        }
      };

      utterance.onerror = (e) => {
        console.warn('TTS error:', e);
        this.stop();
      };

      this.currentUtterance = utterance;
      this.synth.speak(utterance);
    } catch (err) {
      console.error('Failed to extract text for speech:', err);
      this.stop();
    }
  }
}

window.ttsManager = new TextToSpeechManager();
