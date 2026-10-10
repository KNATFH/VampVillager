// Dil desteği: metinler burada, t('anahtar', {degisken}) ile okunur.
(function (root) {
  'use strict';

  const STR = {
    tr: {
      'menu.title': 'Vampir', 'menu.subtitle': 'Köylü', 'menu.play': 'Oyna',
      'settings.title': 'Ayarlar', 'settings.language': 'Dil', 'settings.close': 'Kapat',
      'room.title': 'Oda', 'room.name': 'Adın', 'room.create': 'Oda Kur', 'room.code': 'Oda kodu', 'room.join': 'Katıl', 'room.back': 'Geri',
      'lobby.title': 'Lobi', 'lobby.code': 'Kod', 'lobby.addBot': 'Bot Ekle', 'lobby.start': 'Başlat', 'lobby.leave': 'Çık',
      'lobby.you': 'Sen', 'lobby.remove': '{name} çıkar', 'player.default': 'Oyuncu',
      'role.vampire': 'Vampir', 'role.doctor': 'Doktor', 'role.villager': 'Köylü',
      'desc.vampire': 'Her gece birine saldır.', 'desc.doctor': 'Her gece birini koru.', 'desc.villager': 'Vampiri bul.',
      'role.yours': 'Rolün',
      'phase.day': 'Gün {n}', 'phase.night': 'Gece {n}', 'phase.trial': 'Kürsü',
      'night.vampire': 'Saldıracağın kişiyi seç ya da kimseye dokunma',
      'night.doctor': 'Koruyacağın kişiyi seç ya da kimseyi koruma',
      'night.villager': 'Köy uyuyor',
      'pick.target': 'Hedef', 'pick.protect': 'Korunuyor', 'pick.vote': 'Oyun',
      'morning.killed': '{name} öldürüldü', 'morning.none': 'Kimse ölmedi',
      'vote.cast': 'Oy ver', 'vote.watch': 'Oylama', 'vote.none': 'Kimse oy vermedi.', 'vote.accused': '{name} kürsüde.',
      'trial.defend': 'Kendini savun', 'trial.kill': 'Öldür', 'trial.spare': 'İndir',
      'trial.executed': 'Asıldı', 'trial.spared': 'İndirildi',
      'trial.executedLog': '{name} asıldı. {role}.', 'trial.sparedLog': '{name} indirildi.',
      'chat.send': 'Gönder', 'chat.placeholder': 'Mesaj yaz', 'chat.night': 'Gece konuşulmaz', 'chat.dead': 'Ölüler konuşamaz',
      'over.vampire': 'Vampir Kazandı', 'over.villagers': 'Köylüler Kazandı', 'over.win': 'Kazandın', 'over.lose': 'Kaybettin',
      'over.again': 'Tekrar Oyna', 'over.lobby': 'Lobi',
      'quit.confirm': 'Oyundan çıkılsın mı?', 'quit.label': 'Oyundan çık',
      'auth.login': 'Giriş Yap', 'auth.register': 'Hesap Oluştur', 'auth.name': 'İsim', 'auth.pass': 'Şifre',
      'auth.toRegister': 'Hesabın yok mu? Hesap oluştur', 'auth.toLogin': 'Hesabın var mı? Giriş yap',
      'err.name': 'İsim 3-14 karakter olmalı, boşluk olmamalı.', 'err.taken': 'Bu isim alınmış.',
      'err.wrong': 'İsim veya şifre yanlış.', 'err.weak': 'Şifre en az 6 karakter olmalı.',
      'err.network': 'Bağlantı hatası.', 'err.disabled': 'Firebase\'de e-posta/şifre girişi açık değil.',
      'err.unknown': 'Bir şeyler ters gitti.', 'err.config': 'Firebase ayarı eksik: firebase-config.js',
      'room.notFound': 'Oda bulunamadı.', 'room.started': 'Oyun başlamış.', 'room.full': 'Oda dolu.', 'room.closed': 'Oda kapandı.',
      'lobby.waiting': 'Oda sahibi bekleniyor', 'lobby.host': 'Oda sahibi',
      'settings.account': 'Hesap', 'settings.logout': 'Çıkış Yap', 'over.leave': 'Çık'
    },
    en: {
      'menu.title': 'Vampire', 'menu.subtitle': 'Village', 'menu.play': 'Play',
      'settings.title': 'Settings', 'settings.language': 'Language', 'settings.close': 'Close',
      'room.title': 'Room', 'room.name': 'Your name', 'room.create': 'Create Room', 'room.code': 'Room code', 'room.join': 'Join', 'room.back': 'Back',
      'lobby.title': 'Lobby', 'lobby.code': 'Code', 'lobby.addBot': 'Add Bot', 'lobby.start': 'Start', 'lobby.leave': 'Leave',
      'lobby.you': 'You', 'lobby.remove': 'Remove {name}', 'player.default': 'Player',
      'role.vampire': 'Vampire', 'role.doctor': 'Doctor', 'role.villager': 'Villager',
      'desc.vampire': 'Attack someone every night.', 'desc.doctor': 'Protect someone every night.', 'desc.villager': 'Find the vampire.',
      'role.yours': 'Your role',
      'phase.day': 'Day {n}', 'phase.night': 'Night {n}', 'phase.trial': 'Trial',
      'night.vampire': 'Choose who to attack, or spare everyone',
      'night.doctor': 'Choose who to protect, or protect no one',
      'night.villager': 'The village sleeps',
      'pick.target': 'Target', 'pick.protect': 'Protected', 'pick.vote': 'Your vote',
      'morning.killed': '{name} was killed', 'morning.none': 'Nobody died',
      'vote.cast': 'Cast your vote', 'vote.watch': 'Voting', 'vote.none': 'Nobody voted.', 'vote.accused': '{name} is on trial.',
      'trial.defend': 'Defend yourself', 'trial.kill': 'Kill', 'trial.spare': 'Spare',
      'trial.executed': 'Hanged', 'trial.spared': 'Spared',
      'trial.executedLog': '{name} was hanged. {role}.', 'trial.sparedLog': '{name} was spared.',
      'chat.send': 'Send', 'chat.placeholder': 'Type a message', 'chat.night': 'No talking at night', 'chat.dead': 'The dead cannot talk',
      'over.vampire': 'Vampire Wins', 'over.villagers': 'Villagers Win', 'over.win': 'You won', 'over.lose': 'You lost',
      'over.again': 'Play Again', 'over.lobby': 'Lobby',
      'quit.confirm': 'Leave the game?', 'quit.label': 'Leave game',
      'auth.login': 'Sign In', 'auth.register': 'Create Account', 'auth.name': 'Name', 'auth.pass': 'Password',
      'auth.toRegister': 'No account? Create one', 'auth.toLogin': 'Have an account? Sign in',
      'err.name': 'Name must be 3-14 characters with no spaces.', 'err.taken': 'That name is taken.',
      'err.wrong': 'Wrong name or password.', 'err.weak': 'Password must be at least 6 characters.',
      'err.network': 'Connection error.', 'err.disabled': 'Email/password sign-in is not enabled in Firebase.',
      'err.unknown': 'Something went wrong.', 'err.config': 'Firebase config missing: firebase-config.js',
      'room.notFound': 'Room not found.', 'room.started': 'Game already started.', 'room.full': 'Room is full.', 'room.closed': 'Room closed.',
      'lobby.waiting': 'Waiting for the host', 'lobby.host': 'Host',
      'settings.account': 'Account', 'settings.logout': 'Sign Out', 'over.leave': 'Leave'
    }
  };

  const LANGS = [{ id: 'tr', name: 'Türkçe' }, { id: 'en', name: 'English' }];

  let lang = 'tr';
  try {
    const saved = localStorage.getItem('vv-lang');
    if (STR[saved]) lang = saved;
  } catch (e) { /* varsayılan kalır */ }

  function t(key, vars) {
    let s = STR[lang][key] || STR.tr[key] || key;
    Object.keys(vars || {}).forEach(k => { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }

  // HTML'deki sabit metinler: data-i18n (içerik), data-i18n-placeholder, data-i18n-label
  function applyStatic() {
    document.documentElement.lang = lang; // büyük harfe çevirirken i/İ doğru olsun
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
    document.title = t('menu.title') + ' ' + t('menu.subtitle');
  }

  function setLang(id) {
    if (!STR[id]) return;
    lang = id;
    try { localStorage.setItem('vv-lang', id); } catch (e) { /* önemli değil */ }
    applyStatic();
  }

  root.VV = root.VV || {};
  Object.assign(root.VV, { t, setLang, getLang: () => lang, applyStatic, LANGS });
})(window);
