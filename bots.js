// Bot zekası: her bot diğer oyuncular için bir şüphe puanı tutar (0 = güveniyor, 1 = kesin vampir).
(function (root) {
  'use strict';
  const { ROLES, pick } = root.VV;

  const clamp = v => Math.max(0, Math.min(1, v));

  class BotBrain {
    constructor(game) {
      this.g = game;
      this.sus = {};
      game.players.filter(p => p.isBot).forEach(b => {
        this.sus[b.id] = {};
        game.players.forEach(o => {
          if (o.id !== b.id) this.sus[b.id][o.id] = 0.3 + Math.random() * 0.4;
        });
      });
    }

    _most(bot, ids, noise) {
      const s = this.sus[bot.id];
      let best = null, bestV = -Infinity;
      ids.forEach(id => {
        const v = (s[id] || 0) + Math.random() * noise;
        if (v > bestV) { bestV = v; best = id; }
      });
      return best;
    }

    nightAction(bot) {
      const targets = this.g.nightTargets(bot.id);
      if (!targets.length) return null;
      if (bot.role === ROLES.VAMPIRE) return pick(targets);
      // Doktor: bazen kendini, çoğunlukla en güvendiği kişiyi korur
      if (Math.random() < 0.3) return bot.id;
      const s = this.sus[bot.id];
      const others = targets.filter(id => id !== bot.id);
      let best = others[0], bestV = Infinity;
      others.forEach(id => {
        const v = s[id] + Math.random() * 0.4;
        if (v < bestV) { bestV = v; best = id; }
      });
      return best;
    }

    vote(bot) {
      const c = this.g.voteCandidates(bot.id);
      if (bot.role === ROLES.VAMPIRE) return pick(c);
      return this._most(bot, c, 0.35);
    }

    trial(bot) {
      const accused = this.g.accused;
      if (bot.role === ROLES.VAMPIRE) return Math.random() < 0.75 ? 'kill' : 'spare';
      return this.sus[bot.id][accused] + Math.random() * 0.3 - 0.15 > 0.5 ? 'kill' : 'spare';
    }

    _bump(botId, targetId, d) {
      const s = this.sus[botId];
      if (s && targetId in s) s[targetId] = clamp(s[targetId] + d);
    }

    onNight(res) {
      // Kimse ölmediyse doktor, koruduğu kişinin masum olduğunu anlar
      const doc = this.g.byRole(ROLES.DOCTOR);
      if (doc.isBot && doc.alive && !res.died && res.protected && res.protected !== doc.id) {
        this.sus[doc.id][res.protected] = 0;
      }
    }

    onVote(res) {
      // Kendisine oy verene kin tutar
      Object.keys(res.votes).forEach(voter => this._bump(res.votes[voter], voter, 0.1));
    }

    onTrial(res) {
      const victim = this.g.get(res.accused);
      if (!res.executed) {
        // İndirilen kişi biraz aklanır
        Object.keys(this.sus).forEach(b => this._bump(b, res.accused, -0.1));
        return;
      }
      if (victim.role === ROLES.VAMPIRE) return;
      // Masum biri asıldı: öldür diyenler şüpheli, indir diyenler biraz temiz
      Object.keys(this.sus).forEach(b => {
        Object.keys(res.votes).forEach(voter => {
          this._bump(b, voter, res.votes[voter] === 'kill' ? 0.12 : -0.05);
        });
      });
    }
  }

  root.VV.BotBrain = BotBrain;
})(typeof window !== 'undefined' ? window : globalThis);
