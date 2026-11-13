(function (global) {
  'use strict';

  var Storage = global.HSStorage;
  var Audio = global.HSAudio;
  var MidiUtils = global.HSMidiUtils;

  var SCALES = {
    chromatic: [0,1,2,3,4,5,6,7,8,9,10,11],
    minor: [0,2,3,5,7,8,10],
    major: [0,2,4,5,7,9,11],
    pentatonic: [0,2,3,7,10]
  };

  var MPC_PADS = [
    { label: 'KICK', sub: '808 Sub', chId: 'kick', midi: 36 },
    { label: 'SNARE', sub: 'Snap', chId: 'snare', midi: 38 },
    { label: 'HI-HAT', sub: 'Closed', chId: 'hat', midi: 42 },
    { label: 'CLAP', sub: 'Stereo', chId: 'clap', midi: 39 },
    { label: 'PERC L', sub: 'Low', chId: 'perc', midi: 45 },
    { label: 'PERC H', sub: 'Rim', chId: 'perc', midi: 57 },
    { label: 'BASS C2', sub: 'Root', chId: 'bass', midi: 36 },
    { label: 'BASS D#', sub: 'm3', chId: 'bass', midi: 39 },
    { label: 'BASS F2', sub: '4th', chId: 'bass', midi: 41 },
    { label: 'BASS G2', sub: '5th', chId: 'bass', midi: 43 },
    { label: 'LEAD C4', sub: 'Root', chId: 'lead', midi: 60 },
    { label: 'LEAD D#', sub: 'm3', chId: 'lead', midi: 63 },
    { label: 'LEAD F4', sub: '4th', chId: 'lead', midi: 65 },
    { label: 'LEAD G4', sub: '5th', chId: 'lead', midi: 67 },
    { label: 'LEAD A#', sub: 'm7', chId: 'lead', midi: 70 },
    { label: 'LEAD C5', sub: 'Oct', chId: 'lead', midi: 72 }
  ];

  var state = {
    page: 'signin',
    session: null,
    settings: Storage.getSettings(),
    projects: Storage.getProjects(),
    collaborators: Storage.getCollaborators(),
    sharedProjects: Storage.getSharedProjects(),
    activeProjectId: null,
    activeProject: null,
    activeWorkspace: 'ws-rack',
    pianoChannelId: 'lead',
    pianoScale: 'minor',
    pianoScaleLock: true,
    pianoVelocity: 0.85,
    recordArmed: false,
    recordCursor: 0,
    editingSynthChId: null,
    undoStack: [],
    stemsPreviewWaveforms: null,
    toastTimer: null
  };

  function $(id) { return document.getElementById(id); }

  function showToast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      el.classList.add('hidden');
    }, 2400);
  }

  function applyThemeAndPerformance() {
    var isLight = state.settings.theme === 'light';
    document.body.classList.toggle('theme-light', isLight);
    document.body.classList.toggle('theme-black', !isLight);
    document.body.classList.toggle('low-ram', !!state.settings.lowRamMode);

    var lbl = isLight ? 'BLACK' : 'LIGHT';
    var b1 = $('btn-home-theme');
    var b2 = $('btn-signin-theme');
    if (b1) b1.textContent = lbl;
    if (b2) b2.textContent = 'THEME: ' + (isLight ? 'LIGHT' : 'BLACK');

    var setB = $('set-theme-black');
    var setL = $('set-theme-light');
    if (setB) setB.classList.toggle('btn-primary', !isLight);
    if (setL) setL.classList.toggle('btn-primary', isLight);

    var lrBtn = $('set-low-ram');
    if (lrBtn) {
      lrBtn.textContent = state.settings.lowRamMode ? 'ON' : 'OFF';
      lrBtn.classList.toggle('active', !!state.settings.lowRamMode);
    }

    Audio.applySettings(state.settings);
    if (global.HyperStormAndroid && typeof global.HyperStormAndroid.onThemeChanged === 'function') {
      try { global.HyperStormAndroid.onThemeChanged(state.settings.theme); } catch (e) {}
    }
  }

  function switchPage(pageName) {
    state.page = pageName;
    var pages = ['signin', 'home', 'studio'];
    for (var i = 0; i < pages.length; i++) {
      var el = $('page-' + pages[i]);
      if (el) el.classList.toggle('active', pages[i] === pageName);
    }
    if (pageName === 'home') {
      Audio.stop();
      renderHome();
    } else if (pageName === 'studio') {
      renderStudioAll();
    }
  }

  function pushUndoSnapshot() {
    if (!state.activeProject) return;
    state.undoStack.push(Storage.clone(state.activeProject));
    if (state.undoStack.length > 20) state.undoStack.shift();
  }

  function persistActiveProject(silent) {
    if (!state.activeProject) return;
    state.activeProject.updatedAt = Date.now();
    var found = false;
    for (var i = 0; i < state.projects.length; i++) {
      if (state.projects[i].id === state.activeProject.id) {
        state.projects[i] = Storage.clone(state.activeProject);
        found = true;
        break;
      }
    }
    if (!found) state.projects.unshift(Storage.clone(state.activeProject));
    Storage.saveProjects(state.projects);
    if (!silent) showToast('Saved ' + state.activeProject.name + '.hyper');
  }

  function openProjectInStudio(projectId) {
    var target = null;
    for (var i = 0; i < state.projects.length; i++) {
      if (state.projects[i].id === projectId) {
        target = state.projects[i];
        break;
      }
    }
    if (!target) return;
    state.activeProjectId = target.id;
    state.activeProject = Storage.clone(target);
    state.undoStack = [];
    Audio.stop();
    switchPage('studio');
  }

  function exportFileDownload(filename, contentOrBlob, isBlob) {
    if (global.HyperStormAndroid && typeof global.HyperStormAndroid.saveBase64File === 'function') {
      var blob = isBlob ? contentOrBlob : new Blob([contentOrBlob], { type: 'application/json' });
      var reader = new FileReader();
      reader.onloadend = function () {
        var res = reader.result || '';
        var base64 = res.indexOf(',') >= 0 ? res.split(',')[1] : res;
        global.HyperStormAndroid.saveBase64File(filename, isBlob ? 'audio/wav' : 'application/json', base64);
      };
      reader.readAsDataURL(blob);
      return;
    }

    var dlBlob = isBlob ? contentOrBlob : new Blob([contentOrBlob], { type: 'application/json' });
    var url = URL.createObjectURL(dlBlob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  // --- Page 1: Sign-In ---
  function initSignIn() {
    $('signin-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = ($('signin-email').value || '').trim();
      var name = ($('signin-name').value || '').trim();
      var errEl = $('signin-error');
      var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailOk) {
        errEl.textContent = 'Enter a valid producer email address.';
        errEl.classList.remove('hidden');
        return;
      }
      errEl.classList.add('hidden');
      var displayName = name || email.split('@')[0];
      state.session = { email: email, displayName: displayName, offline: false, signedInAt: Date.now() };
      Storage.saveSession(state.session);
      switchPage('home');
    });

    $('btn-continue-offline').addEventListener('click', function () {
      state.session = { email: 'offline@hyperstorm.local', displayName: 'Offline Producer', offline: true, signedInAt: Date.now() };
      Storage.saveSession(state.session);
      switchPage('home');
    });

    $('btn-signin-theme').addEventListener('click', toggleTheme);
  }

  function toggleTheme() {
    state.settings.theme = state.settings.theme === 'black' ? 'light' : 'black';
    Storage.saveSettings(state.settings);
    applyThemeAndPerformance();
    Audio.clearSpectrumCanvas();
  }

  // --- Page 2: Home Dashboard ---
  function renderHome() {
    var s = state.session || { email: 'offline@hyperstorm.local', displayName: 'Producer' };
    var name = s.displayName || 'Producer';
    var initials = name.replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/).map(function (w) { return w.charAt(0).toUpperCase(); }).join('').slice(0, 2) || 'HS';

    $('profile-display-name').textContent = name;
    $('profile-email').textContent = s.email;
    $('profile-initials').textContent = initials;
    $('profile-project-count').textContent = String(state.projects.length);

    // Render My Projects (.hyper)
    var projList = $('projects-list');
    projList.innerHTML = '';
    for (var i = 0; i < state.projects.length; i++) {
      (function (proj) {
        var card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML =
          '<div class="project-head">' +
            '<div>' +
              '<div class="project-title">' + escapeHtml(proj.name) + '.hyper</div>' +
              '<div class="muted-mono">' + proj.bpm + ' BPM · ' + proj.patterns.length + ' PATTERNS</div>' +
            '</div>' +
          '</div>' +
          '<div class="project-actions">' +
            '<button type="button" class="btn btn-primary btn-sm act-open">OPEN IN STUDIO</button>' +
            '<button type="button" class="btn btn-outline btn-sm act-export">EXPORT .HYPER</button>' +
            '<button type="button" class="btn btn-outline btn-sm act-delete">DELETE</button>' +
          '</div>';
        card.querySelector('.act-open').addEventListener('click', function () {
          openProjectInStudio(proj.id);
        });
        card.querySelector('.act-export').addEventListener('click', function () {
          var safe = proj.name.replace(/[^A-Za-z0-9_\-]/g, '_') + '.hyper';
          exportFileDownload(safe, JSON.stringify(proj, null, 2), false);
          showToast('Exported ' + safe);
        });
        card.querySelector('.act-delete').addEventListener('click', function () {
          state.projects = state.projects.filter(function (p) { return p.id !== proj.id; });
          Storage.saveProjects(state.projects);
          renderHome();
          showToast('Deleted ' + proj.name + '.hyper');
        });
        projList.appendChild(card);
      })(state.projects[i]);
    }

    // Render Shared .hyper Projects
    var sharedEl = $('shared-projects-list');
    sharedEl.innerHTML = '';
    for (var sIdx = 0; sIdx < state.sharedProjects.length; sIdx++) {
      var sh = state.sharedProjects[sIdx];
      var row = document.createElement('div');
      row.className = 'shared-item';
      row.innerHTML =
        '<div><div class="project-title">' + escapeHtml(sh.name) + '</div>' +
        '<div class="muted-mono">Owner: ' + escapeHtml(sh.owner) + ' · ' + sh.bpm + ' BPM</div></div>' +
        '<span class="muted-mono">' + sh.collaborators + ' MEMBERS</span>';
      sharedEl.appendChild(row);
    }

    // Render Collaborators
    var collabEl = $('collaborators-list');
    collabEl.innerHTML = '';
    for (var cIdx = 0; cIdx < state.collaborators.length; cIdx++) {
      var col = state.collaborators[cIdx];
      var item = document.createElement('div');
      item.className = 'collab-item';
      item.innerHTML =
        '<div class="collab-left">' +
          '<span class="status-dot ' + (col.online ? 'online' : 'offline') + '"></span>' +
          '<div><div class="project-title">' + escapeHtml(col.name) + '</div>' +
          '<div class="muted-mono">' + escapeHtml(col.email) + ' · ' + escapeHtml(col.role) + '</div></div>' +
        '</div>' +
        '<span class="muted-mono">' + (col.online ? 'ONLINE' : 'OFFLINE') + '</span>';
      collabEl.appendChild(item);
    }
  }

  function initHome() {
    $('btn-home-theme').addEventListener('click', toggleTheme);
    $('btn-home-settings').addEventListener('click', openSettingsModal);
    $('btn-edit-name').addEventListener('click', openSettingsModal);

    $('btn-new-project').addEventListener('click', function () {
      var name = 'Session_' + (state.projects.length + 1);
      var proj = Storage.createEmptyProject(name);
      state.projects.unshift(proj);
      Storage.saveProjects(state.projects);
      openProjectInStudio(proj.id);
    });

    $('btn-import-hyper-home').addEventListener('click', function () {
      $('file-import-hyper').click();
    });

    $('btn-open-invite').addEventListener('click', function () {
      var sel = $('invite-project');
      sel.innerHTML = '';
      for (var i = 0; i < state.projects.length; i++) {
        var opt = document.createElement('option');
        opt.value = state.projects[i].id;
        opt.textContent = state.projects[i].name + '.hyper';
        sel.appendChild(opt);
      }
      $('invite-error').classList.add('hidden');
      $('modal-invite').classList.remove('hidden');
    });

    $('invite-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = ($('invite-email').value || '').trim();
      var role = $('invite-role').value;
      var projId = $('invite-project').value;
      var errEl = $('invite-error');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = 'Enter a valid collaborator email.';
        errEl.classList.remove('hidden');
        return;
      }
      errEl.classList.add('hidden');
      var name = email.split('@')[0];
      state.collaborators.unshift({ id: 'c_' + Date.now(), name: name, email: email, role: role, online: true });
      Storage.saveCollaborators(state.collaborators);

      var projName = 'Shared_Session.hyper';
      var bpm = 128;
      for (var i = 0; i < state.projects.length; i++) {
        if (state.projects[i].id === projId) {
          projName = state.projects[i].name + '.hyper';
          bpm = state.projects[i].bpm;
          break;
        }
      }
      state.sharedProjects.unshift({ id: 'sh_' + Date.now(), name: projName, owner: (state.session && state.session.displayName) || 'You', bpm: bpm, collaborators: 2 });
      Storage.saveSharedProjects(state.sharedProjects);

      $('invite-email').value = '';
      $('modal-invite').classList.add('hidden');
      renderHome();
      showToast('Invited ' + email + ' to ' + projName);
    });
  }

  // --- Page 3: Studio Workspace ---
  function getActivePattern() {
    var p = state.activeProject;
    if (!p) return null;
    for (var i = 0; i < p.patterns.length; i++) {
      if (p.patterns[i].id === p.activePatternId) return p.patterns[i];
    }
    return p.patterns[0];
  }

  function renderStudioAll() {
    if (!state.activeProject) return;
    $('studio-project-title').textContent = state.activeProject.name + '.hyper';
    $('bpm-val').textContent = String(state.activeProject.bpm);
    $('btn-mode').textContent = Audio.mode;
    $('btn-metro').classList.toggle('active', Audio.metronome);
    $('btn-record').classList.toggle('active', state.recordArmed);
    $('btn-play').textContent = Audio.isPlaying ? 'PAUSE' : 'PLAY';
    $('btn-play').classList.toggle('active', Audio.isPlaying);

    renderPatternPills();
    renderPlaylist();
    renderChannelRack();
    renderPianoRoll();
    renderMpcPads();
    renderMixer();
    renderBrowser();
  }

  function renderPatternPills() {
    var p = state.activeProject;
    if (!p) return;
    var targets = ['playlist-pattern-pills', 'rack-pattern-pills'];
    for (var t = 0; t < targets.length; t++) {
      var container = $(targets[t]);
      if (!container) continue;
      container.innerHTML = '';
      for (var i = 0; i < p.patterns.length; i++) {
        (function (pat) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-chip' + (pat.id === p.activePatternId ? ' active' : '');
          btn.textContent = pat.name;
          btn.addEventListener('click', function () {
            p.activePatternId = pat.id;
            renderPatternPills();
            renderChannelRack();
            renderPianoRoll();
            $('playlist-brush-label').textContent = 'BRUSH: ' + pat.name;
          });
          container.appendChild(btn);
        })(p.patterns[i]);
      }
    }
    var cur = getActivePattern();
    if (cur) $('playlist-brush-label').textContent = 'BRUSH: ' + cur.name;
  }

  function renderPlaylist() {
    var p = state.activeProject;
    var grid = $('playlist-grid');
    if (!p || !grid) return;
    grid.innerHTML = '';
    var sections = ['INTRO', 'INTRO', 'VERSE', 'VERSE', 'CHORUS', 'CHORUS', 'OUTRO', 'OUTRO'];

    // Ruler Row
    var rulerRow = document.createElement('div');
    rulerRow.className = 'pl-row';
    var corner = document.createElement('div');
    corner.className = 'pl-label-cell';
    corner.textContent = 'TRACK / BAR';
    rulerRow.appendChild(corner);

    for (var b = 0; b < 8; b++) {
      (function (barIdx) {
        var cell = document.createElement('div');
        cell.className = 'pl-ruler-cell' + (Audio.currentBar === barIdx && Audio.mode === 'SONG' ? ' playhead' : '');
        cell.dataset.bar = String(barIdx);
        cell.innerHTML = '<div>' + (barIdx + 1) + '</div><div class="muted-mono">' + sections[barIdx] + '</div>';
        cell.addEventListener('click', function () {
          Audio.seekBar(barIdx);
          updatePlayheadHighlights(barIdx, Audio.currentStep);
        });
        rulerRow.appendChild(cell);
      })(b);
    }
    grid.appendChild(rulerRow);

    var tracks = ['Track 1 · Drums', 'Track 2 · Bass', 'Track 3 · Lead', 'Track 4 · Stems'];
    for (var tr = 0; tr < tracks.length; tr++) {
      (function (trackIdx, trackName) {
        var row = document.createElement('div');
        row.className = 'pl-row';
        var lbl = document.createElement('div');
        lbl.className = 'pl-label-cell';
        lbl.textContent = trackName;
        row.appendChild(lbl);

        for (var bar = 0; bar < 8; bar++) {
          (function (barIdx) {
            var cell = document.createElement('div');
            cell.className = 'pl-cell';
            var clip = null;
            for (var k = 0; k < p.playlist.length; k++) {
              if (p.playlist[k].track === trackIdx && p.playlist[k].bar === barIdx) {
                clip = p.playlist[k];
                break;
              }
            }
            if (clip) {
              var blk = document.createElement('div');
              blk.className = 'pl-block';
              blk.textContent = clip.label;
              cell.appendChild(blk);
            }
            cell.addEventListener('click', function () {
              pushUndoSnapshot();
              if (clip) {
                p.playlist = p.playlist.filter(function (c) { return !(c.track === trackIdx && c.bar === barIdx); });
              } else {
                var activePat = getActivePattern();
                p.playlist.push({ track: trackIdx, bar: barIdx, patternId: activePat.id, label: activePat.name.split(' ')[0] + ' ' + (activePat.name.split(' ')[1] || '') });
              }
              renderPlaylist();
            });
            row.appendChild(cell);
          })(bar);
        }
        grid.appendChild(row);
      })(tr, tracks[tr]);
    }
  }

  function renderChannelRack() {
    var p = state.activeProject;
    var pat = getActivePattern();
    var list = $('rack-channels-list');
    if (!p || !pat || !list) return;

    $('rack-swing').value = String(p.swing || 0);
    $('swing-label').textContent = 'SWING ' + (p.swing || 0) + '%';

    list.innerHTML = '';
    for (var i = 0; i < p.channels.length; i++) {
      (function (ch) {
        var card = document.createElement('div');
        card.className = 'rack-card';

        var head = document.createElement('div');
        head.className = 'rack-card-head';

        var nameBtn = document.createElement('button');
        nameBtn.type = 'button';
        nameBtn.className = 'rack-name-btn';
        nameBtn.textContent = ch.name + (ch.kind === 'synth' ? ' [SYNTH · EDIT]' : '');
        nameBtn.addEventListener('click', function () {
          if (ch.kind === 'synth') {
            openSynthModal(ch.id);
          } else {
            Audio.triggerChannelHit(ch, 60, 0.9, 0.2);
          }
        });

        var msRow = document.createElement('div');
        msRow.className = 'btn-row';

        var mBtn = document.createElement('button');
        mBtn.type = 'button';
        mBtn.className = 'btn-chip' + (ch.muted ? ' active' : '');
        mBtn.textContent = 'M';
        mBtn.addEventListener('click', function () {
          ch.muted = !ch.muted;
          renderChannelRack();
          renderMixer();
        });

        var sBtn = document.createElement('button');
        sBtn.type = 'button';
        sBtn.className = 'btn-chip' + (ch.solo ? ' active' : '');
        sBtn.textContent = 'S';
        sBtn.addEventListener('click', function () {
          ch.solo = !ch.solo;
          renderChannelRack();
          renderMixer();
        });

        msRow.appendChild(mBtn);
        msRow.appendChild(sBtn);
        head.appendChild(nameBtn);
        head.appendChild(msRow);
        card.appendChild(head);

        var stepsRow = document.createElement('div');
        stepsRow.className = 'rack-steps-row';
        var arr = (pat.steps && pat.steps[ch.id]) ? pat.steps[ch.id] : [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];

        for (var s = 0; s < 16; s++) {
          (function (stepIdx) {
            var pad = document.createElement('button');
            pad.type = 'button';
            var isOn = arr[stepIdx] > 0;
            pad.className = 'step-pad' + (Math.floor(stepIdx / 4) % 2 === 1 ? ' beat-alt' : '') + (isOn ? ' on' : '');
            pad.dataset.step = String(stepIdx);
            pad.textContent = String(stepIdx + 1);
            pad.addEventListener('click', function () {
              pushUndoSnapshot();
              if (!pat.steps) pat.steps = {};
              if (!pat.steps[ch.id]) pat.steps[ch.id] = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
              var next = pat.steps[ch.id][stepIdx] > 0 ? 0 : 0.9;
              pat.steps[ch.id][stepIdx] = next;
              if (next > 0) Audio.triggerChannelHit(ch, 48, next, 0.18);
              renderChannelRack();
            });
            stepsRow.appendChild(pad);
          })(s);
        }

        card.appendChild(stepsRow);
        list.appendChild(card);
      })(p.channels[i]);
    }
  }

  function renderPianoRoll() {
    var p = state.activeProject;
    var pat = getActivePattern();
    var sel = $('piano-channel-select');
    var grid = $('piano-grid');
    if (!p || !pat || !sel || !grid) return;

    sel.innerHTML = '';
    for (var i = 0; i < p.channels.length; i++) {
      if (p.channels[i].kind === 'synth') {
        var opt = document.createElement('option');
        opt.value = p.channels[i].id;
        opt.textContent = p.channels[i].name;
        if (p.channels[i].id === state.pianoChannelId) opt.selected = true;
        sel.appendChild(opt);
      }
    }

    var targetCh = null;
    for (var j = 0; j < p.channels.length; j++) {
      if (p.channels[j].id === state.pianoChannelId) { targetCh = p.channels[j]; break; }
    }
    if (!targetCh) targetCh = p.channels[p.channels.length - 1];

    var notes = (pat.pianoNotes && pat.pianoNotes[targetCh.id]) ? pat.pianoNotes[targetCh.id] : [];
    var scaleSet = SCALES[state.pianoScale] || SCALES.chromatic;

    grid.innerHTML = '';
    for (var midi = 72; midi >= 36; midi--) {
      (function (m) {
        var row = document.createElement('div');
        row.className = 'pr-row';
        var pc = m % 12;
        var isBlack = [1,3,6,8,10].indexOf(pc) >= 0;
        var inScale = scaleSet.indexOf(pc) >= 0;

        var key = document.createElement('div');
        key.className = 'pr-key' + (isBlack ? ' black-key' : '');
        key.textContent = MidiUtils.midiToName(m);
        key.addEventListener('click', function () {
          Audio.triggerChannelHit(targetCh, m, state.pianoVelocity, 0.28);
          if (state.recordArmed) {
            recordPianoNote(targetCh, m);
          }
        });
        row.appendChild(key);

        for (var st = 0; st < 16; st++) {
          (function (stepIdx) {
            var cell = document.createElement('div');
            var activeNote = null;
            for (var n = 0; n < notes.length; n++) {
              if (notes[n].midi === m && stepIdx >= notes[n].step && stepIdx < notes[n].step + (notes[n].len || 1)) {
                activeNote = notes[n];
                break;
              }
            }
            cell.className = 'pr-cell' + (!inScale ? ' out-scale' : '') + (activeNote ? ' active-note' : '');
            cell.dataset.step = String(stepIdx);
            cell.addEventListener('click', function () {
              var resolvedMidi = m;
              if (state.pianoScaleLock && !inScale) {
                resolvedMidi = snapToScale(m, scaleSet);
              }
              pushUndoSnapshot();
              if (!pat.pianoNotes) pat.pianoNotes = {};
              if (!pat.pianoNotes[targetCh.id]) pat.pianoNotes[targetCh.id] = [];
              var list = pat.pianoNotes[targetCh.id];
              var existingIdx = -1;
              for (var idx = 0; idx < list.length; idx++) {
                if (list[idx].midi === resolvedMidi && stepIdx >= list[idx].step && stepIdx < list[idx].step + (list[idx].len || 1)) {
                  existingIdx = idx;
                  break;
                }
              }
              if (existingIdx >= 0) {
                list.splice(existingIdx, 1);
              } else {
                list.push({ id: 'n_' + Date.now() + '_' + stepIdx, midi: resolvedMidi, step: stepIdx, len: 2, vel: state.pianoVelocity });
                Audio.triggerChannelHit(targetCh, resolvedMidi, state.pianoVelocity, 0.25);
              }
              renderPianoRoll();
            });
            row.appendChild(cell);
          })(st);
        }
        grid.appendChild(row);
      })(midi);
    }
  }

  function snapToScale(midi, scaleSet) {
    for (var offset = 1; offset <= 6; offset++) {
      if (scaleSet.indexOf((midi + offset) % 12) >= 0) return Math.min(72, midi + offset);
      if (scaleSet.indexOf((midi - offset + 12) % 12) >= 0) return Math.max(36, midi - offset);
    }
    return midi;
  }

  function recordPianoNote(ch, midi) {
    var pat = getActivePattern();
    if (!pat) return;
    pushUndoSnapshot();
    var step = Audio.isPlaying ? Audio.currentStep : state.recordCursor;
    if (!pat.pianoNotes) pat.pianoNotes = {};
    if (!pat.pianoNotes[ch.id]) pat.pianoNotes[ch.id] = [];
    pat.pianoNotes[ch.id].push({ id: 'rec_' + Date.now(), midi: midi, step: step, len: 2, vel: state.pianoVelocity });
    if (!Audio.isPlaying) state.recordCursor = (step + 2) % 16;
    renderPianoRoll();
  }

  function renderMpcPads() {
    var grid = $('mpc-grid');
    if (!grid || !state.activeProject) return;
    grid.innerHTML = '';
    var chMap = {};
    for (var c = 0; c < state.activeProject.channels.length; c++) {
      chMap[state.activeProject.channels[c].id] = state.activeProject.channels[c];
    }

    for (var r = 0; r < 4; r++) {
      var row = document.createElement('div');
      row.className = 'mpc-row';
      for (var col = 0; col < 4; col++) {
        (function (idx) {
          var cfg = MPC_PADS[idx];
          var pad = document.createElement('button');
          pad.type = 'button';
          pad.className = 'mpc-pad';
          pad.innerHTML =
            '<span class="mpc-pad-num">PAD ' + (idx < 9 ? '0' + (idx + 1) : (idx + 1)) + '</span>' +
            '<div><div class="mpc-pad-label">' + cfg.label + '</div><div class="mpc-pad-sub">' + cfg.sub + '</div></div>';

          var fire = function (ev) {
            if (ev) ev.preventDefault();
            pad.classList.add('pressed');
            setTimeout(function () { pad.classList.remove('pressed'); }, 110);
            var ch = chMap[cfg.chId];
            if (ch) {
              Audio.triggerChannelHit(ch, cfg.midi, 0.92, 0.24);
              $('mpc-last-hit').textContent = 'HIT: ' + cfg.label + ' (' + MidiUtils.midiToName(cfg.midi) + ')';
              if (state.recordArmed) {
                var pat = getActivePattern();
                var st = Audio.isPlaying ? Audio.currentStep : state.recordCursor;
                if (ch.kind === 'synth') {
                  recordPianoNote(ch, cfg.midi);
                } else if (pat) {
                  if (!pat.steps) pat.steps = {};
                  if (!pat.steps[ch.id]) pat.steps[ch.id] = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
                  pat.steps[ch.id][st] = 0.92;
                  if (!Audio.isPlaying) state.recordCursor = (st + 1) % 16;
                  renderChannelRack();
                }
              }
            }
          };

          pad.addEventListener('touchstart', fire, false);
          pad.addEventListener('mousedown', fire, false);
          row.appendChild(pad);
        })(r * 4 + col);
      }
      grid.appendChild(row);
    }
  }

  function renderMixer() {
    var p = state.activeProject;
    var wrap = $('mixer-strips');
    if (!p || !wrap) return;
    wrap.innerHTML = '';

    for (var i = 0; i < p.channels.length; i++) {
      (function (ch) {
        var strip = document.createElement('div');
        strip.className = 'mixer-strip';
        strip.innerHTML =
          '<div class="mixer-ch-name">' + escapeHtml(ch.name) + '</div>' +
          '<div class="muted-mono">' + Math.round((ch.volume || 0.8) * 100) + '%</div>' +
          '<div class="mixer-fader-wrap">' +
            '<input type="range" class="vertical-fader" min="0" max="120" value="' + Math.round((ch.volume || 0.8) * 100) + '" />' +
            '<div class="peak-meter-box"><div class="peak-meter-fill" data-peak="' + ch.id + '"></div></div>' +
          '</div>' +
          '<div class="muted-mono">PAN</div>' +
          '<input type="range" class="mono-slider" style="width:78px" min="-100" max="100" value="' + Math.round((ch.pan || 0) * 100) + '" />' +
          '<div class="btn-row mt-sm">' +
            '<button type="button" class="btn-chip' + (ch.muted ? ' active' : '') + '">M</button>' +
            '<button type="button" class="btn-chip' + (ch.solo ? ' active' : '') + '">S</button>' +
          '</div>';

        var ranges = strip.querySelectorAll('input[type="range"]');
        ranges[0].addEventListener('input', function () {
          ch.volume = Number(this.value) / 100;
          strip.querySelector('.muted-mono').textContent = this.value + '%';
        });
        ranges[1].addEventListener('input', function () {
          ch.pan = Number(this.value) / 100;
        });
        var btns = strip.querySelectorAll('button');
        btns[0].addEventListener('click', function () { ch.muted = !ch.muted; renderMixer(); renderChannelRack(); });
        btns[1].addEventListener('click', function () { ch.solo = !ch.solo; renderMixer(); renderChannelRack(); });
        wrap.appendChild(strip);
      })(p.channels[i]);
    }

    // Master Strip
    var master = document.createElement('div');
    master.className = 'mixer-strip master';
    master.innerHTML =
      '<div class="mixer-ch-name">MASTER</div>' +
      '<div class="muted-mono" id="master-vol-lbl">' + Math.round((p.masterVolume || 0.85) * 100) + '%</div>' +
      '<div class="mixer-fader-wrap">' +
        '<input type="range" class="vertical-fader" min="0" max="120" value="' + Math.round((p.masterVolume || 0.85) * 100) + '" />' +
      '</div>' +
      '<div class="muted-mono">MAIN OUT</div>';
    master.querySelector('input').addEventListener('input', function () {
      p.masterVolume = Number(this.value) / 100;
      Audio.setMasterVolume(p.masterVolume);
      $('master-vol-lbl').textContent = this.value + '%';
    });
    wrap.appendChild(master);
  }

  function renderBrowser() {
    var synthList = $('browser-synth-presets');
    synthList.innerHTML = '';
    for (var i = 0; i < Storage.SYNTH_PRESETS.length; i++) {
      (function (preset) {
        var row = document.createElement('div');
        row.className = 'preset-item';
        row.innerHTML = '<div><div class="project-title">' + escapeHtml(preset.name) + '</div><div class="muted-small">' + escapeHtml(preset.desc) + '</div></div><button type="button" class="btn-chip">LOAD</button>';
        row.querySelector('button').addEventListener('click', function () {
          var p = state.activeProject;
          if (!p) return;
          for (var c = 0; c < p.channels.length; c++) {
            if (p.channels[c].id === state.pianoChannelId && p.channels[c].kind === 'synth') {
              p.channels[c].synth = Storage.clone(preset.synth);
              Audio.triggerChannelHit(p.channels[c], 60, 0.88, 0.32);
              showToast('Loaded ' + preset.name + ' -> ' + p.channels[c].name);
              break;
            }
          }
        });
        synthList.appendChild(row);
      })(Storage.SYNTH_PRESETS[i]);
    }

    var kitList = $('browser-drum-kits');
    kitList.innerHTML = '';
    for (var k = 0; k < Storage.DRUM_KITS.length; k++) {
      (function (kit) {
        var row = document.createElement('div');
        row.className = 'preset-item';
        row.innerHTML = '<div><div class="project-title">' + escapeHtml(kit.name) + '</div><div class="muted-small">' + escapeHtml(kit.desc) + '</div></div><button type="button" class="btn-chip">APPLY</button>';
        row.querySelector('button').addEventListener('click', function () {
          Audio.drumPitchOffset = kit.pitchOffset;
          if (state.activeProject && state.activeProject.channels[0]) {
            Audio.triggerChannelHit(state.activeProject.channels[0], 36, 0.95, 0.25);
          }
          showToast('Active Kit: ' + kit.name);
        });
        kitList.appendChild(row);
      })(Storage.DRUM_KITS[k]);
    }

    renderStemList();
  }

  function renderStemList() {
    var wrap = $('stem-tracks-list');
    wrap.innerHTML = '';
    var previews = state.stemsPreviewWaveforms;
    if (!previews) return;
    var stems = ['Vocals', 'Drums', 'Bass', 'Instruments'];
    for (var i = 0; i < stems.length; i++) {
      (function (stemName) {
        var card = document.createElement('div');
        card.className = 'stem-card';
        card.innerHTML =
          '<div class="project-head">' +
            '<div class="project-title">' + stemName.toUpperCase() + ' STEM</div>' +
            '<div class="btn-row">' +
              '<button type="button" class="btn-chip act-preview">PREVIEW</button>' +
              '<button type="button" class="btn-chip act-add-pl">+ PLAYLIST</button>' +
            '</div>' +
          '</div>' +
          '<canvas class="stem-wave" width="280" height="36"></canvas>';

        var canvas = card.querySelector('canvas');
        drawStemWave(canvas, previews[stemName] || []);

        card.querySelector('.act-preview').addEventListener('click', function () {
          Audio.previewStem(stemName);
          showToast('Previewing ' + stemName + ' stem');
        });
        card.querySelector('.act-add-pl').addEventListener('click', function () {
          if (!state.activeProject) return;
          pushUndoSnapshot();
          state.activeProject.playlist.push({
            track: 3,
            bar: 0,
            patternId: 'stem_' + stemName,
            stemType: stemName,
            label: stemName.toUpperCase()
          });
          Audio.mode = 'SONG';
          $('btn-mode').textContent = 'SONG';
          renderPlaylist();
          showToast('Added ' + stemName + ' stem to Playlist Track 4');
        });
        wrap.appendChild(card);
      })(stems[i]);
    }
  }

  function drawStemWave(canvas, peaks) {
    var g = canvas.getContext('2d');
    if (!g || !peaks.length) return;
    var isLight = document.body.classList.contains('theme-light');
    g.fillStyle = isLight ? '#F5F5F5' : '#0D0D0D';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = isLight ? '#000000' : '#FFFFFF';
    var barW = Math.max(2, Math.floor((canvas.width - 8) / peaks.length) - 2);
    for (var i = 0; i < peaks.length; i++) {
      var h = Math.max(3, Math.floor(peaks[i] * (canvas.height - 6)));
      g.fillRect(4 + i * (barW + 2), Math.floor((canvas.height - h) / 2), barW, h);
    }
  }

  function updatePlayheadHighlights(bar, step) {
    var barStr = String(bar + 1);
    while (barStr.length < 3) barStr = '0' + barStr;
    var beatStr = String(Math.floor(step / 4) + 1);
    var stStr = String((step % 4) + 1);
    if (stStr.length < 2) stStr = '0' + stStr;
    $('studio-timecode').textContent = barStr + ':' + beatStr + ':' + stStr + ' · ' + Audio.mode;

    var stepPads = document.querySelectorAll('.step-pad');
    for (var i = 0; i < stepPads.length; i++) {
      stepPads[i].classList.toggle('playhead', Audio.isPlaying && Number(stepPads[i].dataset.step) === step);
    }

    var prCells = document.querySelectorAll('.pr-cell');
    for (var j = 0; j < prCells.length; j++) {
      prCells[j].classList.toggle('playhead', Audio.isPlaying && Number(prCells[j].dataset.step) === step);
    }

    var plRulers = document.querySelectorAll('.pl-ruler-cell');
    for (var r = 0; r < plRulers.length; r++) {
      plRulers[r].classList.toggle('playhead', Audio.isPlaying && Audio.mode === 'SONG' && Number(plRulers[r].dataset.bar) === bar);
    }

    if (!state.settings.lowRamMode) {
      var meters = document.querySelectorAll('[data-peak]');
      for (var m = 0; m < meters.length; m++) {
        var chId = meters[m].getAttribute('data-peak');
        var pk = Audio.isPlaying ? (Audio.channelPeaks[chId] || 0) : 0;
        meters[m].style.height = Math.round(Math.min(1, pk) * 100) + '%';
      }
    }
  }

  function openSynthModal(chId) {
    state.editingSynthChId = chId;
    var ch = null;
    for (var i = 0; i < state.activeProject.channels.length; i++) {
      if (state.activeProject.channels[i].id === chId) { ch = state.activeProject.channels[i]; break; }
    }
    if (!ch || !ch.synth) return;
    $('synth-modal-title').textContent = ch.name.toUpperCase() + ' · SYNTH ENGINE';
    var wfBtns = $('synth-waveform-row').querySelectorAll('button');
    for (var w = 0; w < wfBtns.length; w++) {
      wfBtns[w].classList.toggle('active', wfBtns[w].getAttribute('data-wf') === ch.synth.waveform);
    }
    $('btn-filter-type').textContent = 'TYPE: ' + (ch.synth.filterType || 'lowpass').toUpperCase();
    $('synth-cutoff').value = String(ch.synth.cutoff || 3800);
    $('synth-cutoff-val').textContent = (ch.synth.cutoff || 3800) + 'Hz';
    $('synth-attack').value = String(ch.synth.attack || 10);
    $('synth-attack-val').textContent = (ch.synth.attack || 10) + 'ms';
    $('synth-decay').value = String(ch.synth.decay || 180);
    $('synth-decay-val').textContent = (ch.synth.decay || 180) + 'ms';
    $('synth-sustain').value = String(ch.synth.sustain !== undefined ? ch.synth.sustain : 65);
    $('synth-sustain-val').textContent = (ch.synth.sustain !== undefined ? ch.synth.sustain : 65) + '%';
    $('synth-release').value = String(ch.synth.release || 220);
    $('synth-release-val').textContent = (ch.synth.release || 220) + 'ms';
    $('modal-synth').classList.remove('hidden');
  }

  function openSettingsModal() {
    $('set-latency').value = state.settings.latencyPreset || 'balanced';
    $('set-samplerate').value = String(state.settings.sampleRate || 44100);
    $('set-profile-name').value = (state.session && state.session.displayName) || 'Producer';
    applyThemeAndPerformance();
    $('modal-settings').classList.remove('hidden');
  }

  function initStudioEvents() {
    Audio.spectrumCanvas = $('spectrum-canvas');
    Audio.projectGetter = function () { return state.activeProject; };
    Audio.onTickCallback = updatePlayheadHighlights;

    $('btn-studio-home').addEventListener('click', function () {
      persistActiveProject(true);
      switchPage('home');
    });
    $('btn-studio-settings').addEventListener('click', openSettingsModal);

    $('btn-play').addEventListener('click', function () {
      if (Audio.isPlaying) {
        Audio.pause();
        $('btn-play').textContent = 'PLAY';
        $('btn-play').classList.remove('active');
      } else {
        Audio.play();
        $('btn-play').textContent = 'PAUSE';
        $('btn-play').classList.add('active');
      }
    });

    $('btn-stop').addEventListener('click', function () {
      Audio.stop();
      $('btn-play').textContent = 'PLAY';
      $('btn-play').classList.remove('active');
    });

    $('btn-record').addEventListener('click', function () {
      state.recordArmed = !state.recordArmed;
      this.classList.toggle('active', state.recordArmed);
      showToast(state.recordArmed ? 'Record Armed: Tap Piano/MPC pads to record' : 'Record Disarmed');
    });

    $('btn-mode').addEventListener('click', function () {
      Audio.mode = Audio.mode === 'PAT' ? 'SONG' : 'PAT';
      this.textContent = Audio.mode;
      updatePlayheadHighlights(Audio.currentBar, Audio.currentStep);
    });

    $('btn-bpm-dec').addEventListener('click', function () {
      if (!state.activeProject) return;
      state.activeProject.bpm = Math.max(60, state.activeProject.bpm - 2);
      $('bpm-val').textContent = String(state.activeProject.bpm);
    });
    $('btn-bpm-inc').addEventListener('click', function () {
      if (!state.activeProject) return;
      state.activeProject.bpm = Math.min(220, state.activeProject.bpm + 2);
      $('bpm-val').textContent = String(state.activeProject.bpm);
    });

    $('btn-metro').addEventListener('click', function () {
      Audio.metronome = !Audio.metronome;
      this.classList.toggle('active', Audio.metronome);
    });

    $('btn-undo').addEventListener('click', function () {
      if (!state.undoStack.length) {
        showToast('Nothing to undo');
        return;
      }
      state.activeProject = state.undoStack.pop();
      renderStudioAll();
      showToast('Undid last edit');
    });

    $('btn-save-hyper').addEventListener('click', function () {
      persistActiveProject(false);
    });

    // Bottom Workspace Tabs
    var tabBtns = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var targetWs = btn.getAttribute('data-ws');
          state.activeWorkspace = targetWs;
          for (var j = 0; j < tabBtns.length; j++) {
            tabBtns[j].classList.toggle('active', tabBtns[j] === btn);
          }
          var allWs = document.querySelectorAll('.workspace');
          for (var k = 0; k < allWs.length; k++) {
            allWs[k].classList.toggle('active', allWs[k].id === targetWs);
          }
        });
      })(tabBtns[i]);
    }

    // Playlist Clear
    $('btn-playlist-clear').addEventListener('click', function () {
      if (!state.activeProject) return;
      pushUndoSnapshot();
      state.activeProject.playlist = [];
      renderPlaylist();
    });

    // Swing Slider
    $('rack-swing').addEventListener('input', function () {
      if (!state.activeProject) return;
      state.activeProject.swing = Number(this.value);
      $('swing-label').textContent = 'SWING ' + this.value + '%';
    });

    // Piano Roll Controls
    $('piano-channel-select').addEventListener('change', function () {
      state.pianoChannelId = this.value;
      renderPianoRoll();
    });
    $('piano-scale-select').addEventListener('change', function () {
      state.pianoScale = this.value;
      renderPianoRoll();
    });
    $('btn-piano-lock').addEventListener('click', function () {
      state.pianoScaleLock = !state.pianoScaleLock;
      this.textContent = 'SCALE LOCK: ' + (state.pianoScaleLock ? 'ON' : 'OFF');
      this.classList.toggle('active', state.pianoScaleLock);
    });
    $('piano-velocity-slider').addEventListener('input', function () {
      state.pianoVelocity = Number(this.value) / 100;
      $('piano-velocity-val').textContent = this.value + '%';
    });

    $('btn-piano-strum').addEventListener('click', function () {
      var pat = getActivePattern();
      if (!pat || !pat.pianoNotes || !pat.pianoNotes[state.pianoChannelId]) return;
      pushUndoSnapshot();
      var list = pat.pianoNotes[state.pianoChannelId];
      var groups = {};
      for (var i = 0; i < list.length; i++) {
        var k = String(list[i].step);
        if (!groups[k]) groups[k] = [];
        groups[k].push(list[i]);
      }
      Object.keys(groups).forEach(function (k) {
        groups[k].sort(function (a, b) { return a.midi - b.midi; });
        for (var j = 0; j < groups[k].length; j++) {
          groups[k][j].micro = Math.min(0.42, j * 0.14);
        }
      });
      showToast('Applied Strum chord offset');
    });

    $('btn-piano-humanize').addEventListener('click', function () {
      var pat = getActivePattern();
      if (!pat || !pat.pianoNotes || !pat.pianoNotes[state.pianoChannelId]) return;
      pushUndoSnapshot();
      var list = pat.pianoNotes[state.pianoChannelId];
      for (var i = 0; i < list.length; i++) {
        list[i].micro = (Math.random() - 0.5) * 0.24;
        list[i].vel = Math.max(0.4, Math.min(1, (list[i].vel || 0.85) + (Math.random() - 0.5) * 0.18));
      }
      showToast('Humanized timing & velocity');
    });

    $('btn-piano-arp').addEventListener('click', function () {
      var pat = getActivePattern();
      if (!pat || !pat.pianoNotes || !pat.pianoNotes[state.pianoChannelId]) return;
      var list = pat.pianoNotes[state.pianoChannelId];
      if (!list.length) return;
      pushUndoSnapshot();
      var pitches = [];
      for (var i = 0; i < list.length; i++) {
        if (pitches.indexOf(list[i].midi) < 0) pitches.push(list[i].midi);
      }
      pitches.sort(function (a, b) { return a - b; });
      var out = [];
      for (var s = 0; s < 16; s += 2) {
        var note = pitches[(s / 2) % pitches.length];
        out.push({ id: 'arp_' + s, midi: note, step: s, len: 1, vel: 0.86 });
      }
      pat.pianoNotes[state.pianoChannelId] = out;
      renderPianoRoll();
      showToast('Generated Arpeggiator sequence');
    });

    $('btn-piano-clear').addEventListener('click', function () {
      var pat = getActivePattern();
      if (!pat) return;
      pushUndoSnapshot();
      if (pat.pianoNotes) pat.pianoNotes[state.pianoChannelId] = [];
      renderPianoRoll();
    });

    // Export .wav & .hyper
    function doBounce(bits) {
      if (!state.activeProject) return;
      $('export-status').textContent = 'Rendering ' + bits + '-bit .wav offline...';
      Audio.renderProjectToWavBlob(state.activeProject, bits).then(function (blob) {
        var fname = state.activeProject.name.replace(/[^A-Za-z0-9_\-]/g, '_') + '_' + bits + 'bit.wav';
        exportFileDownload(fname, blob, true);
        $('export-status').textContent = 'Exported ' + fname;
        showToast('Bounced ' + fname);
      }, function (err) {
        $('export-status').textContent = 'Error: ' + err.message;
      });
    }

    $('btn-bounce-wav16').addEventListener('click', function () { doBounce(16); });
    $('btn-bounce-wav24').addEventListener('click', function () { doBounce(24); });
    $('btn-export-hyper').addEventListener('click', function () {
      if (!state.activeProject) return;
      var fname = state.activeProject.name.replace(/[^A-Za-z0-9_\-]/g, '_') + '.hyper';
      exportFileDownload(fname, JSON.stringify(state.activeProject, null, 2), false);
      showToast('Exported ' + fname);
    });
    $('btn-import-hyper-studio').addEventListener('click', function () {
      $('file-import-hyper').click();
    });

    $('btn-upload-stem-audio').addEventListener('click', function () {
      $('file-upload-audio').click();
    });
  }

  function initModalsAndFiles() {
    var closeBtns = document.querySelectorAll('[data-close]');
    for (var i = 0; i < closeBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          $(btn.getAttribute('data-close')).classList.add('hidden');
        });
      })(closeBtns[i]);
    }

    // Synth Modal Events
    var wfBtns = $('synth-waveform-row').querySelectorAll('button');
    for (var w = 0; w < wfBtns.length; w++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var ch = findChannel(state.editingSynthChId);
          if (!ch || !ch.synth) return;
          ch.synth.waveform = btn.getAttribute('data-wf');
          openSynthModal(ch.id);
        });
      })(wfBtns[w]);
    }

    $('btn-filter-type').addEventListener('click', function () {
      var ch = findChannel(state.editingSynthChId);
      if (!ch || !ch.synth) return;
      ch.synth.filterType = ch.synth.filterType === 'lowpass' ? 'highpass' : 'lowpass';
      this.textContent = 'TYPE: ' + ch.synth.filterType.toUpperCase();
    });

    function bindSynthRange(id, prop, suffix, valId) {
      $(id).addEventListener('input', function () {
        var ch = findChannel(state.editingSynthChId);
        if (!ch || !ch.synth) return;
        ch.synth[prop] = Number(this.value);
        $(valId).textContent = this.value + suffix;
      });
    }
    bindSynthRange('synth-cutoff', 'cutoff', 'Hz', 'synth-cutoff-val');
    bindSynthRange('synth-attack', 'attack', 'ms', 'synth-attack-val');
    bindSynthRange('synth-decay', 'decay', 'ms', 'synth-decay-val');
    bindSynthRange('synth-sustain', 'sustain', '%', 'synth-sustain-val');
    bindSynthRange('synth-release', 'release', 'ms', 'synth-release-val');

    $('btn-synth-audition').addEventListener('click', function () {
      var ch = findChannel(state.editingSynthChId);
      if (ch) Audio.triggerChannelHit(ch, 60, 0.9, 0.35);
    });

    // Settings Modal
    $('set-theme-black').addEventListener('click', function () {
      state.settings.theme = 'black';
      Storage.saveSettings(state.settings);
      applyThemeAndPerformance();
      Audio.clearSpectrumCanvas();
    });
    $('set-theme-light').addEventListener('click', function () {
      state.settings.theme = 'light';
      Storage.saveSettings(state.settings);
      applyThemeAndPerformance();
      Audio.clearSpectrumCanvas();
    });
    $('set-latency').addEventListener('change', function () {
      state.settings.latencyPreset = this.value;
      Storage.saveSettings(state.settings);
      Audio.applySettings(state.settings);
      showToast('Buffer mode: ' + this.value.toUpperCase());
    });
    $('set-samplerate').addEventListener('change', function () {
      state.settings.sampleRate = Number(this.value);
      Storage.saveSettings(state.settings);
      Audio.applySettings(state.settings);
    });
    $('set-low-ram').addEventListener('click', function () {
      state.settings.lowRamMode = !state.settings.lowRamMode;
      Storage.saveSettings(state.settings);
      applyThemeAndPerformance();
    });
    $('btn-save-profile-name').addEventListener('click', function () {
      var nextName = ($('set-profile-name').value || '').trim();
      if (!nextName || !state.session) return;
      state.session.displayName = nextName;
      Storage.saveSession(state.session);
      if (state.page === 'home') renderHome();
      showToast('Updated profile name');
    });
    $('btn-clear-cache').addEventListener('click', function () {
      Storage.clearAllCache();
      state.projects = Storage.getProjects();
      state.collaborators = Storage.getCollaborators();
      state.sharedProjects = Storage.getSharedProjects();
      if (state.page === 'home') renderHome();
      showToast('Reset local cache to default demo templates');
    });
    $('btn-sign-out').addEventListener('click', function () {
      Audio.stop();
      Storage.clearSession();
      state.session = null;
      $('modal-settings').classList.add('hidden');
      switchPage('signin');
    });

    // File Imports
    $('file-import-hyper').addEventListener('change', function () {
      var file = this.files && this.files[0];
      this.value = '';
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(reader.result);
          if (!parsed.patterns || !parsed.channels) throw new Error('Invalid .hyper schema');
          parsed.id = 'hyper_' + Date.now();
          state.projects.unshift(parsed);
          Storage.saveProjects(state.projects);
          if (state.page === 'studio') openProjectInStudio(parsed.id);
          else renderHome();
          showToast('Imported ' + (parsed.name || file.name));
        } catch (err) {
          showToast('Invalid .hyper file');
        }
      };
      reader.readAsText(file);
    });

    $('file-upload-audio').addEventListener('change', function () {
      var file = this.files && this.files[0];
      this.value = '';
      if (!file) return;
      $('stem-source-status').textContent = 'Processing ' + file.name + ' into 4 frequency-band stems...';
      var reader = new FileReader();
      reader.onload = function () {
        Audio.processAudioFileToStems(reader.result).then(function (previews) {
          state.stemsPreviewWaveforms = previews;
          $('stem-source-status').textContent = 'Isolated Stems Ready: ' + file.name;
          renderStemList();
          showToast('4 Stems Isolated');
        }, function (err) {
          $('stem-source-status').textContent = err.message;
        });
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function findChannel(chId) {
    if (!state.activeProject) return null;
    for (var i = 0; i < state.activeProject.channels.length; i++) {
      if (state.activeProject.channels[i].id === chId) return state.activeProject.channels[i];
    }
    return null;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  global.__hsHandleBack = function () {
    var modals = ['modal-synth', 'modal-invite', 'modal-settings'];
    for (var i = 0; i < modals.length; i++) {
      var m = $(modals[i]);
      if (m && !m.classList.contains('hidden')) {
        m.classList.add('hidden');
        return true;
      }
    }
    if (state.page === 'studio') {
      persistActiveProject(true);
      switchPage('home');
      return true;
    }
    return false;
  };

  function boot() {
    applyThemeAndPerformance();
    initSignIn();
    initHome();
    initStudioEvents();
    initModalsAndFiles();

    var savedSession = Storage.getSession();
    if (savedSession) {
      state.session = savedSession;
      switchPage('home');
    } else {
      switchPage('signin');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
