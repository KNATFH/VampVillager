// Geliştirme için sahte Firebase: adresin sonuna ?mock yazınca devreye girer.
// Her şey bellekte durur, sayfa yenilenince silinir. Gerçek oyunda kullanılmaz.
(function () {
  'use strict';
  if (!/[?&]mock/.test(location.search)) return;

  const store = { '.info': { connected: true } };
  const listeners = [];
  const split = p => p.split('/').filter(Boolean);

  function clean(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object') return v;
    const o = {};
    Object.keys(v).forEach(k => { const c = clean(v[k]); if (c !== null) o[k] = c; });
    return Object.keys(o).length ? o : null;
  }

  function getAt(path) {
    let n = store;
    for (const k of split(path)) {
      if (n === null || typeof n !== 'object') return null;
      n = n[k];
      if (n === undefined) return null;
    }
    return clean(JSON.parse(JSON.stringify(n)));
  }

  function setAt(path, val) {
    const ks = split(path);
    val = clean(val === undefined ? null : JSON.parse(JSON.stringify(val)));
    let n = store;
    ks.slice(0, -1).forEach(k => {
      if (n[k] === null || typeof n[k] !== 'object') n[k] = {};
      n = n[k];
    });
    const last = ks[ks.length - 1];
    if (val === null) delete n[last]; else n[last] = val;
  }

  function snap(path, v) {
    return { val: () => v, exists: () => v !== null, key: split(path).pop() || null };
  }

  function fire(l) {
    const v = getAt(l.path);
    if (l.type === 'value') {
      const j = JSON.stringify(v);
      if (j === l.last) return;
      l.last = j;
      l.cb(snap(l.path, v));
    } else {
      const obj = v || {};
      Object.keys(obj).forEach(k => {
        if (l.seen[k]) return;
        l.seen[k] = true;
        l.cb(snap(l.path + '/' + k, obj[k]));
      });
      Object.keys(l.seen).forEach(k => { if (!(k in obj)) delete l.seen[k]; });
    }
  }

  const notify = () => listeners.slice().forEach(l => { if (listeners.includes(l)) fire(l); });

  let pushN = 0;
  function ref(path) {
    const r = {
      key: split(path).pop() || null,
      child: p => ref(path + '/' + p),
      set: v => { setAt(path, v); notify(); return Promise.resolve(); },
      update: o => { Object.keys(o).forEach(k => setAt(path + '/' + k, o[k])); notify(); return Promise.resolve(); },
      remove: () => r.set(null),
      push: v => {
        const c = ref(path + '/m' + String(++pushN).padStart(6, '0'));
        if (v !== undefined) c.set(v);
        return c;
      },
      on: (type, cb) => {
        const l = { path, type, cb, last: undefined, seen: {} };
        listeners.push(l);
        fire(l);
        return cb;
      },
      off: (type, cb) => {
        for (let i = listeners.length - 1; i >= 0; i--) {
          const l = listeners[i];
          if (l.path === path && (!type || l.type === type) && (!cb || l.cb === cb)) listeners.splice(i, 1);
        }
      },
      get: () => Promise.resolve(snap(path, getAt(path))),
      once: () => r.get(),
      limitToLast: () => r,
      onDisconnect: () => ({ remove: () => Promise.resolve(), set: () => Promise.resolve(), cancel: () => Promise.resolve() })
    };
    return r;
  }

  const users = {};
  const authCbs = [];
  let current = null;
  const emit = () => authCbs.forEach(cb => cb(current));
  const authObj = {
    get currentUser() { return current; },
    onAuthStateChanged: cb => { authCbs.push(cb); setTimeout(() => cb(current)); },
    createUserWithEmailAndPassword: (email, pass) => {
      if (users[email]) return Promise.reject({ code: 'auth/email-already-in-use' });
      if (pass.length < 6) return Promise.reject({ code: 'auth/weak-password' });
      const user = {
        uid: 'u' + (Object.keys(users).length + 1), displayName: null,
        updateProfile: o => { Object.assign(user, o); return Promise.resolve(); }
      };
      users[email] = { user, pass };
      current = user;
      emit();
      return Promise.resolve({ user });
    },
    signInWithEmailAndPassword: (email, pass) => {
      const u = users[email];
      if (!u || u.pass !== pass) return Promise.reject({ code: 'auth/invalid-credential' });
      current = u.user;
      emit();
      return Promise.resolve({ user: current });
    },
    signOut: () => { current = null; emit(); return Promise.resolve(); },
    setPersistence: () => Promise.resolve()
  };

  window.firebase = {
    isMock: true,
    initializeApp: () => ({}),
    database: () => ({ ref }),
    auth: () => authObj
  };
})();
