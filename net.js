// Firebase bağlantısı: hesap (isim + şifre) ve veritabanı erişimi.
// Firebase Auth e-posta ister; isimden görünmeyen bir e-posta türetiyoruz. Şifreyi Firebase kendisi
// şifreli saklar, biz veritabanına yazmıyoruz.
(function (root) {
  'use strict';
  const fb = root.firebase;
  const cfg = root.VV_FIREBASE_CONFIG;
  const DOMAIN = '@vampvillager.game';

  const net = { ok: !!(fb && (cfg || fb.isMock)) };
  let auth = null, db = null, offset = 0, pendingName = null, avatarData = null;

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

  net.onAuth = cb => auth.onAuthStateChanged(cb);
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
    await db.ref('users/' + cred.user.uid).set({ name, created: Date.now() });
  };

  net.login = async (name, pass) => {
    name = name.trim();
    checkName(name);
    await auth.signInWithEmailAndPassword(emailFor(name), pass);
  };

  net.logout = () => { avatarData = null; return auth.signOut(); };

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

  root.VV = root.VV || {};
  root.VV.net = net;
})(window);
