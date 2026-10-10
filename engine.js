// Oyun motoru: DOM bilmez, sadece kurallar ve durum.
// Online'a geçerken bu dosya sunucuda (veya oda sahibinde) aynen çalışabilir.
(function (root) {
  'use strict';

  const ROLES = { VAMPIRE: 'vampire', DOCTOR: 'doctor', VILLAGER: 'villager' };

  const ROLE_INFO = {
    vampire: { name: 'Vampir', desc: 'Her gece birine saldır.' },
    doctor: { name: 'Doktor', desc: 'Her gece birini koru.' },
    villager: { name: 'Köylü', desc: 'Vampiri bul.' }
  };

  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 12;
  const MAX_SPARES = 2; // üst üste bu kadar kişi indirilirse gece olur

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  class VampGame {
    constructor(players) {
      if (players.length < MIN_PLAYERS) throw new Error('En az ' + MIN_PLAYERS + ' oyuncu gerekli');
      this.players = players.map(p => ({
        id: p.id, name: p.name, avatar: p.avatar, isBot: !!p.isBot, role: null, alive: true
      }));
      this.day = 1;
      this.spareStreak = 0;
      this.lastSpared = null;
      this.accused = null;
      this.winner = null;
      this.nightActions = {};
      this.votes = {};
      this.trialVotes = {};
    }

    get(id) { return this.players.find(p => p.id === id); }
    alive() { return this.players.filter(p => p.alive); }
    byRole(role) { return this.players.find(p => p.role === role); }

    assignRoles() {
      const roles = [ROLES.VAMPIRE, ROLES.DOCTOR];
      while (roles.length < this.players.length) roles.push(ROLES.VILLAGER);
      const mixed = shuffle(roles);
      this.players.forEach((p, i) => { p.role = mixed[i]; });
    }

    // ---- Gece ----
    startNight() { this.nightActions = {}; }

    nightTargets(id) {
      const p = this.get(id);
      if (!p || !p.alive) return [];
      if (p.role === ROLES.VAMPIRE) return this.alive().filter(o => o.id !== id).map(o => o.id);
      if (p.role === ROLES.DOCTOR) return this.alive().map(o => o.id);
      return [];
    }

    setNightAction(id, targetId) {
      if (!this.nightTargets(id).includes(targetId)) return false;
      this.nightActions[id] = targetId;
      return true;
    }

    resolveNight() {
      const vamp = this.byRole(ROLES.VAMPIRE);
      const doc = this.byRole(ROLES.DOCTOR);
      const attacked = vamp.alive ? (this.nightActions[vamp.id] || null) : null;
      const protectedId = doc.alive ? (this.nightActions[doc.id] || null) : null;
      const died = attacked && attacked !== protectedId ? attacked : null;
      if (died) this.get(died).alive = false;
      this.day++;
      this.spareStreak = 0;
      this.lastSpared = null;
      return { attacked, protected: protectedId, died };
    }

    // ---- Oylama ----
    startVote() { this.votes = {}; this.accused = null; }

    voteCandidates(id) {
      return this.alive().filter(o => o.id !== id && o.id !== this.lastSpared).map(o => o.id);
    }

    castVote(id, targetId) {
      const p = this.get(id);
      if (!p || !p.alive || !this.voteCandidates(id).includes(targetId)) return false;
      this.votes[id] = targetId;
      return true;
    }

    resolveVote() {
      const tally = {};
      Object.values(this.votes).forEach(t => { tally[t] = (tally[t] || 0) + 1; });
      // Kimse oy vermediyse kürsüye çıkan olmaz
      if (!Object.keys(tally).length) return { votes: {}, tally, accused: null, max: 0, tie: false };
      const max = Math.max(...Object.values(tally));
      const tied = Object.keys(tally).filter(id => tally[id] === max);
      // Eşitlikte kimse kürsüye çıkmaz, oylama iptal olur
      this.accused = tied.length > 1 ? null : tied[0];
      return { votes: Object.assign({}, this.votes), tally, accused: this.accused, max, tie: tied.length > 1 };
    }

    // ---- Kürsü: öldür / indir ----
    startTrial() { this.trialVotes = {}; }

    trialVoters() { return this.alive().filter(o => o.id !== this.accused).map(o => o.id); }

    castTrial(id, choice) {
      if (!this.trialVoters().includes(id) || (choice !== 'kill' && choice !== 'spare')) return false;
      this.trialVotes[id] = choice;
      return true;
    }

    resolveTrial() {
      const all = Object.values(this.trialVotes);
      const kill = all.filter(c => c === 'kill').length;
      const spare = all.length - kill;
      const executed = kill > spare; // eşitlikte indirilir
      const accused = this.accused;
      if (executed) {
        this.get(accused).alive = false;
      } else {
        this.spareStreak++;
        this.lastSpared = accused;
      }
      return {
        accused, kill, spare, executed,
        votes: Object.assign({}, this.trialVotes),
        nightFalls: executed || this.spareStreak >= MAX_SPARES
      };
    }

    checkWin() {
      const vamp = this.byRole(ROLES.VAMPIRE);
      if (!vamp.alive) this.winner = 'villagers';
      else if (this.alive().length <= 2) this.winner = 'vampire';
      return this.winner;
    }
  }

  root.VV = root.VV || {};
  Object.assign(root.VV, { VampGame, ROLES, ROLE_INFO, MIN_PLAYERS, MAX_PLAYERS, MAX_SPARES, shuffle, pick });
})(typeof window !== 'undefined' ? window : globalThis);
