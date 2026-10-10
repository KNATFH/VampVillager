// Firebase bağlantısı: hesap (isim + şifre), veritabanı erişimi, çevrimiçi durumu, ban ve duyurular.
// Firebase Auth e-posta ister; isimden görünmeyen bir e-posta türetiyoruz. Şifreyi Firebase kendisi
// şifreli saklar, biz veritabanına yazmıyoruz.
(function (root) {
  'use strict';
  const fb = root.firebase;
  const cfg = root.VV_FIREBASE_CONFIG;
  const DOMAIN = '@vampvillager.game';

  const net = { ok: !!(fb && (cfg || fb.isMock)) };
  let auth = null, db = null, offset = 0, pendingName = null, avatarData = null;
  let connected = false, roomCode = null;
  let banRef = null, banVal = null, banCb = null;
  let announceOn = false, announceCb = null;

  const serverTime = () => (fb.database.ServerValue ? fb.database.ServerValue.TIMESTAMP : Date.now());

  // Çevrimiçi durumu: bağlantı kopunca Firebase kaydı kendisi siler
  function goOnline() {
    const uid = net.uid();
    if (!uid || !connected) return;
    const p = db.ref('presence/' + uid);
    p.onDisconnect().remove();
    p.set({ name: net.name(), room: roomCode, t: serverTime() });
    const seen = db.ref('users/' + uid + '/lastSeen');
    seen.onDisconnect().set(serverTime());
    seen.set(serverTime());
  }

  function watchBan(uid) {
    if (banRef) banRef.off();
    banVal = null;
    banRef = uid ? db.ref('bans/' + uid) : null;
    if (banRef) banRef.on('value', s => { banVal = s.val(); if (banCb) banCb(); });
  }

  function watchAnnounce(on) {
    if (on === announceOn) return;
    announceOn = on;
    const ref = db.ref('announce');
    if (on) ref.on('value', s => { if (announceCb) announceCb(s.val()); }, () => { announceOn = false; });
    else ref.off();
  }

  if (net.ok) {
    fb.initializeApp(cfg || {});
    auth = fb.auth();
    db = fb.database();
    db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
  }

  // İsim -> e-posta. Türkçe harfler de olabilsin diye hex'e çeviriyoruz.
  function emailFor(name) {
    const bytes = new TextEncoder().encode(name.trim().toLowerCase());
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return 'u' + hex + DOMAIN;
  }

  function checkName(name) {
    if (name.length < 3 || name.length > 14 || /\s/.test(name) || emailFor(name).length - DOMAIN.length > 64) {
      throw { code: 'vv/bad-name' };
    }
  }

  net.onAuth = cb => auth.onAuthStateChanged(user => {
    watchBan(user ? user.uid : null);
    watchAnnounce(!!user);
    if (user) goOnline();
    cb(user);
  });
  net.uid = () => (auth && auth.currentUser ? auth.currentUser.uid : null);
  net.name = () => (auth && auth.currentUser ? (auth.currentUser.displayName || pendingName || '') : '');
  net.now = () => Date.now() + offset;
  net.ref = path => db.ref(path);

  net.register = async (name, pass) => {
    name = name.trim();
    checkName(name);
    pendingName = name;
    const cred = await auth.createUserWithEmailAndPassword(emailFor(name), pass);
    await cred.user.updateProfile({ displayName: name });
    await db.ref('users/' + cred.user.uid).update({ name, created: Date.now() });
    goOnline();
  };

  net.login = async (name, pass) => {
    name = name.trim();
    checkName(name);
    await auth.signInWithEmailAndPassword(emailFor(name), pass);
  };

  net.logout = () => {
    const uid = net.uid();
    avatarData = null;
    roomCode = null;
    if (uid) Promise.resolve(db.ref('presence/' + uid).remove()).catch(() => { });
    return auth.signOut();
  };

  // Hangi odada olduğumuz (kontrol panelinde görünür)
  net.setRoom = code => {
    roomCode = code || null;
    const uid = net.uid();
    if (uid && connected) Promise.resolve(db.ref('presence/' + uid + '/room').set(roomCode)).catch(() => { });
  };

  // Oynanan maç sayısı
  net.bumpGames = () => {
    const ref = db.ref('users/' + net.uid() + '/games');
    if (ref.transaction) ref.transaction(v => (v || 0) + 1);
    else ref.get().then(s => ref.set((s.val() || 0) + 1));
  };

  // Ban: bans/{uid} = { until }. Süresi geçmişse sayılmaz.
  net.onBan = cb => { banCb = cb; };
  net.bannedUntil = () => (banVal && banVal.until > net.now() ? banVal.until : 0);

  net.onAnnounce = cb => { announceCb = cb; };

  // Profil resmi: küçültülmüş bir data URL olarak users/{uid}/avatar altında durur
  net.avatar = () => avatarData;
  net.loadProfile = async () => {
    const snap = await db.ref('users/' + net.uid() + '/avatar').get();
    avatarData = snap.val() || null;
  };
  net.setAvatar = async data => {
    avatarData = data || null;
    await db.ref('users/' + net.uid() + '/avatar').set(avatarData);
  };

  if (net.ok) db.ref('.info/connected').on('value', s => { connected = !!s.val(); goOnline(); });

  root.VV = root.VV || {};
  root.VV.net = net;
})(window);
