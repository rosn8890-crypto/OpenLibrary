/* ambient.js - Procedural Web Audio Ambient Soundscapes for Focus Reading
   Zero audio downloads needed, 100% offline, realistic relaxing soundscapes!
*/

class AmbientSoundManager {
  constructor() {
    this.ctx = null;
    this.activeType = null;
    this.isPlaying = false;
    this.volume = parseFloat(localStorage.getItem('ol_ambient_vol') || '0.5');
    this.masterGain = null;
    this.nodes = [];
    this.interval = null;
  }

  initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    localStorage.setItem('ol_ambient_vol', String(this.volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.nodes.forEach(node => {
      try {
        if (node.stop) node.stop();
        node.disconnect();
      } catch (e) {}
    });
    this.nodes = [];
    this.isPlaying = false;
    this.activeType = null;
  }

  createNoiseBuffer(type = 'pink') {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    } else if (type === 'brown') {
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5; // gain compensation
      }
    } else {
      // Pink noise (Paul Kellet's filtered method)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    return buffer;
  }

  play(type) {
    this.initCtx();
    this.stop();

    this.activeType = type;
    this.isPlaying = true;

    switch (type) {
      case 'rain':
        this.playRain();
        break;
      case 'waves':
        this.playWaves();
        break;
      case 'campfire':
        this.playCampfire();
        break;
      case 'wind':
        this.playWind();
        break;
      case 'cafe':
        this.playCafe();
        break;
      case 'noise':
      default:
        this.playPinkNoise();
        break;
    }
  }

  playPinkNoise() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer('pink');
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
    this.nodes.push(noise, filter, gain);
  }

  playRain() {
    // Pink noise base for continuous rainfall
    const rainNoise = this.ctx.createBufferSource();
    rainNoise.buffer = this.createNoiseBuffer('pink');
    rainNoise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);

    const highpass = this.ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(200, this.ctx.currentTime);

    const rainGain = this.ctx.createGain();
    rainGain.gain.setValueAtTime(0.75, this.ctx.currentTime);

    rainNoise.connect(highpass);
    highpass.connect(filter);
    filter.connect(rainGain);
    rainGain.connect(this.masterGain);
    rainNoise.start();
    this.nodes.push(rainNoise, highpass, filter, rainGain);

    // Random soft raindrop clatter
    this.interval = setInterval(() => {
      if (!this.isPlaying || Math.random() > 0.6) return;
      try {
        const drop = this.ctx.createOscillator();
        const dropGain = this.ctx.createGain();
        drop.frequency.setValueAtTime(700 + Math.random() * 1200, this.ctx.currentTime);
        dropGain.gain.setValueAtTime(0.04 * Math.random(), this.ctx.currentTime);
        dropGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.08);

        drop.connect(dropGain);
        dropGain.connect(this.masterGain);
        drop.start();
        drop.stop(this.ctx.currentTime + 0.08);
      } catch (e) {}
    }, 120);
  }

  playWaves() {
    // Deep ocean surf: brown noise with slow undulating lowpass LFO
    const ocean = this.ctx.createBufferSource();
    ocean.buffer = this.createNoiseBuffer('brown');
    ocean.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350, this.ctx.currentTime);

    // LFO for surf wave rhythm (~0.12 Hz)
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(240, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const waveGain = this.ctx.createGain();
    waveGain.gain.setValueAtTime(0.9, this.ctx.currentTime);

    ocean.connect(filter);
    filter.connect(waveGain);
    waveGain.connect(this.masterGain);

    ocean.start();
    lfo.start();
    this.nodes.push(ocean, filter, lfo, lfoGain, waveGain);
  }

  playCampfire() {
    // Warm low crackling fire
    const fireBase = this.ctx.createBufferSource();
    fireBase.buffer = this.createNoiseBuffer('brown');
    fireBase.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, this.ctx.currentTime);

    const baseGain = this.ctx.createGain();
    baseGain.gain.setValueAtTime(0.65, this.ctx.currentTime);

    fireBase.connect(filter);
    filter.connect(baseGain);
    baseGain.connect(this.masterGain);
    fireBase.start();
    this.nodes.push(fireBase, filter, baseGain);

    // Wood crackle impulses
    this.interval = setInterval(() => {
      if (!this.isPlaying || Math.random() > 0.45) return;
      try {
        const crack = this.ctx.createBufferSource();
        const crackBuf = this.ctx.createBuffer(1, 800, this.ctx.sampleRate);
        const data = crackBuf.getChannelData(0);
        for (let i = 0; i < 800; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 80);
        crack.buffer = crackBuf;

        const crackGain = this.ctx.createGain();
        crackGain.gain.setValueAtTime(0.08 + Math.random() * 0.12, this.ctx.currentTime);

        crack.connect(crackGain);
        crackGain.connect(this.masterGain);
        crack.start();
      } catch (e) {}
    }, 180);
  }

  playWind() {
    const wind = this.ctx.createBufferSource();
    wind.buffer = this.createNoiseBuffer('pink');
    wind.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, this.ctx.currentTime);
    filter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    // Gentle wind gusts
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.18, this.ctx.currentTime);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(220, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8, this.ctx.currentTime);

    wind.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    wind.start();
    lfo.start();
    this.nodes.push(wind, filter, lfo, lfoGain, gain);
  }

  playCafe() {
    // Warm, comforting murmurs + gentle cafe clatter
    const cafeMurmur = this.ctx.createBufferSource();
    cafeMurmur.buffer = this.createNoiseBuffer('pink');
    cafeMurmur.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, this.ctx.currentTime);
    filter.Q.setValueAtTime(0.8, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, this.ctx.currentTime);

    cafeMurmur.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    cafeMurmur.start();
    this.nodes.push(cafeMurmur, filter, gain);
  }
}

window.ambientSound = new AmbientSoundManager();
