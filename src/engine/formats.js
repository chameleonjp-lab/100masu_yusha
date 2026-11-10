// Vocabulary of the typed script format (docs/dev/script-format.md is the prose spec).
// The engine, the content validator and tools/validate-content.mjs all read these tables,
// so there is a single place that says what exists and what is actually wired.

/** Expression / condition node keys (besides literals and {ref}). */
export const EXPR_NODES = [
  'ref', 'add', 'sub', 'mul', 'floorDiv', 'ceilDiv', 'min', 'max', 'neg', 'sum', 'clamp', 'if',
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'even', 'odd', 'and', 'or', 'not', 'actions',
];

/** ref names. `args` lists the extra keys the node may carry. wired=false means documented but not resolvable yet. */
export const REFS = {
  gold: {}, hp: {}, mp: {}, maxHp: {}, maxMp: {}, level: {}, xp: {}, pos: {}, band: {}, rolls: {}, job: {},
  bagCount: {}, bagFree: {}, companionCount: {},
  itemCount: { args: ['id'] }, hasGear: { args: ['id'] }, hasSpell: { args: ['id'] },
  die: {}, rawDie: {}, prevDie: {},
  stopPos: { args: ['die'] }, forcedStop: { args: ['die'] }, nextStop: {}, flag: { args: ['key'] },
  'move.die': {}, 'move.steps': {}, 'move.discarded': {}, 'move.stop': {}, 'move.from': {}, 'move.to': {},
  'move.adjustItem': {}, 'move.adjustDelta': {},
  'battle.round': {}, 'battle.isKing': {}, 'battle.isOptional': {}, 'battle.enemyId': {},
  'battle.enemyHp': {}, 'battle.enemyMaxHp': {}, 'battle.startHp': {}, 'battle.startMp': {},
  'battle.heroAction': { args: ['offset', 'abs'] }, 'battle.hpLost': { args: ['offset', 'abs'] },
  'battle.attackHit': { args: ['offset', 'abs'] }, 'battle.enemyKind': { args: ['offset', 'abs'] },
  'battle.guarded': { args: ['offset', 'abs'] },
  'battle.damage': {}, 'battle.dealt': {}, 'battle.attackKind': {}, 'battle.count': { args: ['what'] },
  'battle.enemyHealed': { args: ['offset'] },
  'battle.spellMpAfter': {}, 'battle.spellCost': {},
  'battle.reduced': { args: ['offset', 'abs'] }, 'battle.spellCostPaid': { args: ['offset', 'abs'] }, 'battle.companionsActed': { args: ['offset', 'abs'] },
  itemCategory: { args: ['id'] }, sinceInn: {},
};
export const REF_PREFIXES = ['var.'];

export const HOOKS = {
  battleStart: { wired: true, doc: 'once, right after the battle is set up' },
  heroTurnStart: { wired: true, doc: 'start of the hero turn, before the hero acts (marks created in earlier rounds only): "次の自分の手番の初めに"' },
  afterHeroAction: { wired: true, doc: 'right after the hero action resolved, before companions and the enemy; ctx battle.spellCost = mp paid by a spell' },
  heroAttackDamage: { wired: true, doc: 'hero direct damage (attack/spell/item) is being computed; ctx battle.attackKind, battle.damage' },
  heroHit: { wired: true, doc: 'after a hero direct hit landed; ctx battle.dealt, battle.attackKind' },
  enemyDamage: { wired: true, doc: 'enemy hit on the hero is being computed (stage guard<shield<gear<die<card); ctx battle.damage' },
  afterEnemyAction: { wired: true, doc: 'after the enemy action resolved (hit or not), both sides alive or not; ctx battle.hpLost, battle.enemyKind' },
  roundEnd: { wired: true, doc: 'both alive; before the next announcement' },
  victory: { wired: true, doc: 'the moment the enemy falls; all `when` are evaluated before any effect runs' },
  spellCost: { wired: true, doc: 'MP cost of a spell is being computed; ctx battle.spellCost' },
  spellHeal: { wired: true, doc: 'a heal spell is about to heal; ctx battle.damage = heal amount' },
  moveConfirm: { wired: true, doc: 'a move was confirmed; ctx move.*' },
  restConfirm: { wired: false, doc: 'inn free rest confirmed (AR15/AR37/HE09/HE24 ...) - format reserved' },
  trapLoss: { wired: false, doc: 'trap hp loss is being decided (AR16, BD04, BD16 ...) - format reserved' },
};

/** Where an item `use` may be performed. */
export const ITEM_WHERE = {
  battle: { wired: true, doc: 'hero action during a battle' },
  board: { wired: true, doc: 'phase board, before rolling' },
  afterRoll: { wired: true, doc: 'phase rolled, before the move is confirmed' },
  inn: { wired: true, doc: 'phase inn' },
  gate: { wired: true, doc: 'phase gate (before challenging the demon king)' },
  trap: { wired: true, doc: 'phase event on a 罠 square, before an option is chosen' },
  restConfirm: { wired: false, doc: 'at the inn when confirming the free rest' },
  event: { wired: false, doc: 'inside an event (puzzle assists: BD05, BD14, BD18, BD23, BD26, BD33, BD34, BD39, BD44 ...)' },
  chestPick: { wired: false, doc: 'while a chest or item offer is shown (BD06)' },
  bossChallenge: { wired: false, doc: 'before confirming an optional boss challenge (BD46)' },
  recruit: { wired: false, doc: 'when a companion joins (BD45)' },
  equipConfirm: { wired: false, doc: 'when gear is received (BD28)' },
  trade: { wired: false, doc: 'when an event asks for a named item (BD36)' },
  victoryConfirm: { wired: false, doc: 'when a battle is won (HE34)' },
  flee: { wired: false, doc: 'fleeing a normal battle (HE20)' },
};

/** Effect ops. contexts: where the op is legal. wired: implemented by the engine. */
export const OPS = {
  // resources
  awardGold: { wired: true, contexts: ['event'], doc: 'goldAward payout; amount must equal the event directGold; once per run+square' },
  payGold: { wired: true, contexts: ['event', 'item', 'rule'], doc: 'pay gold (strict unless clamp:true)' },
  hp: { wired: true, contexts: ['any'], doc: 'hp delta (expr), floor for losses (default 1 outside battle), heals cap at maxHp' },
  mp: { wired: true, contexts: ['any'], doc: 'mp delta (expr), floor for losses (default 0), heals cap at maxMp' },
  xp: { wired: true, contexts: ['event', 'item'], doc: 'add experience' },
  giveItem: { wired: true, contexts: ['event', 'chest', 'reward'], doc: 'consumable into the bag; full bag -> bagFull prompt (swap or decline)' },
  giveGear: { wired: true, contexts: ['event', 'chest', 'reward'], doc: 'gear (paidGold = cash actually paid, for resale caps)' },
  learnSpell: { wired: true, contexts: ['event', 'chest', 'inn'], doc: 'learn a spell' },
  loseItem: { wired: true, contexts: ['event'], doc: 'remove an item by id, or choose:true to pick a bag item' },
  // flow
  if: { wired: true, contexts: ['any'], doc: 'cond ? then : else' },
  choice: { wired: true, contexts: ['event'], doc: 'sub-prompt: options with their own effects' },
  battle: { wired: true, contexts: ['event'], doc: 'start (or offer) a battle; must be the last effect of its list' },
  reserve: { wired: true, contexts: ['event', 'item'], doc: 'reservation for thisMove / nextBattle / arrival' },
  reveal: { wired: true, contexts: ['event', 'item'], doc: 'compute and store an information reveal' },
  setFlag: { wired: true, contexts: ['any'], doc: 'run-level flag' },
  custom: { wired: true, contexts: ['any'], doc: 'named handler in src/engine/custom/' },
  negateTrap: { wired: true, contexts: ['item'], doc: 'AT02 on a trap: the square resolves without loss' },
  // movement helpers
  adjustDie: { wired: true, contexts: ['item'], doc: 'afterRoll die change: to expr + constraints' },
  setDieRule: { wired: true, contexts: ['item'], doc: 'board (pre-roll) die table rule for the next roll' },
  revealShop: { wired: true, contexts: ['item'], doc: 'BD09: shop of the next unvisited inn' },
  showLandingOdds: { wired: true, contexts: ['item'], doc: 'BD43: ways out of 36 to land on a target' },
  swapShopSlot: { wired: true, contexts: ['item'], doc: 'BD40: replace a regional consumable slot' },
  // battle
  dealDamage: { wired: true, contexts: ['battle'], doc: 'fixed damage to the enemy (times, boostable, leave = enemy hp is not taken below this)' },
  addMark: { wired: true, contexts: ['battle'], doc: 'add a temporary rule to the battle' },
  addDamage: { wired: true, contexts: ['rule'], doc: 'heroAttackDamage hook: + damage' },
  subDamage: { wired: true, contexts: ['rule'], doc: 'heroAttackDamage hook: - damage (min)' },
  skipHeroAttack: { wired: true, contexts: ['extraAction'], doc: 'the extra action deals no damage' },
  reduceDamage: { wired: true, contexts: ['rule'], doc: 'enemyDamage hook: - damage (min 0)' },
  increaseDamage: { wired: true, contexts: ['rule'], doc: 'enemyDamage hook: + damage' },
  halveDamage: { wired: true, contexts: ['rule'], doc: 'enemyDamage hook: ceil(damage/2) when damage>0' },
  absorbDamage: { wired: true, contexts: ['rule'], doc: 'enemyDamage hook: absorb up to `amount` (total pool in the mark)' },
  capDamage: { wired: true, contexts: ['rule'], doc: 'enemyDamage hook: damage = min(damage, amount)' },
  reduceCost: { wired: true, contexts: ['rule'], doc: 'spellCost hook: - mp cost (min)' },
  setEnemyHp: { wired: true, contexts: ['field'], doc: 'battle start: enemy hp delta with min' },
};

export const OP_NAMES = Object.keys(OPS);

export const COST_KEYS = ['gold', 'hp', 'mp', 'items', 'trapLoss'];
export const RULE_KEYS = ['id', 'hook', 'when', 'limit', 'stage', 'effects', 'expires', 'uses', 'unique', 'label', 'cancelWhen'];
// enemyDamage stages in order: guard (built-in halving) -> wall (石の衣) -> shield (companion, built-in) -> gear -> die (built-in small die) -> card (AT02)
export const STAGES = ['guard', 'wall', 'shield', 'gear', 'die', 'card'];
