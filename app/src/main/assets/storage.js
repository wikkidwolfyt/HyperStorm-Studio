(function (global) {
  'use strict';

  var KEYS = {
    SESSION: 'hs_session_v1',
    SETTINGS: 'hs_settings_v1',
    PROJECTS: 'hs_projects_v1',
    COLLABS: 'hs_collabs_v1',
    SHARED: 'hs_shared_v1'
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function createDefaultChannels() {
    return [
      { id: 'kick', name: 'Kick', kind: 'drum_kick', volume: 0.92, pan: 0, muted: false, solo: false },
      { id: 'snare', name: 'Snare', kind: 'drum_snare', volume: 0.80, pan: 0, muted: false, solo: false },
      { id: 'hat', name: 'Hi-Hat', kind: 'drum_hat', volume: 0.68, pan: 0.12, muted: false, solo: false },
      { id: 'clap', name: 'Clap', kind: 'drum_clap', volume: 0.74, pan: -0.1, muted: false, solo: false },
      { id: 'perc', name: 'Perc', kind: 'drum_perc', volume: 0.68, pan: 0.2, muted: false, solo: false },
      {
        id: 'bass',
        name: 'Bass',
        kind: 'synth',
        volume: 0.84,
        pan: 0,
        muted: false,
        solo: false,
        synth: {
          waveform: 'square',
          filterType: 'lowpass',
          cutoff: 950,
          attack: 5,
          decay: 140,
          sustain: 72,
          release: 130
        }
      },
      {
        id: 'lead',
        name: 'Lead',
        kind: 'synth',
        volume: 0.74,
        pan: 0,
        muted: false,
        solo: false,
        synth: {
          waveform: 'sawtooth',
          filterType: 'lowpass',
          cutoff: 3800,
          attack: 10,
          decay: 180,
          sustain: 62,
          release: 220
        }
      }
    ];
  }

  function createDemoProjects() {
    var p1 = {
      format: 'HyperStorm',
      version: 1,
      id: 'hyper_demo_1',
      name: 'Midnight Monochrome',
      bpm: 128,
      swing: 8,
      masterVolume: 0.86,
      updatedAt: Date.now(),
      channels: createDefaultChannels(),
      activePatternId: 'pat1',
      patterns: [
        {
          id: 'pat1',
          name: 'PAT 1 · PULSE',
          steps: {
            kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0],
            snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
            hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,1,1,0],
            clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
            perc:  [0,0,1,0, 0,0,0,1, 0,0,1,0, 0,0,0,0],
            bass:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 1,0,0,0],
            lead:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
          },
          pianoNotes: {
            bass: [
              { id: 'b1', midi: 36, step: 0, len: 3, vel: 0.9 },
              { id: 'b2', midi: 39, step: 8, len: 3, vel: 0.86 },
              { id: 'b3', midi: 43, step: 12, len: 4, vel: 0.88 }
            ],
            lead: [
              { id: 'l1', midi: 60, step: 0, len: 2, vel: 0.85 },
              { id: 'l2', midi: 63, step: 0, len: 2, vel: 0.80 },
              { id: 'l3', midi: 67, step: 4, len: 2, vel: 0.84 },
              { id: 'l4', midi: 70, step: 8, len: 3, vel: 0.88 },
              { id: 'l5', midi: 72, step: 12, len: 3, vel: 0.90 }
            ]
          }
        },
        {
          id: 'pat2',
          name: 'PAT 2 · BREAK',
          steps: {
            kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],
            snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,1,0],
            hat:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
            clap:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
            perc:  [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,0,0,0],
            bass:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
            lead:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
          },
          pianoNotes: {
            lead: [
              { id: 'l2a', midi: 60, step: 0, len: 4, vel: 0.78 },
              { id: 'l2b', midi: 67, step: 8, len: 4, vel: 0.82 }
            ]
          }
        },
        {
          id: 'pat3',
          name: 'PAT 3 · DROP',
          steps: {
            kick:  [1,0,0,1, 0,0,1,0, 1,0,0,0, 1,0,1,0],
            snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
            hat:   [1,0,1,1, 1,0,1,0, 1,1,1,0, 1,1,1,1],
            clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
            perc:  [0,0,1,0, 0,1,0,0, 0,0,1,0, 0,1,0,0],
            bass:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
            lead:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
          },
          pianoNotes: {
            bass: [
              { id: 'd1', midi: 36, step: 0, len: 2, vel: 0.92 },
              { id: 'd2', midi: 36, step: 3, len: 2, vel: 0.88 },
              { id: 'd3', midi: 41, step: 8, len: 3, vel: 0.9 },
              { id: 'd4', midi: 43, step: 12, len: 3, vel: 0.9 }
            ],
            lead: [
              { id: 'dl1', midi: 60, step: 0, len: 2, vel: 0.86 },
              { id: 'dl2', midi: 67, step: 2, len: 2, vel: 0.84 },
              { id: 'dl3', midi: 72, step: 4, len: 2, vel: 0.9 },
              { id: 'dl4', midi: 70, step: 8, len: 2, vel: 0.84 },
              { id: 'dl5', midi: 67, step: 10, len: 2, vel: 0.82 },
              { id: 'dl6', midi: 63, step: 12, len: 3, vel: 0.86 }
            ]
          }
        }
      ],
      playlist: [
        { track: 0, bar: 0, patternId: 'pat2', label: 'PAT 2' },
        { track: 0, bar: 1, patternId: 'pat2', label: 'PAT 2' },
        { track: 1, bar: 2, patternId: 'pat1', label: 'PAT 1' },
        { track: 1, bar: 3, patternId: 'pat1', label: 'PAT 1' },
        { track: 2, bar: 4, patternId: 'pat3', label: 'PAT 3' },
        { track: 2, bar: 5, patternId: 'pat3', label: 'PAT 3' },
        { track: 3, bar: 6, patternId: 'pat2', label: 'PAT 2' },
        { track: 3, bar: 7, patternId: 'pat2', label: 'PAT 2' }
      ],
      audioClips: {}
    };

    var p2 = {
      format: 'HyperStorm',
      version: 1,
      id: 'hyper_demo_2',
      name: 'SubZero Halftime',
      bpm: 140,
      swing: 12,
      masterVolume: 0.88,
      updatedAt: Date.now() - 3600000,
      channels: createDefaultChannels(),
      activePatternId: 'pat1',
      patterns: [
        {
          id: 'pat1',
          name: 'PAT 1 · 808',
          steps: {
            kick:  [1,0,0,1, 0,0,1,0, 0,0,1,0, 0,1,0,0],
            snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
            hat:   [1,1,1,0, 1,0,1,1, 1,0,1,1, 1,1,1,1],
            clap:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],
            perc:  [0,0,1,0, 0,1,0,0, 0,0,0,1, 0,0,0,0],
            bass:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
            lead:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
          },
          pianoNotes: {
            bass: [
              { id: 'sb1', midi: 36, step: 0, len: 5, vel: 0.95 },
              { id: 'sb2', midi: 39, step: 10, len: 4, vel: 0.90 }
            ],
            lead: [
              { id: 'sl1', midi: 60, step: 0, len: 2, vel: 0.84 },
              { id: 'sl2', midi: 63, step: 3, len: 2, vel: 0.80 },
              { id: 'sl3', midi: 67, step: 6, len: 2, vel: 0.86 },
              { id: 'sl4', midi: 65, step: 10, len: 3, vel: 0.82 },
              { id: 'sl5', midi: 63, step: 14, len: 2, vel: 0.84 }
            ]
          }
        },
        {
          id: 'pat2',
          name: 'PAT 2 · ROLLS',
          steps: {
            kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,1,0],
            snare: [0,0,0,0, 0,0,0,0, 1,0,0,0, 1,0,1,1],
            hat:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
            clap:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
            perc:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
            bass:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
            lead:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
          },
          pianoNotes: {}
        }
      ],
      playlist: [
        { track: 0, bar: 0, patternId: 'pat1', label: 'PAT 1' },
        { track: 1, bar: 1, patternId: 'pat1', label: 'PAT 1' },
        { track: 2, bar: 2, patternId: 'pat2', label: 'PAT 2' },
        { track: 2, bar: 3, patternId: 'pat1', label: 'PAT 1' }
      ],
      audioClips: {}
    };

    return [p1, p2];
  }

  function createEmptyProject(name) {
    return {
      format: 'HyperStorm',
      version: 1,
      id: 'hyper_' + Date.now(),
      name: name || 'Untitled Session',
      bpm: 124,
      swing: 0,
      masterVolume: 0.85,
      updatedAt: Date.now(),
      channels: createDefaultChannels(),
      activePatternId: 'pat1',
      patterns: [
        {
          id: 'pat1',
          name: 'PAT 1',
          steps: {
            kick: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
            snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
            hat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]
          },
          pianoNotes: {}
        },
        { id: 'pat2', name: 'PAT 2', steps: {}, pianoNotes: {} }
      ],
      playlist: [
        { track: 0, bar: 0, patternId: 'pat1', label: 'PAT 1' }
      ],
      audioClips: {}
    };
  }

  function defaultCollaborators() {
    return [
      { id: 'c1', name: 'Maya Lin', email: 'maya@hyperstorm.audio', role: 'Mix Engineer', online: true },
      { id: 'c2', name: 'Devon K.', email: 'devon@subzero.fm', role: 'Producer', online: true },
      { id: 'c3', name: 'Sora Takahashi', email: 'sora@mono-labs.jp', role: 'Sound Designer', online: false }
    ];
  }

  function defaultSharedProjects() {
    return [
      { id: 'sh1', name: 'Monolith_Master_v4.hyper', owner: 'Maya Lin', bpm: 130, collaborators: 3 },
      { id: 'sh2', name: 'Noir_DrumBus_Stems.hyper', owner: 'Devon K.', bpm: 140, collaborators: 2 }
    ];
  }

  function safeRead(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  var SYNTH_PRESETS = [
    { id: 'sp_saw', name: 'Monochrome Saw Lead', desc: 'Sawtooth · Cutoff 3800Hz · Crisp ADSR', synth: { waveform: 'sawtooth', filterType: 'lowpass', cutoff: 3800, attack: 10, decay: 180, sustain: 62, release: 220 } },
    { id: 'sp_sub', name: 'Obsidian Sub Bass', desc: 'Square · Cutoff 820Hz · Heavy Low-End', synth: { waveform: 'square', filterType: 'lowpass', cutoff: 820, attack: 4, decay: 140, sustain: 78, release: 120 } },
    { id: 'sp_pluck', name: 'Binary Pluck', desc: 'Triangle · Cutoff 4600Hz · Short Decay', synth: { waveform: 'triangle', filterType: 'lowpass', cutoff: 4600, attack: 2, decay: 110, sustain: 12, release: 140 } },
    { id: 'sp_acid', name: 'High-Pass Acid', desc: 'Sawtooth · Highpass 620Hz · Snappy', synth: { waveform: 'sawtooth', filterType: 'highpass', cutoff: 620, attack: 4, decay: 160, sustain: 35, release: 150 } },
    { id: 'sp_sine', name: 'Pure Sine Keys', desc: 'Sine · Cutoff 6000Hz · Smooth Pad', synth: { waveform: 'sine', filterType: 'lowpass', cutoff: 6000, attack: 45, decay: 260, sustain: 70, release: 360 } }
  ];

  var DRUM_KITS = [
    { id: 'dk_mono', name: 'HS Monochrome 808', desc: 'Deep sub kick, sharp noise snare & metallic hats', pitchOffset: 0 },
    { id: 'dk_tight', name: 'Android7 Tight Punch', desc: 'Short transient kick & dry minimal perc', pitchOffset: 6 },
    { id: 'dk_heavy', name: 'SubZero Industrial', desc: 'Low-tuned thump kick & crunchy clap', pitchOffset: -5 }
  ];

  global.HSStorage = {
    SYNTH_PRESETS: SYNTH_PRESETS,
    DRUM_KITS: DRUM_KITS,
    clone: clone,
    getSession: function () {
      return safeRead(KEYS.SESSION, null);
    },
    saveSession: function (session) {
      safeWrite(KEYS.SESSION, session);
    },
    clearSession: function () {
      try { localStorage.removeItem(KEYS.SESSION); } catch (e) {}
    },
    getSettings: function () {
      return Object.assign({
        theme: 'black',
        latencyPreset: 'balanced',
        sampleRate: 44100,
        lowRamMode: false
      }, safeRead(KEYS.SETTINGS, {}));
    },
    saveSettings: function (settings) {
      safeWrite(KEYS.SETTINGS, settings);
    },
    getProjects: function () {
      var list = safeRead(KEYS.PROJECTS, null);
      if (!list || !list.length) {
        list = createDemoProjects();
        safeWrite(KEYS.PROJECTS, list);
      }
      return list;
    },
    saveProjects: function (list) {
      safeWrite(KEYS.PROJECTS, list);
    },
    createEmptyProject: createEmptyProject,
    getCollaborators: function () {
      var list = safeRead(KEYS.COLLABS, null);
      if (!list) {
        list = defaultCollaborators();
        safeWrite(KEYS.COLLABS, list);
      }
      return list;
    },
    saveCollaborators: function (list) {
      safeWrite(KEYS.COLLABS, list);
    },
    getSharedProjects: function () {
      var list = safeRead(KEYS.SHARED, null);
      if (!list) {
        list = defaultSharedProjects();
        safeWrite(KEYS.SHARED, list);
      }
      return list;
    },
    saveSharedProjects: function (list) {
      safeWrite(KEYS.SHARED, list);
    },
    clearAllCache: function () {
      try {
        localStorage.removeItem(KEYS.PROJECTS);
        localStorage.removeItem(KEYS.COLLABS);
        localStorage.removeItem(KEYS.SHARED);
      } catch (e) {}
    }
  };
})(window);
