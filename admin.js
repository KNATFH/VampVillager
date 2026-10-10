// Kontrol paneli. Yetki, Firebase veritabanı kurallarıyla (yalnızca yönetici e-postası) korunur;
// bu sayfa sadece arayüzdür. Parola hiçbir dosyada durmaz, Firebase Auth'ta saklanır.
(function () {
  'use strict';
  const fb = window.firebase;
  const cfg = window.VV_FIREBASE_CONFIG;
  const $ = id => document.getElementById(id);

  if (!fb || !(cfg || fb.isMock)) {
    $('login-error').textContent = 'Firebase ayarı eksik.';
    $('login-btn').disabled = true;
    return;
  }

  // Oyundaki oturumdan ayrı bir bağlantı; oturum saklanmaz, her açılışta parola istenir
  const app = fb.initializeApp(cfg || {}, 'admin');
  const auth = fb.auth(app);
  const db = fb.database(app);
  const noPersist = fb.auth.Auth ? auth.setPersistence(fb.auth.Auth.Persistence.NONE) : Promise.resolve();

  const AVATAR = '<svg viewBox="0 0 40 40"><rect width="40" height="40" fill="#c4c8cf"/><circle cx="20" cy="15.5" r="7" fill="#fff"/><path d="M5 40c0-9 6.500-15 15-15s15 6 15 15z" fill="#fff"/></svg>';
  const ROLE = { vampire: 'Vampir', doctor: 'Doktor', villager: 'Köylü' };
  const PHASE = {
    role: 'Roller dağıtılıyor', firstDay: 'İlk gün', night: 'Gece', morning: 'Sabah', vote: 'Oylama',
    tie: 'Oylar eşit', trial: 'Kürsü', verdict: 'Karar', over: 'Bitti'
  };
  const BAN_OPTIONS = [
    ['1 saat', 3600e3], ['1 gün', 86400e3], ['7 gün', 7 * 86400e3], ['30 gün', 30 * 86400e3], ['Süresiz', 0]
  ];
  const FOREVER = 4102444800000; // 2100 yılı

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'onclick') el.addEventListener('click', v);
      else if (k === 'html') el.innerHTML = v; // yalnızca sabit SVG
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    kids.forEach(kid => { if (kid != null) el.append(kid); });
    return el;
  }

  function avatar(src) {
    const el = h('span', { class: 'avatar' });
    if (typeof src === 'string' && src.startsWith('data:image/')) el.append(h('img', { src, alt: '' }));
    else el.innerHTML = AVATAR;
    return el;
  }

  const data = { users: {}, presence: {}, bans: {}, rooms: {}, announce: null };
  let offset = 0;
  let tab = 'users';
  let watching = null;
  let dirty = false;
  const now = () => Date.now() + offset;

  const fmtDate = ms => (ms ? new Date(ms).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '-');
  const banUntil = uid => (data.bans[uid] && data.bans[uid].until > now() ? data.bans[uid].until : 0);
  const fmtBan = until => (until >= FOREVER ? 'Süresiz' : fmtDate(until));

  // ================= Giriş =================
  async function login(e) {
    e.preventDefault();
    const btn = $('login-btn');
    btn.disabled = true;
    $('login-error').textContent = '';
    try {
      await noPersist;
      const email = $('email').value.trim();
      await auth.signInWithEmailAndPassword(email, $('pass').value);
      $('pass').value = '';
      try {
        await db.ref('presence').get(); // yalnızca yönetici okuyabilir
      } catch (err) {
        // Nedenini ayırt et: yeni kurallarda "announce" giriş yapan herkese açıktır
        let published = true;
        try { await db.ref('announce').get(); } catch (err2) { published = false; }
        await auth.signOut();
        throw { code: published ? 'vv/not-admin' : 'vv/old-rules' };
      }
      rememberEmail(email);
      start();
    } catch (err) {
      const code = err && err.code;
      $('login-error').textContent =
        code === 'vv/old-rules' ? 'Parola doğru ama yeni veritabanı kuralları yayınlanmamış. database.rules.local.json içeriğini Firebase > Realtime Database > Rules kısmına yapıştırıp Publish de.'
          : code === 'vv/not-admin' ? 'Parola doğru ama kurallar bu e-postayı yönetici saymıyor. Rules kısmına database.rules.local.json dosyasını yapıştırdığından emin ol (database.rules.json değil).'
          : code === 'auth/too-many-requests' ? 'Çok fazla deneme. Biraz sonra tekrar dene.'
            : code === 'auth/network-request-failed' ? 'Bağlantı hatası.'
              : 'E-posta veya parola yanlış.';
    }
    btn.disabled = false;
  }

  // E-posta yalnızca bu cihazda hatırlanır (herkese açık koda yazılmaz); sonraki girişlerde sadece parola sorulur
  const EMAIL_KEY = 'vv-admin-email';
  function savedEmail() { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch (e) { return ''; } }
  function rememberEmail(email) { try { localStorage.setItem(EMAIL_KEY, email); } catch (e) { /* önemli değil */ } }
  function showEmailField(on) {
    $('email').hidden = !on;
    $('email-change').hidden = on;
  }

  function start() {
    $('login').classList.remove('active');
    $('panel').hidden = false;
    db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
    ['users', 'presence', 'bans', 'rooms', 'announce'].forEach(key => {
      db.ref(key).on('value', s => {
        data[key] = s.val() || (key === 'announce' ? null : {});
        dirty = true;
      });
    });
    setInterval(tick, 250);
  }

  function logout() {
    auth.signOut().then(() => location.reload());
  }

  // ================= Pencere =================
  function modal(...kids) {
    $('modal-card').replaceChildren(...kids.filter(k => k != null));
    $('modal').hidden = false;
  }
  const closeModal = () => { $('modal').hidden = true; };

  function confirmBox(title, text, okLabel, onOk) {
    modal(
      h('h2', null, title),
      h('p', { class: 'sub' }, text),
      h('button', { class: 'btn primary', type: 'button', onclick: () => { closeModal(); onOk(); } }, okLabel),
      h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'Vazgeç')
    );
  }

  // ================= İşlemler =================
  function askBan(uid) {
    const name = (data.users[uid] || {}).name || uid;
    modal(
      h('h2', null, 'Banla'),
      h('p', { class: 'sub' }, name + ' ne kadar süre oynayamasın?'),
      h('div', { class: 'modal-grid' }, ...BAN_OPTIONS.map(([label, ms]) => h('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          closeModal();
          db.ref('bans/' + uid).set({ until: ms ? now() + ms : FOREVER, t: now() });
        }
      }, label))),
      h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'Vazgeç')
    );
  }

  const unban = uid => db.ref('bans/' + uid).remove();

  function removeAvatar(uid) {
    const name = (data.users[uid] || {}).name || uid;
    confirmBox('Resmi sil', name + ' adlı oyuncunun profil resmi silinsin mi?', 'Sil',
      () => db.ref('users/' + uid + '/avatar').remove());
  }

  // Oyunculara "moderatör sonlandırdı" yazısı gider, ardından oda silinir
  function endRoom(code) {
    confirmBox('Oyunu sonlandır', code + ' odası herkes için kapatılsın mı?', 'Sonlandır', () => {
      db.ref('rooms/' + code + '/closed').set('mod');
      setTimeout(() => db.ref('rooms/' + code).remove(), 4000);
    });
  }

  function sendAnnounce(e) {
    e.preventDefault();
    const text = $('announce-text').value.trim();
    if (!text) return;
    db.ref('announce').set({ text, t: now() });
    $('announce-text').value = '';
  }

  // ================= Çizim =================
  function statusOf(uid) {
    const p = data.presence[uid];
    if (!p) return { key: 'off', rank: 3, text: 'Çevrimdışı' };
    const r = p.room && data.rooms[p.room];
    if (r && r.status === 'playing') return { key: 'game', rank: 0, text: 'Oyunda · ' + p.room };
    if (r) return { key: 'lobby', rank: 1, text: 'Lobide · ' + p.room };
    return { key: 'on', rank: 2, text: 'Çevrimiçi' };
  }

  function renderStats() {
    const uids = Object.keys(data.users);
    const online = Object.keys(data.presence).length;
    const inGame = Object.keys(data.presence).filter(uid => statusOf(uid).key === 'game').length;
    const rooms = Object.values(data.rooms);
    const stats = [
      [uids.length, 'Kayıtlı oyuncu'],
      [online, 'Çevrimiçi'],
      [inGame, 'Oyunda'],
      [rooms.length, 'Açık oda'],
      [rooms.filter(r => r.status === 'playing').length, 'Süren maç'],
      [uids.reduce((n, uid) => n + (data.users[uid].games || 0), 0), 'Toplam katılım'],
      [uids.filter(banUntil).length, 'Banlı']
    ];
    $('stats').replaceChildren(...stats.map(([n, label]) => h('div', { class: 'adm-stat' }, h('b', null, String(n)), h('span', null, label))));
  }

  function renderUsers() {
    const q = $('search').value.trim().toLowerCase();
    const filter = $('filter').value;
    const sort = $('sort').value;
    let list = Object.entries(data.users).map(([uid, u]) => ({ uid, u, st: statusOf(uid), ban: banUntil(uid) }));
    if (q) list = list.filter(x => String(x.u.name || '').toLowerCase().includes(q));
    if (filter === 'online') list = list.filter(x => x.st.key !== 'off');
    if (filter === 'game') list = list.filter(x => x.st.key === 'game');
    if (filter === 'banned') list = list.filter(x => x.ban);
    const byName = (a, b) => String(a.u.name || '').localeCompare(String(b.u.name || ''), 'tr');
    list.sort((a, b) =>
      sort === 'name' ? byName(a, b)
        : sort === 'games' ? (b.u.games || 0) - (a.u.games || 0) || byName(a, b)
          : sort === 'new' ? (b.u.created || 0) - (a.u.created || 0)
            : a.st.rank - b.st.rank || byName(a, b));

    if (!list.length) {
      $('user-list').replaceChildren(h('div', { class: 'adm-empty' }, 'Oyuncu yok.'));
      return;
    }
    $('user-list').replaceChildren(...list.map(({ uid, u, st, ban }) => h('div', { class: 'adm-row' },
      avatar(u.avatar),
      h('div', { class: 'adm-who' },
        h('b', null, String(u.name || '(isimsiz)')),
        h('small', null, `${u.games || 0} maç · Kayıt ${fmtDate(u.created)}` + (st.key === 'off' ? ` · Son görülme ${fmtDate(u.lastSeen)}` : ''))),
      ban ? h('span', { class: 'badge ban' }, 'Banlı · ' + fmtBan(ban)) : null,
      h('span', { class: 'badge ' + st.key }, st.text),
      h('div', { class: 'adm-actions' },
        st.key === 'game' || st.key === 'lobby'
          ? h('button', { class: 'btn adm-small', type: 'button', onclick: () => openWatch(data.presence[uid].room) }, 'İzle') : null,
        u.avatar ? h('button', { class: 'btn adm-small', type: 'button', onclick: () => removeAvatar(uid) }, 'Resmi sil') : null,
        ban
          ? h('button', { class: 'btn adm-small', type: 'button', onclick: () => unban(uid) }, 'Banı kaldır')
          : h('button', { class: 'btn primary adm-small', type: 'button', onclick: () => askBan(uid) }, 'Banla'))
    )));
  }

  function roomInfo(code) {
    const r = data.rooms[code];
    const players = Object.values(r.players || {});
    const humans = players.filter(p => !p.bot).length;
    const s = r.state;
    const phase = r.status === 'playing' && s ? `${PHASE[s.phase] || s.phase} · Gün ${s.day}` : 'Lobi';
    const host = (r.players || {})[r.host];
    return {
      r, phase,
      people: `${humans} oyuncu` + (players.length - humans ? `, ${players.length - humans} bot` : ''),
      hostName: host ? host.name : '?',
      orphan: !data.presence[r.host]
    };
  }

  function renderRooms() {
    const codes = Object.keys(data.rooms);
    if (!codes.length) {
      $('room-list').replaceChildren(h('div', { class: 'adm-empty' }, 'Şu an açık oda yok.'));
      return;
    }
    $('room-list').replaceChildren(...codes.map(code => {
      const info = roomInfo(code);
      return h('div', { class: 'adm-room' },
        h('div', { class: 'adm-room-head' },
          h('b', null, code),
          h('span', { class: 'badge ' + (info.r.status === 'playing' ? 'game' : 'lobby') }, info.phase)),
        h('p', null, `Oda sahibi: ${info.hostName}` + (info.orphan ? ' (bağlı değil)' : ''), h('br'), info.people),
        h('div', { class: 'adm-actions' },
          h('button', { class: 'btn adm-small', type: 'button', onclick: () => openWatch(code) }, 'İzle'),
          h('button', { class: 'btn primary adm-small', type: 'button', onclick: () => endRoom(code) }, 'Sonlandır')));
    }));
  }

  function renderAnnounce() {
    const a = data.announce;
    $('announce-current').replaceChildren(...(a && a.text
      ? [h('span', null, `Son duyuru (${fmtDate(a.t)}): “${a.text}”`),
      h('button', { class: 'btn adm-small', type: 'button', onclick: () => db.ref('announce').remove() }, 'Kaldır')]
      : [h('span', null, 'Aktif duyuru yok. Gönderilen duyuru, o an oyunda olan herkesin ekranında çıkar.')]));
  }

  // ---- Oyun izleme ----
  function openWatch(code) {
    if (!data.rooms[code]) return;
    watching = code;
    $('watch').hidden = false;
    renderWatch();
  }
  function closeWatch() { watching = null; $('watch').hidden = true; }

  function renderWatch() {
    const r = data.rooms[watching];
    if (!r) {
      $('watch-title').textContent = watching;
      $('watch-sub').textContent = 'Oda kapandı';
      $('watch-players').replaceChildren();
      return;
    }
    const info = roomInfo(watching);
    const s = r.status === 'playing' ? r.state : null;
    const lobby = r.players || {};
    const roles = r.roles || {};
    $('watch-title').textContent = watching;
    $('watch-sub').textContent = info.phase + (s && s.winner ? ' · Kazanan: ' + s.winner : '');

    const votes = (s && s.votes) || {};
    const tally = {};
    Object.values(votes).forEach(v => { tally[v] = (tally[v] || 0) + 1; });
    const list = s && s.players
      ? Object.entries(s.players).sort((a, b) => a[1].order - b[1].order)
      : Object.entries(lobby).sort((a, b) => a[1].t - b[1].t).map(([id, p]) => [id, { name: p.name, alive: true }]);

    $('watch-players').replaceChildren(...list.map(([id, p]) => {
      const role = roles[id] || p.role;
      const cls = ['pcard'];
      if (!p.alive) cls.push('dead');
      if (s && id === s.accused) cls.push('accused');
      return h('div', { class: cls.join(' ') },
        h('span', { class: 'avatar-wrap' },
          avatar((lobby[id] || {}).avatar),
          tally[id] ? h('span', { class: 'count' }, String(tally[id])) : null),
        h('span', { class: 'nm' }, String(p.name || '')),
        h('span', { class: 'meta ' + (s && role ? role : '') },
          (s && role ? ROLE[role] : (id === r.host ? 'Oda sahibi' : '')) +
          (votes[id] && s.players[votes[id]] ? ' → ' + s.players[votes[id]].name : '')));
    }));

    const chat = Object.keys(r.chat || {}).sort().map(k => r.chat[k]);
    const ul = $('watch-chat');
    const atBottom = ul.scrollHeight - ul.scrollTop - ul.clientHeight < 40;
    ul.replaceChildren(...(chat.length
      ? chat.map(m => h('li', null, h('b', null, String(m.name || '')), String(m.text || '')))
      : [h('li', { class: 'sys' }, 'Sohbet boş.')]));
    if (atBottom) ul.scrollTop = ul.scrollHeight;
  }

  function tick() {
    if (dirty) {
      dirty = false;
      renderStats();
      if (tab === 'users') renderUsers();
      if (tab === 'rooms') renderRooms();
      if (tab === 'announce') renderAnnounce();
      if (watching) renderWatch();
    }
    const r = watching && data.rooms[watching];
    const s = r && r.status === 'playing' && r.state;
    const left = s && s.endsAt ? s.endsAt - now() : 0;
    $('watch-timer').textContent = left > 0 ? String(Math.ceil(left / 1000)) : '';
  }

  // ================= Bağlantılar =================
  $('login-form').addEventListener('submit', login);
  $('email').value = savedEmail();
  showEmailField(!savedEmail());
  $('email-change').addEventListener('click', () => showEmailField(true));
  $('btn-logout').addEventListener('click', logout);
  $('announce-form').addEventListener('submit', sendAnnounce);
  $('watch-close').addEventListener('click', closeWatch);
  $('watch-end').addEventListener('click', () => { if (watching && data.rooms[watching]) endRoom(watching); });
  ['search', 'filter', 'sort'].forEach(id => $(id).addEventListener('input', () => { dirty = true; }));
  document.querySelectorAll('.adm-tab').forEach(btn => btn.addEventListener('click', () => {
    tab = btn.dataset.tab;
    document.querySelectorAll('.adm-tab').forEach(b => b.classList.toggle('on', b === btn));
    ['users', 'rooms', 'announce'].forEach(k => { $('tab-' + k).hidden = k !== tab; });
    dirty = true;
  }));
})();
