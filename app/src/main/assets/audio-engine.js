(function (global) {
  'use strict';

  var AudioCtx = global.AudioContext || global.webkitAudioContext;
  var OfflineCtx = global.OfflineAudioContext || global.webkitOfflineAudioContext;

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function midiToName(midi) {
    var names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    var n = ((midi % 12) + 12) % 12;
    var oct = Math.floor(midi / 12) - 1;
    return names[n] + oct;
  }

  function createNoiseBuffer(ctx) {
    var length = Math.floor(ctx.sampleRate * 0.45);
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function connectWithPan(ctx, sourceNode, panVal, destNode) {
    if (typeof ctx.createStereoPanner === 'function') {
      var panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, panVal || 0));
      sourceNode.connect(panner);
      panner.connect(destNode);
      return function () {
        try { sourceNode.disconnect(); } catch (e) {}
        try { panner.disconnect(); } catch (e) {}
      };
    }
    sourceNode.connect(destNode);
    return function () {
      try { sourceNode.disconnect(); } catch (e) {}
    };
  }

  function scheduleSynthVoice(ctx, dest, noiseBuf, synthParams, midi, vel, when, durSec, panVal, onPeak) {
    var p = synthParams || {};
    var osc = ctx.createOscillator();
    var filter = ctx.createBiquadFilter();
    var env = ctx.createGain();

    osc.type = p.waveform || 'sawtooth';
    osc.frequency.setValueAtTime(midiToFreq(midi), when);

    filter.type = p.filterType || 'lowpass';
    filter.frequency.setValueAtTime(p.cutoff || 3800, when);
    filter.Q.setValueAtTime(1.8, when);

    var atk = Math.max(0.003, (p.attack || 10) / 1000);
    var dec = Math.max(0.02, (p.decay || 180) / 1000);
    var sus = Math.max(0.02, Math.min(1, (p.sustain !== undefined ? p.sustain : 65) / 100));
    var rel = Math.max(0.02, (p.release || 220) / 1000);
    var peakGain = 0.28 * Math.max(0.05, Math.min(1, vel || 0.85));

    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(peakGain, when + atk);
    env.gain.exponentialRampToValueAtTime(Math.max(0.001, peakGain * sus), when + atk + dec);
    var noteOff = when + Math.max(atk + 0.02, durSec);
    env.gain.setValueAtTime(Math.max(0.001, peakGain * sus), noteOff);
    env.gain.exponentialRampToValueAtTime(0.0001, noteOff + rel);

    osc.connect(filter);
    filter.connect(env);
    var cleanupPan = connectWithPan(ctx, env, panVal, dest);

    if (onPeak) onPeak(peakGain * 2.2);

    osc.onended = function () {
      try { osc.disconnect(); } catch (e) {}
      try { filter.disconnect(); } catch (e) {}
      try { env.disconnect(); } catch (e) {}
      cleanupPan();
    };

    osc.start(when);
    osc.stop(noteOff + rel + 0.02);
  }

  function scheduleDrumVoice(ctx, dest, noiseBuf, kind, vel, when, panVal, pitchOffset, onPeak) {
    var v = Math.max(0.05, Math.min(1, vel || 0.9));
    var pitchRatio = Math.pow(2, (pitchOffset || 0) / 12);
    if (onPeak) onPeak(v * 0.95);

    if (kind === 'drum_kick') {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(145 * pitchRatio, when);
      osc.frequency.exponentialRampToValueAtTime(42 * pitchRatio, when + 0.09);
      g.gain.setValueAtTime(0.95 * v, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.32);
      osc.connect(g);
      var clean = connectWithPan(ctx, g, panVal, dest);
      osc.onended = function () {
        try { osc.disconnect(); } catch (e) {}
        try { g.disconnect(); } catch (e) {}
        clean();
      };
      osc.start(when);
      osc.stop(when + 0.34);
    } else if (kind === 'drum_snare') {
      var body = ctx.createOscillator();
      var bodyG = ctx.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(185 * pitchRatio, when);
      body.frequency.exponentialRampToValueAtTime(100 * pitchRatio, when + 0.08);
      bodyG.gain.setValueAtTime(0.45 * v, when);
      bodyG.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
      body.connect(bodyG);
      var cleanB = connectWithPan(ctx, bodyG, panVal, dest);
      body.onended = function () {
        try { body.disconnect(); bodyG.disconnect(); } catch (e) {}
        cleanB();
      };
      body.start(when);
      body.stop(when + 0.16);

      var ns = ctx.createBufferSource();
      ns.buffer = noiseBuf;
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(1400, when);
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(0.58 * v, when);
      ng.gain.exponentialRampToValueAtTime(0.001, when + 0.19);
      ns.connect(hp);
      hp.connect(ng);
      var cleanN = connectWithPan(ctx, ng, panVal, dest);
      ns.onended = function () {
        try { ns.disconnect(); hp.disconnect(); ng.disconnect(); } catch (e) {}
        cleanN();
      };
      ns.start(when);
      ns.stop(when + 0.21);
    } else if (kind === 'drum_hat') {
      var hns = ctx.createBufferSource();
      hns.buffer = noiseBuf;
      var hpf = ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.setValueAtTime(6800, when);
      var hg = ctx.createGain();
      hg.gain.setValueAtTime(0.35 * v, when);
      hg.gain.exponentialRampToValueAtTime(0.001, when + 0.075);
      hns.connect(hpf);
      hpf.connect(hg);
      var cleanH = connectWithPan(ctx, hg, panVal, dest);
      hns.onended = function () {
        try { hns.disconnect(); hpf.disconnect(); hg.disconnect(); } catch (e) {}
        cleanH();
      };
      hns.start(when);
      hns.stop(when + 0.09);
    } else if (kind === 'drum_clap') {
      var cns = ctx.createBufferSource();
      cns.buffer = noiseBuf;
      var bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.setValueAtTime(1350, when);
      bpf.Q.setValueAtTime(1.4, when);
      var cg = ctx.createGain();
      cg.gain.setValueAtTime(0.001, when);
      cg.gain.linearRampToValueAtTime(0.65 * v, when + 0.005);
      cg.gain.linearRampToValueAtTime(0.18 * v, when + 0.015);
      cg.gain.linearRampToValueAtTime(0.60 * v, when + 0.025);
      cg.gain.exponentialRampToValueAtTime(0.001, when + 0.22);
      cns.connect(bpf);
      bpf.connect(cg);
      var cleanC = connectWithPan(ctx, cg, panVal, dest);
      cns.onended = function () {
        try { cns.disconnect(); bpf.disconnect(); cg.disconnect(); } catch (e) {}
        cleanC();
      };
      cns.start(when);
      cns.stop(when + 0.24);
    } else {
      var posc = ctx.createOscillator();
      var pg = ctx.createGain();
      posc.type = 'triangle';
      posc.frequency.setValueAtTime(340 * pitchRatio, when);
      posc.frequency.exponentialRampToValueAtTime(140 * pitchRatio, when + 0.09);
      pg.gain.setValueAtTime(0.5 * v, when);
      pg.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
      posc.connect(pg);
      var cleanP = connectWithPan(ctx, pg, panVal, dest);
      posc.onended = function () {
        try { posc.disconnect(); pg.disconnect(); } catch (e) {}
        cleanP();
      };
      posc.start(when);
      posc.stop(when + 0.15);
    }
  }

  function scheduleMetronome(ctx, dest, accent, when) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(accent ? 1320 : 880, when);
    g.gain.setValueAtTime(0.28, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
    osc.connect(g);
    g.connect(dest);
    osc.onended = function () {
      try { osc.disconnect(); g.disconnect(); } catch (e) {}
    };
    osc.start(when);
    osc.stop(when + 0.055);
  }

  function HSAudioEngine() {
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.freqBytes = null;
    this.noiseBuffer = null;
    this.isPlaying = false;
    this.mode = 'PAT';
    this.metronome = false;
    this.drumPitchOffset = 0;
    this.currentBar = 0;
    this.currentStep = 0;
    this.nextStepTime = 0;
    this.timerId = null;
    this.rafId = null;
    this.lastDrawTime = 0;
    this.channelPeaks = {};
    this.settings = { latencyPreset: 'balanced', sampleRate: 44100, lowRamMode: false };
    this.projectGetter = null;
    this.onTickCallback = null;
    this.spectrumCanvas = null;
    this.stemSources = [];
    this.stemBuffers = {};
    this.isStemsPlaying = false;
  }

  HSAudioEngine.prototype.ensureContext = function () {
    if (!AudioCtx) return null;
    if (!this.ctx) {
      var opts = {};
      if (this.settings.latencyPreset === 'low') opts.latencyHint = 'interactive';
      else if (this.settings.latencyPreset === 'android7') opts.latencyHint = 'playback';
      else opts.latencyHint = 'balanced';
      try {
        this.ctx = new AudioCtx(opts);
      } catch (e) {
        this.ctx = new AudioCtx();
      }
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.72;
      this.freqBytes = new Uint8Array(this.analyser.frequencyBinCount);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.noiseBuffer = createNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      try { this.ctx.resume(); } catch (e) {}
    }
    return this.ctx;
  };

  HSAudioEngine.prototype.applySettings = function (settings) {
    this.settings = Object.assign({}, this.settings, settings);
    if (this.settings.lowRamMode && this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
      this.clearSpectrumCanvas();
    } else if (!this.settings.lowRamMode && this.isPlaying && !this.rafId) {
      this.startSpectrumLoop();
    }
  };

  HSAudioEngine.prototype.setMasterVolume = function (val) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1.25, val)), this.ctx.currentTime);
    }
  };

  HSAudioEngine.prototype.triggerChannelHit = function (channel, midiNote, velocity, durSec) {
    var ctx = this.ensureContext();
    if (!ctx || !channel) return;
    var project = this.projectGetter ? this.projectGetter() : null;
    if (project) this.setMasterVolume(project.masterVolume || 0.85);
    var chDest = ctx.createGain();
    chDest.gain.value = channel.volume !== undefined ? channel.volume : 0.85;
    chDest.connect(this.masterGain);
    var now = ctx.currentTime;
    var self = this;
    var onPeak = function (pk) {
      self.channelPeaks[channel.id] = Math.min(1, pk * (channel.volume || 0.85));
    };

    if (channel.kind === 'synth') {
      scheduleSynthVoice(ctx, chDest, this.noiseBuffer, channel.synth, midiNote || 60, velocity || 0.86, now, durSec || 0.25, channel.pan || 0, onPeak);
      setTimeout(function () { try { chDest.disconnect(); } catch (e) {} }, ((durSec || 0.25) + 0.8) * 1000);
    } else {
      scheduleDrumVoice(ctx, chDest, this.noiseBuffer, channel.kind, velocity || 0.9, now, channel.pan || 0, this.drumPitchOffset, onPeak);
      setTimeout(function () { try { chDest.disconnect(); } catch (e) {} }, 450);
    }
  };

  HSAudioEngine.prototype.play = function () {
    var ctx = this.ensureContext();
    if (!ctx) return;
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.nextStepTime = ctx.currentTime + 0.04;
    var intervalMs = this.settings.latencyPreset === 'android7' ? 40 : 25;
    var self = this;
    this.timerId = setInterval(function () { self.schedulerTick(); }, intervalMs);
    if (!this.settings.lowRamMode) {
      this.startSpectrumLoop();
    }
  };

  HSAudioEngine.prototype.pause = function () {
    this.isPlaying = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.clearSpectrumCanvas();
  };

  HSAudioEngine.prototype.stop = function () {
    this.pause();
    this.currentBar = 0;
    this.currentStep = 0;
    this.channelPeaks = {};
    if (this.onTickCallback) this.onTickCallback(0, 0);
  };

  HSAudioEngine.prototype.seekBar = function (bar) {
    this.currentBar = Math.max(0, bar);
    this.currentStep = 0;
    if (this.onTickCallback) this.onTickCallback(this.currentBar, this.currentStep);
  };

  HSAudioEngine.prototype.schedulerTick = function () {
    if (!this.isPlaying || !this.ctx || !this.projectGetter) return;
    var project = this.projectGetter();
    if (!project) return;

    this.setMasterVolume(project.masterVolume || 0.85);
    var lookahead = this.settings.latencyPreset === 'android7' ? 0.16 : 0.10;
    var bpm = Math.max(60, Math.min(220, project.bpm || 128));
    var stepSec = 60 / bpm / 4;
    var swingFrac = ((project.swing || 0) / 100) * 0.42;

    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      var step = this.currentStep;
      var bar = this.currentBar;
      var trigTime = this.nextStepTime + (step % 2 === 1 ? stepSec * swingFrac : 0);

      this.scheduleProjectStep(project, bar, step, trigTime, stepSec);

      if (this.onTickCallback) {
        this.onTickCallback(bar, step);
      }

      this.nextStepTime += stepSec;
      this.currentStep++;
      if (this.currentStep >= 16) {
        this.currentStep = 0;
        if (this.mode === 'SONG') {
          var maxBar = 4;
          for (var i = 0; i < project.playlist.length; i++) {
            if (project.playlist[i].bar + 1 > maxBar) maxBar = project.playlist[i].bar + 1;
          }
          this.currentBar = (this.currentBar + 1) % Math.max(4, maxBar);
        } else {
          this.currentBar = 0;
        }
      }
    }
  };

  HSAudioEngine.prototype.scheduleProjectStep = function (project, bar, step, when, stepSec) {
    var ctx = this.ctx;
    var self = this;

    if (this.metronome && step % 4 === 0) {
      scheduleMetronome(ctx, this.masterGain, step === 0, when);
    }

    var channels = project.channels || [];
    var anySolo = false;
    var chMap = {};
    for (var c = 0; c < channels.length; c++) {
      chMap[channels[c].id] = channels[c];
      if (channels[c].solo) anySolo = true;
    }

    // Decay peaks slightly
    Object.keys(this.channelPeaks).forEach(function (k) {
      self.channelPeaks[k] = (self.channelPeaks[k] || 0) * 0.72;
    });

    var activePatterns = [];
    if (this.mode === 'PAT') {
      for (var p = 0; p < project.patterns.length; p++) {
        if (project.patterns[p].id === project.activePatternId) {
          activePatterns.push(project.patterns[p]);
          break;
        }
      }
    } else {
      for (var pl = 0; pl < project.playlist.length; pl++) {
        var clip = project.playlist[pl];
        if (clip.bar === bar) {
          if (clip.stemType && this.stemBuffers[clip.stemType] && step === 0) {
            this.playSingleStemClip(clip.stemType, when);
          } else {
            for (var pp = 0; pp < project.patterns.length; pp++) {
              if (project.patterns[pp].id === clip.patternId) {
                activePatterns.push(project.patterns[pp]);
              }
            }
          }
        }
      }
    }

    for (var a = 0; a < activePatterns.length; a++) {
      var pat = activePatterns[a];
      var stepsObj = pat.steps || {};
      Object.keys(stepsObj).forEach(function (chId) {
        var arr = stepsObj[chId];
        var val = arr && arr[step] ? arr[step] : 0;
        if (val > 0) {
          var ch = chMap[chId];
          if (!ch) return;
          var audible = anySolo ? !!ch.solo : !ch.muted;
          if (!audible) return;
          var chGain = ctx.createGain();
          chGain.gain.value = ch.volume !== undefined ? ch.volume : 0.82;
          chGain.connect(self.masterGain);
          var onPk = function (pk) { self.channelPeaks[ch.id] = Math.min(1, pk * (ch.volume || 0.82)); };
          if (ch.kind === 'synth') {
            scheduleSynthVoice(ctx, chGain, self.noiseBuffer, ch.synth, 48, val, when, stepSec * 1.3, ch.pan || 0, onPk);
          } else {
            scheduleDrumVoice(ctx, chGain, self.noiseBuffer, ch.kind, val, when, ch.pan || 0, self.drumPitchOffset, onPk);
          }
          setTimeout(function () { try { chGain.disconnect(); } catch (e) {} }, 600);
        }
      });

      var notesObj = pat.pianoNotes || {};
      Object.keys(notesObj).forEach(function (chId) {
        var list = notesObj[chId] || [];
        var ch = chMap[chId];
        if (!ch) return;
        var audible = anySolo ? !!ch.solo : !ch.muted;
        if (!audible) return;
        for (var n = 0; n < list.length; n++) {
          var note = list[n];
          if (note.step === step) {
            var offsetSec = (note.micro || 0) * stepSec;
            var chGain = ctx.createGain();
            chGain.gain.value = ch.volume !== undefined ? ch.volume : 0.82;
            chGain.connect(self.masterGain);
            var onPk = function (pk) { self.channelPeaks[ch.id] = Math.min(1, pk * (ch.volume || 0.82)); };
            var dur = Math.max(0.08, (note.len || 2) * stepSec);
            if (ch.kind === 'synth') {
              scheduleSynthVoice(ctx, chGain, self.noiseBuffer, ch.synth, note.midi, note.vel || 0.85, when + offsetSec, dur, ch.pan || 0, onPk);
            } else {
              scheduleDrumVoice(ctx, chGain, self.noiseBuffer, ch.kind, note.vel || 0.85, when + offsetSec, ch.pan || 0, self.drumPitchOffset, onPk);
            }
            setTimeout(function () { try { chGain.disconnect(); } catch (e) {} }, (dur + 0.6) * 1000);
          }
        }
      });
    }
  };

  // 30fps Monochrome 5-Band Canvas Spectrum Analyzer (auto-pauses when stopped)
  HSAudioEngine.prototype.startSpectrumLoop = function () {
    var self = this;
    if (this.rafId || this.settings.lowRamMode) return;
    function frame(ts) {
      if (!self.isPlaying && !self.isStemsPlaying) {
        self.rafId = null;
        self.clearSpectrumCanvas();
        return;
      }
      if (ts - self.lastDrawTime >= 33) {
        self.lastDrawTime = ts;
        self.drawSpectrum();
      }
      self.rafId = requestAnimationFrame(frame);
    }
    this.rafId = requestAnimationFrame(frame);
  };

  HSAudioEngine.prototype.drawSpectrum = function () {
    var canvas = this.spectrumCanvas;
    if (!canvas || !this.analyser || !this.freqBytes) return;
    var g = canvas.getContext('2d');
    if (!g) return;
    this.analyser.getByteFrequencyData(this.freqBytes);

    var isLight = document.body.classList.contains('theme-light');
    var bg = isLight ? '#FFFFFF' : '#000000';
    var fg = isLight ? '#000000' : '#FFFFFF';
    var muted = isLight ? '#E0E0E0' : '#1A1A1A';

    var w = canvas.width;
    var h = canvas.height;
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    // Group 64 FFT bins into 5 musical bands
    var ranges = [[0, 2], [2, 6], [6, 14], [14, 30], [30, 60]];
    var gap = 4;
    var barW = Math.floor((w - gap * 6) / 5);

    for (var b = 0; b < 5; b++) {
      var sum = 0;
      var r = ranges[b];
      for (var i = r[0]; i < r[1]; i++) {
        sum += this.freqBytes[i] || 0;
      }
      var avg = sum / Math.max(1, r[1] - r[0]);
      var norm = avg / 255;
      var x = gap + b * (barW + gap);
      g.fillStyle = muted;
      g.fillRect(x, 3, barW, h - 6);
      var barH = Math.max(2, Math.floor(norm * (h - 6)));
      g.fillStyle = fg;
      g.fillRect(x, h - 3 - barH, barW, barH);
    }
  };

  HSAudioEngine.prototype.clearSpectrumCanvas = function () {
    var canvas = this.spectrumCanvas;
    if (!canvas) return;
    var g = canvas.getContext('2d');
    if (!g) return;
    var isLight = document.body.classList.contains('theme-light');
    g.fillStyle = isLight ? '#FFFFFF' : '#000000';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = isLight ? '#E0E0E0' : '#1A1A1A';
    var gap = 4;
    var barW = Math.floor((canvas.width - gap * 6) / 5);
    for (var b = 0; b < 5; b++) {
      g.fillRect(gap + b * (barW + gap), canvas.height - 5, barW, 2);
    }
  };

  // Offline .WAV Bounce via OfflineAudioContext (16-bit or 24-bit PCM)
  HSAudioEngine.prototype.renderProjectToWavBlob = function (project, bitDepth) {
    if (!OfflineCtx) {
      return Promise.reject(new Error('OfflineAudioContext not supported in this browser.'));
    }
    var sr = this.settings.sampleRate || 44100;
    var bpm = Math.max(60, Math.min(220, project.bpm || 128));
    var stepSec = 60 / bpm / 4;
    var swingFrac = ((project.swing || 0) / 100) * 0.42;

    var totalBars = 1;
    if (this.mode === 'SONG' && project.playlist && project.playlist.length) {
      for (var i = 0; i < project.playlist.length; i++) {
        if (project.playlist[i].bar + 1 > totalBars) totalBars = project.playlist[i].bar + 1;
      }
    } else {
      totalBars = 2;
    }

    var totalSec = totalBars * 16 * stepSec + 0.6;
    var offline = new OfflineCtx(2, Math.ceil(totalSec * sr), sr);
    var master = offline.createGain();
    master.gain.value = project.masterVolume || 0.85;
    master.connect(offline.destination);
    var noiseBuf = createNoiseBuffer(offline);

    var channels = project.channels || [];
    var chMap = {};
    var anySolo = false;
    for (var c = 0; c < channels.length; c++) {
      chMap[channels[c].id] = channels[c];
      if (channels[c].solo) anySolo = true;
    }

    for (var bar = 0; bar < totalBars; bar++) {
      var pats = [];
      if (this.mode === 'PAT') {
        for (var p = 0; p < project.patterns.length; p++) {
          if (project.patterns[p].id === project.activePatternId) {
            pats.push(project.patterns[p]);
            break;
          }
        }
      } else {
        for (var pl = 0; pl < project.playlist.length; pl++) {
          if (project.playlist[pl].bar === bar) {
            for (var pp = 0; pp < project.patterns.length; pp++) {
              if (project.patterns[pp].id === project.playlist[pl].patternId) {
                pats.push(project.patterns[pp]);
              }
            }
          }
        }
      }

      for (var step = 0; step < 16; step++) {
        var when = (bar * 16 + step) * stepSec + (step % 2 === 1 ? stepSec * swingFrac : 0);
        for (var a = 0; a < pats.length; a++) {
          var pat = pats[a];
          var stepsObj = pat.steps || {};
          Object.keys(stepsObj).forEach(function (chId) {
            var val = stepsObj[chId] && stepsObj[chId][step] ? stepsObj[chId][step] : 0;
            if (val > 0) {
              var ch = chMap[chId];
              if (!ch) return;
              var audible = anySolo ? !!ch.solo : !ch.muted;
              if (!audible) return;
              var cg = offline.createGain();
              cg.gain.value = ch.volume !== undefined ? ch.volume : 0.82;
              cg.connect(master);
              if (ch.kind === 'synth') {
                scheduleSynthVoice(offline, cg, noiseBuf, ch.synth, 48, val, when, stepSec * 1.3, ch.pan || 0);
              } else {
                scheduleDrumVoice(offline, cg, noiseBuf, ch.kind, val, when, ch.pan || 0, 0);
              }
            }
          });
          var notesObj = pat.pianoNotes || {};
          Object.keys(notesObj).forEach(function (chId) {
            var list = notesObj[chId] || [];
            var ch = chMap[chId];
            if (!ch) return;
            var audible = anySolo ? !!ch.solo : !ch.muted;
            if (!audible) return;
            for (var n = 0; n < list.length; n++) {
              var note = list[n];
              if (note.step === step) {
                var cg = offline.createGain();
                cg.gain.value = ch.volume !== undefined ? ch.volume : 0.82;
                cg.connect(master);
                var dur = Math.max(0.08, (note.len || 2) * stepSec);
                if (ch.kind === 'synth') {
                  scheduleSynthVoice(offline, cg, noiseBuf, ch.synth, note.midi, note.vel || 0.85, when + (note.micro || 0) * stepSec, dur, ch.pan || 0);
                } else {
                  scheduleDrumVoice(offline, cg, noiseBuf, ch.kind, note.vel || 0.85, when + (note.micro || 0) * stepSec, ch.pan || 0, 0);
                }
              }
            }
          });
        }
      }
    }

    return offline.startRendering().then(function (renderedBuffer) {
      return encodeAudioBufferToWav(renderedBuffer, bitDepth || 16);
    });
  };

  function encodeAudioBufferToWav(audioBuffer, bitDepth) {
    var numChannels = Math.min(2, audioBuffer.numberOfChannels);
    var sampleRate = audioBuffer.sampleRate;
    var length = audioBuffer.length;
    var bytesPerSample = bitDepth === 24 ? 3 : 2;
    var blockAlign = numChannels * bytesPerSample;
    var dataSize = length * blockAlign;
    var buffer = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buffer);

    function writeStr(offset, str) {
      for (var i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    var ch0 = audioBuffer.getChannelData(0);
    var ch1 = numChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
    var offset = 44;

    for (var i = 0; i < length; i++) {
      var samples = numChannels > 1 ? [ch0[i], ch1[i]] : [ch0[i]];
      for (var c = 0; c < samples.length; c++) {
        var s = Math.max(-1, Math.min(1, samples[c]));
        if (bitDepth === 24) {
          var v24 = Math.floor(s * 8388607);
          view.setUint8(offset, v24 & 0xff);
          view.setUint8(offset + 1, (v24 >> 8) & 0xff);
          view.setUint8(offset + 2, (v24 >> 16) & 0xff);
          offset += 3;
        } else {
          var v16 = s < 0 ? s * 0x8000 : s * 0x7fff;
          view.setInt16(offset, v16, true);
          offset += 2;
        }
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  // Stem Splitter via decodeAudioData + OfflineAudioContext BiquadFilter isolation
  HSAudioEngine.prototype.processAudioFileToStems = function (arrayBuffer) {
    var ctx = this.ensureContext();
    var self = this;
    return new Promise(function (resolve, reject) {
      if (!ctx || !OfflineCtx) {
        reject(new Error('Web Audio decoding unavailable.'));
        return;
      }
      ctx.decodeAudioData(arrayBuffer, function (decoded) {
        var maxFrames = Math.min(decoded.length, decoded.sampleRate * 20);
        var sr = decoded.sampleRate;

        function renderBand(type, freq, q, secondType, secondFreq) {
          var off = new OfflineCtx(1, maxFrames, sr);
          var src = off.createBufferSource();
          src.buffer = decoded;
          var f1 = off.createBiquadFilter();
          f1.type = type;
          f1.frequency.value = freq;
          f1.Q.value = q || 0.7;
          src.connect(f1);
          if (secondType) {
            var f2 = off.createBiquadFilter();
            f2.type = secondType;
            f2.frequency.value = secondFreq;
            f1.connect(f2);
            f2.connect(off.destination);
          } else {
            f1.connect(off.destination);
          }
          src.start(0);
          return off.startRendering();
        }

        Promise.all([
          renderBand('bandpass', 1200, 1.1, null, 0),
          renderBand('highpass', 3800, 0.8, null, 0),
          renderBand('lowpass', 190, 0.9, null, 0),
          renderBand('bandpass', 650, 0.7, 'lowpass', 5200)
        ]).then(function (buffers) {
          self.stemBuffers = {
            Vocals: buffers[0],
            Drums: buffers[1],
            Bass: buffers[2],
            Instruments: buffers[3]
          };
          var previews = {};
          Object.keys(self.stemBuffers).forEach(function (k) {
            previews[k] = extractPeaks(self.stemBuffers[k], 40);
          });
          resolve(previews);
        }, reject);
      }, function () {
        reject(new Error('Could not decode audio file. Try a standard .wav or .mp3.'));
      });
    });
  };

  function extractPeaks(buf, count) {
    var data = buf.getChannelData(0);
    var step = Math.max(1, Math.floor(data.length / count));
    var out = [];
    for (var i = 0; i < count; i++) {
      var peak = 0;
      var start = i * step;
      var end = Math.min(data.length, start + step);
      for (var j = start; j < end; j++) {
        var a = Math.abs(data[j]);
        if (a > peak) peak = a;
      }
      out.push(Math.max(0.06, Math.min(1, peak)));
    }
    return out;
  }

  HSAudioEngine.prototype.playSingleStemClip = function (stemName, when) {
    var ctx = this.ensureContext();
    var buf = this.stemBuffers[stemName];
    if (!ctx || !buf) return;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var g = ctx.createGain();
    g.gain.value = 0.85;
    src.connect(g);
    g.connect(this.masterGain);
    src.onended = function () {
      try { src.disconnect(); g.disconnect(); } catch (e) {}
    };
    src.start(when || ctx.currentTime);
  };

  HSAudioEngine.prototype.previewStem = function (stemName) {
    this.stopStemPreview();
    var ctx = this.ensureContext();
    var buf = this.stemBuffers[stemName];
    if (!ctx || !buf) return;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g);
    g.connect(this.masterGain);
    var self = this;
    src.onended = function () {
      try { src.disconnect(); g.disconnect(); } catch (e) {}
      self.isStemsPlaying = false;
    };
    this.stemSources.push(src);
    this.isStemsPlaying = true;
    src.start(ctx.currentTime);
    if (!this.settings.lowRamMode) this.startSpectrumLoop();
  };

  HSAudioEngine.prototype.stopStemPreview = function () {
    for (var i = 0; i < this.stemSources.length; i++) {
      try { this.stemSources[i].stop(); } catch (e) {}
      try { this.stemSources[i].disconnect(); } catch (e) {}
    }
    this.stemSources = [];
    this.isStemsPlaying = false;
  };

  global.HSAudio = new HSAudioEngine();
  global.HSMidiUtils = { midiToName: midiToName, midiToFreq: midiToFreq };
})(window);
