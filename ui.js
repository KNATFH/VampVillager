// Arayüz ve online oyun akışı.
// Oda sahibinin tarayıcısı oyunu yönetir (motor + botlar + süreler) ve durumu Firebase'e yazar.
// Herkes (oda sahibi dahil) ekranını Firebase'deki durumdan çizer, seçimlerini "input" altına yazar.
(function () {
  'use strict';
  const { VampGame, BotBrain, ROLES, MIN_PLAYERS, MAX_PLAYERS, t, setLang, getLang, applyStatic, LANGS, net } = window.VV;

  // Süreler (saniye). Hayatta insan kalmadıysa izleyenler beklemesin diye kısalır.
  const TIME = { role: 4, firstDay: 10, night: 20, morning: 6, vote: 16, tie: 3, trial: 16, verdict: 4 };
  const TIME_DEAD = { night: 6, vote: 8, trial: 8 };
  const MAX_TIES = 2;   // üst üste bu kadar eşitlik olursa gece olur
  const QUIET_DAYS = 3; // bu kadar gün kimse ölmezse oyun berabere biter

  const AVATAR = '<svg viewBox="0 0 40 40"><rect width="40" height="40" fill="#c4c8cf"/><circle cx="20" cy="15.5" r="7" fill="#fff"/><path d="M5 40c0-9 6.500-15 15-15s15 6 15 15z" fill="#fff"/></svg>';
  const ICONS = {
    vampire: '<svg viewBox="0 0 24 24"><path d="M3 4h18v4l-3.200.6L15.500 21 13 9h-2L8.500 21 6.200 8.600 3 8z"/></svg>',
    doctor: '<svg viewBox="0 0 24 24"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>',
    villager: '<svg viewBox="0 0 24 24"><path d="M3 11.500L12 3l9 8.500V21h-6v-6H9v6H3z"/></svg>'
  };
  const CLOSE = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  const $ = id => document.getElementById(id);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'onclick') el.addEventListener('click', v);
      else if (k === 'html') el.innerHTML = v; // yalnızca sabit SVG'ler için
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    kids.forEach(kid => { if (kid != null) el.append(kid); });
    return el;
  }

  // Profil resmi varsa onu, yoksa boş profili gösterir
  function fillAvatar(el, src) {
    if (typeof src === 'string' && src.startsWith('data:image/')) el.replaceChildren(h('img', { src, alt: '' }));
    else el.innerHTML = AVATAR;
    return el;
  }
  const avatar = src => fillAvatar(h('span', { class: 'avatar' }), src);
  const avatarOf = id => (room ? room.avatars[id] : null);

  // Seçilen resmi ortadan kare kırpıp küçültür
  function fileToAvatar(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const size = 96;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const m = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function show(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + screen));
    if (screen !== 'game') document.body.dataset.time = 'night';
  }

  function overlay(...kids) {
    $('overlay-card').replaceChildren(...kids.filter(k => k != null));
    $('overlay').hidden = false;
  }
  function closeOverlay() { $('overlay').hidden = true; }

  // ================= Hesap =================
  let authMode = 'login';

  function renderAuth() {
    const reg = authMode === 'register';
    $('auth-title').textContent = t(reg ? 'auth.register' : 'auth.login');
    $('auth-submit').textContent = t(reg ? 'auth.register' : 'auth.login');
    $('auth-toggle').textContent = t(reg ? 'auth.toLogin' : 'auth.toRegister');
    $('auth-pass').autocomplete = reg ? 'new-password' : 'current-password';
    if (!net.ok) {
      $('auth-error').textContent = t('err.config');
      $('auth-submit').disabled = true;
    }
  }

  function errorText(e) {
    const map = {
      'vv/bad-name': 'err.name',
      'auth/email-already-in-use': 'err.taken',
      'auth/invalid-credential': 'err.wrong', 'auth/wrong-password': 'err.wrong', 'auth/user-not-found': 'err.wrong',
      'auth/invalid-login-credentials': 'err.wrong',
      'auth/weak-password': 'err.weak',
      'auth/network-request-failed': 'err.network',
      'auth/operation-not-allowed': 'err.disabled'
    };
    return t(map[e && e.code] || 'err.unknown');
  }

  async function submitAuth(e) {
    e.preventDefault();
    if (!net.ok) return;
    const btn = $('auth-submit');
    btn.disabled = true;
    $('auth-error').textContent = '';
    try {
      const name = $('auth-name').value, pass = $('auth-pass').value;
      if (authMode === 'register') await net.register(name, pass);
      else await net.login(name, pass);
      $('auth-pass').value = '';
    } catch (err) {
      $('auth-error').textContent = errorText(err);
    }
    btn.disabled = false;
  }

  function openSettings() {
    const logged = net.ok && net.uid();
    overlay(
      h('h2', null, t('settings.title')),
      h('div', { class: 'label' }, t('settings.language')),
      h('div', { class: 'seg' }, ...LANGS.map(l => h('button', {
        class: 'btn' + (l.id === getLang() ? ' primary' : ''), type: 'button', lang: l.id, // her dil kendi kuralıyla büyük harfe çevrilsin
        onclick: () => { setLang(l.id); renderAuth(); openSettings(); }
      }, l.name))),
      logged ? h('div', { class: 'label' }, t('settings.account')) : null,
      logged ? h('div', { class: 'account' }, avatar(net.avatar()), h('span', { class: 'nm' }, net.name())) : null,
      logged ? h('div', { class: 'seg' },
        h('button', { class: 'btn', type: 'button', onclick: () => $('avatar-file').click() }, t('settings.photo')),
        h('button', {
          class: 'btn', type: 'button', disabled: !net.avatar(),
          onclick: () => net.setAvatar(null).catch(() => { }).then(openSettings)
        }, t('settings.removePhoto'))
      ) : null,
      logged ? h('button', { class: 'btn', type: 'button', onclick: () => { closeOverlay(); net.logout(); } }, t('settings.logout')) : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: closeOverlay }, t('settings.close'))
    );
  }

  // ================= Oda =================
  // room: { code, ref, isHost, hostId, players, status, state, secret, inputs, onInput, subs }
  let room = null;
  let hostToken = 0; // değişince oda sahibinin oyun döngüsü durur

  const view = { gameId: null, seq: -1, pick: null, trialOpen: false };

  const sortedPlayers = () => Object.entries(room.players).sort((a, b) => a[1].t - b[1].t);

  async function createRoom() {
    $('room-error').textContent = '';
    try {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const uid = net.uid();
      let code, ref;
      for (let i = 0; i < 5; i++) {
        code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        ref = net.ref('rooms/' + code);
        if (!(await ref.child('host').get()).exists()) break;
      }
      await ref.set({ host: uid, status: 'lobby', players: { [uid]: { name: net.name(), t: Date.now(), avatar: net.avatar() } } });
      ref.onDisconnect().remove(); // oda sahibi koparsa oda kapanır
      attach(code, true);
    } catch (e) {
      $('room-error').textContent = t('err.network');
    }
  }

  async function joinRoom(e) {
    e.preventDefault();
    const code = $('input-code').value.trim().toUpperCase();
    if (!code) return;
    $('room-error').textContent = '';
    try {
      const uid = net.uid();
      const ref = net.ref('rooms/' + code);
      const [host, status, players] = await Promise.all(['host', 'status', 'players'].map(k => ref.child(k).get()));
      let err = null;
      if (!host.exists()) err = 'room.notFound';
      else if (status.val() !== 'lobby') err = 'room.started';
      else if (Object.keys(players.val() || {}).length >= MAX_PLAYERS) err = 'room.full';
      if (err) { $('room-error').textContent = t(err); return; }
      const mine = ref.child('players/' + uid);
      await mine.set({ name: net.name(), t: Date.now(), avatar: net.avatar() });
      mine.onDisconnect().remove();
      $('input-code').value = '';
      attach(code, false);
    } catch (e2) {
      $('room-error').textContent = t('err.network');
    }
  }

  function attach(code, isHost) {
    const ref = net.ref('rooms/' + code);
    const uid = net.uid();
    const r = room = { code, ref, isHost, hostId: null, players: {}, avatars: {}, status: null, state: null, secret: null, inputs: {}, onInput: null, subs: [] };
    const sub = (q, type, cb) => {
      const fn = s => { if (room === r) cb(s); };
      q.on(type, fn);
      r.subs.push(() => q.off(type, fn));
    };
    view.gameId = null; view.seq = -1;

    net.setRoom(code);
    // Moderatör oyunu sonlandırdıysa herkes odadan çıkar
    sub(ref.child('closed'), 'value', s => {
      if (!s.exists()) return;
      toast(t('room.modEnded'));
      leaveRoom(t('room.modEnded'));
    });
    sub(ref.child('host'), 'value', s => {
      r.hostId = s.val();
      if (!s.exists()) leaveRoom(t('room.closed'));
      else renderLobby();
    });
    sub(ref.child('players'), 'value', s => {
      r.players = s.val() || {};
      // Oyuncu koparsa bile resmi maç boyunca kalsın
      Object.keys(r.players).forEach(id => { if (r.players[id].avatar) r.avatars[id] = r.players[id].avatar; });
      renderLobby();
    });
    sub(ref.child('secret/' + uid), 'value', s => { r.secret = s.val(); onState(); });
    sub(ref.child('state'), 'value', s => { r.state = s.val(); onState(); });
    sub(ref.child('chat').limitToLast(60), 'child_added', s => {
      const m = s.val();
      if (m && m.text) chatLine('', h('b', null, String(m.name || '')), String(m.text));
    });
    if (isHost) {
      sub(ref.child('input'), 'value', s => { r.inputs = s.val() || {}; if (r.onInput) r.onInput(); });
    }
    sub(ref.child('status'), 'value', s => {
      r.status = s.val();
      if (r.status === 'lobby') {
        view.gameId = null; view.seq = -1;
        closeOverlay(); closeTrial();
        renderLobby();
        show('lobby');
      } else if (r.status === 'playing') {
        show('game');
        onState();
      }
    });
  }

  function leaveRoom(message) {
    const r = room;
    if (!r) return;
    room = null;
    hostToken++;
    net.setRoom(null);
    r.subs.forEach(off => off());
    try {
      const target = r.isHost ? r.ref : r.ref.child('players/' + net.uid());
      target.onDisconnect().cancel();
      Promise.resolve(target.remove()).catch(() => { });
    } catch (e) { /* zaten kopmuş olabilir */ }
    closeOverlay(); closeTrial();
    $('room-error').textContent = message || '';
    show('room');
  }

  function addBot() {
    if (!room || !room.isHost || Object.keys(room.players).length >= MAX_PLAYERS) return;
    let n = 1;
    while (room.players['bot' + n]) n++;
    room.ref.child('players/bot' + n).set({ name: 'Bot ' + n, bot: true, t: Date.now() });
  }

  function renderLobby() {
    const r = room;
    if (!r) return;
    const uid = net.uid();
    const list = sortedPlayers();
    $('room-code').textContent = r.code;
    $('lobby-list').replaceChildren(...list.map(([id, p]) => h('li', null,
      avatar(p.avatar),
      h('span', { class: 'nm' }, p.name),
      id === uid ? h('span', { class: 'tag' }, t('lobby.you'))
        : id === r.hostId ? h('span', { class: 'tag host' }, t('lobby.host'))
          : (r.isHost && p.bot) ? h('button', {
            class: 'icon-btn', type: 'button', html: CLOSE, 'aria-label': t('lobby.remove', { name: p.name }),
            onclick: () => r.ref.child('players/' + id).remove()
          }) : null
    )));
    $('lobby-count').textContent = list.length + ' / ' + MAX_PLAYERS;
    $('btn-add-bot').hidden = !r.isHost;
    $('btn-start').hidden = !r.isHost;
    $('lobby-wait').hidden = r.isHost;
    $('btn-add-bot').disabled = list.length >= MAX_PLAYERS;
    $('btn-start').disabled = list.length < MIN_PLAYERS;
  }

  // ================= Oda sahibi: oyunu yönetir =================
  class Cancelled extends Error { }

  async function hostStart() {
    const r = room;
    if (!r || !r.isHost) return;
    const list = sortedPlayers().map(([id, p]) => ({ id, name: p.name, isBot: !!p.bot }));
    if (list.length < MIN_PLAYERS) return;

    const token = ++hostToken;
    const sleep = ms => new Promise((res, rej) => setTimeout(() => (token === hostToken ? res() : rej(new Cancelled())), ms));

    const g = new VampGame(list);
    g.assignRoles();
    const brain = new BotBrain(g);
    const gameId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const humans = () => g.players.filter(p => !p.isBot);
    const bots = () => g.alive().filter(p => p.isBot);
    const dur = key => (!humans().some(p => p.alive) && TIME_DEAD[key]) || TIME[key];

    let seq = 0;
    let cur = {};

    // Herkese açık durum. Roller yalnızca ölünce ya da oyun bitince görünür.
    function publish() {
      const over = cur.phase === 'over';
      const players = {};
      g.players.forEach((p, i) => {
        players[p.id] = { name: p.name, alive: p.alive, order: i, role: (!p.alive || over) ? p.role : null };
      });
      const inTrial = cur.phase === 'trial' || cur.phase === 'verdict';
      const state = Object.assign({
        gameId, seq, day: g.day, players,
        votes: (cur.phase === 'vote' || cur.phase === 'tie' || inTrial) ? Object.assign({}, g.votes) : null,
        accused: inTrial ? g.accused : null,
        lastSpared: g.lastSpared || null,
        winner: over ? g.winner : null
      }, cur);
      Promise.resolve(r.ref.child('state').set(state)).catch(() => { });
    }

    async function phase(name, sec, extra, onTick) {
      seq++;
      const ms = sec * 1000;
      cur = Object.assign({ phase: name, dur: ms, endsAt: net.now() + ms }, extra);
      publish();
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (onTick) onTick(Date.now() - start);
        await sleep(100);
      }
    }

    // Oyuncunun bu aşama için yazdığı seçim
    const inputOf = id => {
      const inp = r.inputs[id];
      return inp && inp.seq === seq ? (inp.v || null) : null;
    };

    try {
      const secret = {};
      humans().forEach(p => { secret[p.id] = { role: p.role, gameId }; });
      // Bütün roller: yalnızca kontrol paneli okuyabilir
      const roles = {};
      g.players.forEach(p => { roles[p.id] = p.role; });
      await r.ref.update({ status: 'playing', state: null, input: null, chat: null, secret, roles });

      await phase('role', TIME.role);
      await phase('firstDay', TIME.firstDay);

      let quiet = 0;
      while (true) {
        const aliveBefore = g.alive().length;

        // ---- Gece ----
        g.startNight();
        bots().forEach(b => { const v = brain.nightAction(b); if (v) g.setNightAction(b.id, v); });
        await phase('night', dur('night'));
        humans().forEach(p => { const v = inputOf(p.id); if (v) g.setNightAction(p.id, v); });
        const night = g.resolveNight();
        brain.onNight(night);
        const nightWin = g.checkWin();
        await phase('morning', nightWin ? TIME.verdict : TIME.morning, { morning: { died: night.died || null } });
        if (nightWin) break;

        // ---- Gündüz: oylama -> kürsü ----
        let ties = 0;
        while (true) {
          g.startVote();
          const total = dur('vote') * 1000;
          const queue = bots().map(b => ({ bot: b, at: 600 + Math.random() * (total - 1400) })).sort((a, b) => a.at - b.at);
          const applyVotes = () => {
            let changed = false;
            humans().filter(p => p.alive).forEach(p => {
              const inp = r.inputs[p.id];
              if (!inp || inp.seq !== seq) return;
              const v = inp.v || null;
              if ((g.votes[p.id] || null) === v) return;
              if (v) changed = g.castVote(p.id, v) || changed;
              else { delete g.votes[p.id]; changed = true; }
            });
            return changed;
          };
          r.onInput = () => { if (applyVotes()) publish(); };
          await phase('vote', dur('vote'), null, elapsed => {
            let changed = false;
            while (queue.length && queue[0].at <= elapsed) {
              const b = queue.shift().bot;
              g.castVote(b.id, brain.vote(b));
              changed = true;
            }
            if (changed) publish();
          });
          r.onInput = null;
          applyVotes();
          queue.forEach(q => g.castVote(q.bot.id, brain.vote(q.bot)));
          const vote = g.resolveVote();
          brain.onVote(vote);
          if (vote.tie) {
            // Eşitlik: oylama iptal, kısa bekleme. Üst üste ikinci eşitlikte gece olur.
            ties++;
            await phase('tie', TIME.tie);
            if (ties >= MAX_TIES) break;
            continue;
          }
          ties = 0;
          if (!vote.accused) break;

          g.startTrial();
          bots().filter(b => b.id !== g.accused).forEach(b => g.castTrial(b.id, brain.trial(b)));
          await phase('trial', dur('trial'));
          humans().forEach(p => { const v = inputOf(p.id); if (v) g.castTrial(p.id, v); });
          const res = g.resolveTrial();
          brain.onTrial(res);
          g.checkWin();
          await phase('verdict', TIME.verdict, { verdict: { executed: res.executed, kill: res.kill, spare: res.spare } });
          if (res.nightFalls) break;
        }
        if (g.winner) break;

        // Kimse ölmeden geçen günler
        quiet = g.alive().length === aliveBefore ? quiet + 1 : 0;
        if (quiet >= QUIET_DAYS) { g.winner = 'draw'; break; }
      }

      seq++;
      cur = { phase: 'over' };
      publish();
    } catch (e) {
      r.onInput = null;
      if (!(e instanceof Cancelled)) throw e; // Cancelled: oda kapandı ya da lobiye dönüldü
    }
  }

  function hostToLobby() {
    if (!room || !room.isHost) return;
    hostToken++;
    room.ref.update({ status: 'lobby', state: null });
  }

  // ================= Oyun ekranı =================
  const myRole = () => (room && room.secret ? room.secret.role : null);
  const meIn = s => (s.players || {})[net.uid()];
  const nameIn = (s, id) => ((s.players || {})[id] || {}).name || '';

  function setTime(time) { document.body.dataset.time = time; }

  function setPhase(title, sub) {
    $('phase-title').textContent = title;
    $('phase-sub').textContent = sub || '';
  }

  // Gece-gündüz geçişinde ekranın ortasında kısa bir başlık
  function splash(text) {
    const el = $('splash');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  function chatLine(cls, ...kids) {
    const list = $('chat-list');
    list.append(h('li', { class: cls }, ...kids));
    list.scrollTop = list.scrollHeight;
  }
  const sys = (text, cls) => chatLine('sys' + (cls ? ' ' + cls : ''), text);
  const divider = text => chatLine('div', text);

  function chatAllowed() {
    const s = room && room.state;
    if (!s) return false;
    if (s.phase === 'over') return true;
    const me = meIn(s);
    return !!(me && me.alive) && s.phase !== 'night';
  }

  function updateChatState() {
    const s = room && room.state;
    if (!s) return;
    const ok = chatAllowed();
    const me = meIn(s);
    $('chat-input').disabled = !ok;
    $('chat-input').placeholder = t(ok ? 'chat.placeholder' : (me && me.alive ? 'chat.night' : 'chat.dead'));
    $('chat-form').querySelector('button').disabled = !ok;
  }

  function sendChat(e) {
    e.preventDefault();
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text || !chatAllowed()) return;
    room.ref.child('chat').push({ uid: net.uid(), name: net.name(), text, t: Date.now() });
    input.value = '';
  }

  function sendInput(v) {
    if (!room || !room.state) return;
    room.ref.child('input/' + net.uid()).set({ seq: room.state.seq, v: v || null });
  }

  function closeTrial() {
    view.trialOpen = false;
    $('trial').hidden = true;
    $('chat-home').append($('chat'));
    const list = $('chat-list');
    list.scrollTop = list.scrollHeight;
  }

  function openTrial(s) {
    const mine = s.accused === net.uid();
    const me = meIn(s);
    const canVote = s.phase === 'trial' && !!(me && me.alive) && !mine;
    fillAvatar($('trial-avatar'), avatarOf(s.accused));
    $('trial-name').textContent = nameIn(s, s.accused);
    $('trial-sub').textContent = mine && s.phase === 'trial' ? t('trial.defend') : '';
    $('trial-actions').hidden = !canVote;
    $('trial-actions').classList.remove('chosen');
    $('btn-kill').classList.remove('on');
    $('btn-spare').classList.remove('on');
    $('trial-result').hidden = true;
    $('trial-chat-slot').append($('chat'));
    $('trial').hidden = false;
    $('chat-list').scrollTop = $('chat-list').scrollHeight;
    view.trialOpen = canVote;
  }

  function trialChoose(choice) {
    if (!view.trialOpen) return;
    sendInput(choice);
    $('trial-actions').classList.add('chosen');
    $('btn-kill').classList.toggle('on', choice === 'kill');
    $('btn-spare').classList.toggle('on', choice === 'spare');
  }

  function renderPlayers() {
    const s = room.state;
    const uid = net.uid();
    const votes = s.votes || {};
    const tally = {};
    Object.values(votes).forEach(v => { tally[v] = (tally[v] || 0) + 1; });
    const pick = view.pick;
    const list = Object.entries(s.players || {}).sort((a, b) => a[1].order - b[1].order);

    $('players').replaceChildren(...list.map(([id, p]) => {
      const selectable = !!pick && pick.ids.has(id);
      const selected = !!pick && pick.selected === id;
      const cls = ['pcard'];
      if (id === uid) cls.push('me');
      if (!p.alive) cls.push('dead');
      if (id === s.accused) cls.push('accused');
      if (selectable) cls.push('selectable');
      if (selected) cls.push('selected', pick.kind || '');

      let meta = '';
      if (selected) meta = pick.label;
      else if (p.role) meta = t('role.' + p.role);
      else if (votes[id]) meta = '→ ' + nameIn(s, votes[id]);
      else if (id === uid) meta = t('lobby.you');

      return h('button', {
        class: cls.join(' '), type: 'button', tabindex: selectable ? '0' : '-1',
        onclick: () => {
          if (!view.pick || !view.pick.ids.has(id)) return;
          // Seçili kişiye tekrar basınca seçim kalkar
          view.pick.selected = view.pick.selected === id ? null : id;
          sendInput(view.pick.selected);
          renderPlayers();
        }
      },
        h('span', { class: 'avatar-wrap' },
          avatar(avatarOf(id)),
          tally[id] ? h('span', { class: 'count' }, String(tally[id])) : null),
        h('span', { class: 'nm' }, p.name),
        h('span', { class: 'meta' }, meta)
      );
    }));
  }

  // Firebase'den yeni durum geldi
  function onState() {
    const r = room;
    if (!r || r.status !== 'playing' || !r.state || !r.state.players) return;
    const s = r.state;
    // Rolüm gelmeden çizme
    if (meIn(s) && (!r.secret || r.secret.gameId !== s.gameId)) return;

    if (view.gameId !== s.gameId) {
      view.gameId = s.gameId; view.seq = -1;
      $('chat-list').replaceChildren();
      $('chat-input').value = '';
      closeOverlay(); closeTrial();
      const role = myRole();
      const tag = $('my-role');
      tag.className = 'role-tag ' + (role || '');
      tag.replaceChildren(...(role ? [h('span', { html: ICONS[role] }), t('role.' + role)] : []));
    }
    if (view.seq !== s.seq) {
      view.seq = s.seq;
      enterPhase(s);
    }
    renderPlayers();
    updateChatState();
  }

  function enterPhase(s) {
    const uid = net.uid();
    const me = meIn(s);
    const alive = !!(me && me.alive);
    const role = myRole();
    const aliveIds = Object.keys(s.players).filter(id => s.players[id].alive);
    const dayTitle = t('phase.day', { n: s.day });
    const nightTitle = t('phase.night', { n: s.day });
    view.pick = null;
    view.trialOpen = false;

    switch (s.phase) {
      case 'role':
        setTime('day');
        setPhase(dayTitle);
        if (role) overlay(
          h('div', { class: 'label' }, t('role.yours')),
          h('div', { class: 'role-icon ' + role, html: ICONS[role] }),
          h('h2', null, t('role.' + role)),
          h('p', { class: 'sub' }, t('desc.' + role)),
          h('div', { class: 'timerbar' }, h('i', { class: 'js-fill' }))
        );
        break;

      case 'firstDay':
        closeOverlay();
        setTime('day');
        setPhase(dayTitle);
        divider(dayTitle);
        break;

      case 'night': {
        closeOverlay(); closeTrial();
        setTime('night');
        setPhase(nightTitle, alive && role ? t('night.' + role) : '');
        splash(nightTitle);
        divider(nightTitle);
        let ids = [];
        if (alive && role === ROLES.VAMPIRE) ids = aliveIds.filter(id => id !== uid);
        if (alive && role === ROLES.DOCTOR) ids = aliveIds;
        if (ids.length) {
          const vamp = role === ROLES.VAMPIRE;
          view.pick = { ids: new Set(ids), selected: null, label: t(vamp ? 'pick.target' : 'pick.protect'), kind: vamp ? '' : 'protect' };
        }
        break;
      }

      case 'morning': {
        closeOverlay(); closeTrial();
        setTime('day');
        const died = s.morning && s.morning.died;
        const text = died ? t('morning.killed', { name: nameIn(s, died) }) : t('morning.none');
        setPhase(dayTitle, text);
        splash(dayTitle);
        divider(dayTitle);
        if (died) sys(`${text}. ${t('role.' + s.players[died].role)}.`, 'blood');
        else sys(text + '.');
        break;
      }

      case 'vote':
        closeTrial();
        setTime('day');
        setPhase(dayTitle, t(alive ? 'vote.cast' : 'vote.watch'));
        if (alive) {
          view.pick = {
            ids: new Set(aliveIds.filter(id => id !== uid)),
            selected: null, label: t('pick.vote')
          };
        }
        break;

      case 'tie':
        closeTrial();
        setTime('day');
        setPhase(dayTitle, t('vote.tie'));
        sys(t('vote.tieLog'));
        break;

      case 'trial':
        setTime('day');
        setPhase(t('phase.trial'), nameIn(s, s.accused));
        sys(t('vote.accused', { name: nameIn(s, s.accused) }));
        openTrial(s);
        break;

      case 'verdict': {
        if ($('trial').hidden) openTrial(s);
        const v = s.verdict || {};
        const a = s.players[s.accused] || {};
        const roleName = a.role ? t('role.' + a.role) : '';
        $('trial-actions').hidden = true;
        $('trial-verdict').textContent = t(v.executed ? 'trial.executed' : 'trial.spared');
        $('trial-verdict').className = 'trial-verdict' + (v.executed ? ' kill' : '');
        $('trial-sub').textContent = v.executed ? roleName : '';
        $('trial-counts').textContent = `${t('trial.kill')} ${v.kill || 0}  ·  ${t('trial.spare')} ${v.spare || 0}`;
        $('trial-result').hidden = false;
        if (v.executed) sys(t('trial.executedLog', { name: a.name, role: roleName }), 'blood');
        else sys(t('trial.sparedLog', { name: a.name }));
        break;
      }

      case 'over':
        if (me) net.bumpGames();
        closeTrial();
        gameOver(s);
        break;
    }
  }

  function gameOver(s) {
    const draw = s.winner === 'draw';
    const vampWon = s.winner === 'vampire';
    const role = myRole();
    const iWon = (role === ROLES.VAMPIRE) === vampWon;
    const title = t(draw ? 'over.draw' : vampWon ? 'over.vampire' : 'over.villagers');
    const list = Object.entries(s.players).sort((a, b) => a[1].order - b[1].order);
    setTime('day');
    setPhase(title);
    divider(title);
    overlay(
      h('div', { class: 'role-icon ' + (vampWon ? 'vampire' : 'villager'), html: ICONS[vampWon ? 'vampire' : 'villager'] }),
      h('h2', null, title),
      draw ? h('div', { class: 'outcome lose' }, t('over.drawSub', { n: QUIET_DAYS })) : null,
      role && !draw ? h('div', { class: 'outcome' + (iWon ? '' : ' lose') }, t(iWon ? 'over.win' : 'over.lose')) : null,
      h('ul', { class: 'role-list' }, ...list.map(([id, p]) => h('li', { class: p.alive ? '' : 'dead' },
        avatar(avatarOf(id)),
        h('span', { class: 'nm' }, p.name),
        h('span', { class: 'rl ' + p.role }, t('role.' + p.role))
      ))),
      room.isHost ? h('button', { class: 'btn primary', type: 'button', onclick: hostStart }, t('over.again')) : null,
      room.isHost ? h('button', { class: 'btn', type: 'button', onclick: hostToLobby }, t('over.lobby')) : null,
      room.isHost ? null : h('div', { class: 'wait' }, t('lobby.waiting')),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => leaveRoom() }, t('over.leave'))
    );
  }

  // Geri sayım: süre Firebase'deki bitiş zamanından hesaplanır, herkeste aynı görünür
  setInterval(() => {
    const s = room && room.status === 'playing' && room.state;
    const left = s && s.endsAt ? s.endsAt - net.now() : 0;
    const on = left > 0;
    const sec = Math.ceil(left / 1000);
    document.querySelectorAll('.js-timer').forEach(n => {
      const text = on ? String(sec) : '';
      if (n.textContent !== text) n.textContent = text;
      n.classList.toggle('low', on && sec <= 3);
    });
    document.querySelectorAll('.js-fill').forEach(f => {
      f.style.transform = `scaleX(${on ? Math.min(1, left / s.dur) : 0})`;
    });
  }, 100);

  // ================= Ban ve duyuru =================
  let toastTimer = null;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 12000);
  }

  // Banlıysa oyundan çıkarıp ban ekranını gösterir; ban bitince menüye döner
  function checkBan() {
    if (!net.uid()) return;
    const until = net.bannedUntil();
    const onBanScreen = $('screen-banned').classList.contains('active');
    if (until) {
      leaveRoom();
      closeOverlay();
      const date = until > 4e12 ? t('ban.permanent') : new Date(until).toLocaleString(getLang());
      $('ban-until').textContent = t('ban.until', { date });
      show('banned');
    } else if (onBanScreen) {
      show('menu');
    }
  }

  // ================= Bağlantılar =================
  net.onBan(checkBan);
  net.onAnnounce(a => { if (a && a.text && net.now() - a.t < 5 * 60 * 1000) toast(a.text); });
  setInterval(() => { if ($('screen-banned').classList.contains('active')) checkBan(); }, 15000);
  $('ban-logout').addEventListener('click', () => net.logout());
  applyStatic();
  renderAuth();
  $('emblem').innerHTML = ICONS.vampire;
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-settings-auth').addEventListener('click', openSettings);
  $('auth-form').addEventListener('submit', submitAuth);
  $('avatar-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { await net.setAvatar(await fileToAvatar(file)); } catch (err) { /* resim okunamadı */ }
    if (!$('overlay').hidden) openSettings();
  });
  $('auth-toggle').addEventListener('click', () => {
    authMode = authMode === 'login' ? 'register' : 'login';
    $('auth-error').textContent = '';
    renderAuth();
  });
  $('btn-play').addEventListener('click', () => { $('room-error').textContent = ''; show('room'); });
  $('btn-room-back').addEventListener('click', () => show('menu'));
  $('btn-create').addEventListener('click', createRoom);
  $('join-form').addEventListener('submit', joinRoom);
  $('btn-add-bot').addEventListener('click', addBot);
  $('btn-lobby-back').addEventListener('click', () => leaveRoom());
  $('btn-start').addEventListener('click', hostStart);
  $('btn-kill').addEventListener('click', () => trialChoose('kill'));
  $('btn-spare').addEventListener('click', () => trialChoose('spare'));
  $('chat-form').addEventListener('submit', sendChat);
  $('btn-quit').addEventListener('click', () => {
    const over = room && room.state && room.state.phase === 'over';
    if (over || confirm(t('quit.confirm'))) leaveRoom();
  });

  if (net.ok) {
    net.onAuth(user => {
      if (user) {
        net.loadProfile().catch(() => { });
        if (!room) show(net.bannedUntil() ? 'banned' : 'menu');
        checkBan();
      } else {
        leaveRoom();
        closeOverlay();
        show('auth');
      }
    });
  } else {
    show('auth');
  }
})();
