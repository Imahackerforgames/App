import { newMatch, playCard, useTactic, endTurn, rivalPlays, outcome, RECRUITS } from '../server/battle.js'
import Avatar from './Avatar.jsx'

// The first-time tutorial: a short practice duel against a trainer, played
// on this device with the real rules, so nothing is bet and nothing can be
// gained except the one-time completion reward the server pays out.

export const TRAINER = { id: 'trainer-pip', name: 'Pip', level: 1, streak: 0, wins: 0, losses: 0, line: "Let's learn!", betCap: 0, cardCap: 0, deckPower: 0 }

const rc = (id, atk, def, element) => ({ ref: { kind: 'recruit', id }, stats: { atk, def, element, abilities: [] } })
const YOUR_DECK = [
  rc('rc-ember', 3, 3, 'ember'), rc('rc-tide', 2, 4, 'tide'), rc('rc-gale', 2, 4, 'gale'), rc('rc-ember', 3, 3, 'ember'),
  rc('rc-tide', 3, 4, 'tide'), rc('rc-gale', 3, 3, 'gale'), rc('rc-ember', 4, 3, 'ember'), rc('rc-tide', 3, 3, 'tide'),
]
const PIP_DECK = Array.from({ length: 8 }, (_, i) => rc(RECRUITS[i % 3].id, 2, 2, ['gale', 'ember', 'tide'][i % 3]))

// A local stand-in for the server with the same method names the table uses.
export function makeTutorialDuel() {
  const m = newMatch(YOUR_DECK, PIP_DECK, (n) => n - 1) // decks stay in the order above
  m.terrain = ['ember', 'tide', 'gale']
  let status = 'active'
  let pipTurn = 0
  const view = () => {
    const side = (x, mine) => ({ leader: x.leader, energy: x.energy, maxEnergy: x.maxEnergy, turns: x.turns, board: x.board, handCount: x.hand.length, deckCount: x.deck.length, out: x.out || [], ...(mine ? { hand: x.hand } : {}) })
    return JSON.parse(JSON.stringify({
      id: 'tutorial', rivalId: TRAINER.id, status, map: 'garden', wager: { type: 'coins', amount: 0 }, stake: null, payout: null,
      terrain: m.terrain, turn: m.turn, first: m.first, you: side(m.you, true), them: side(m.them, false), events: m.events, rival: TRAINER, tutorial: true,
    }))
  }
  const settle = () => { if (m.over) status = outcome(m) }
  return {
    view,
    playCard: async (_id, i, lane) => { m.events = []; playCard(m, 'you', i, lane); return view() },
    useTactic: async (_id, kind, lane, to) => { m.events = []; useTactic(m, 'you', kind, lane, to); return view() },
    endTurn: async () => {
      m.events = []
      endTurn(m, 'you')
      if (!m.over) {
        pipTurn += 1
        // Pip's first two turns are scripted so the lessons line up
        if (pipTurn === 1) playCard(m, 'them', 0, 1)
        else if (pipTurn === 2) playCard(m, 'them', 0, 2)
        else rivalPlays(m, 0.25)
        endTurn(m, 'them')
      }
      settle()
      return view()
    },
    forfeit: async () => { m.events = []; m.you.leader = 0; m.over = true; status = 'lost'; return view() },
  }
}

// What to do at each step. `wait` says what moves the tutorial on.
export const TUT_STEPS = [
  { wait: 'next', text: "Hi, I'm Pip! This is your first duel, so let's learn by playing. Nothing is bet here." },
  { wait: 'next', hl: 'hp', text: 'You each have 25 HP. Your bar is on the left, mine is on the right — just like your fighters and mine. Knock mine down to 0 to win.' },
  { wait: 'select', hl: 'hand0', allowSelect: (i) => i === 0, text: 'These are your cards. The LV tag is the card\'s level — higher levels fight harder. Tap the glowing card to pick it up.' },
  { wait: 'play', hl: 'lane-you-0', allowLane: (l) => l === 0, text: 'Now tap the glowing ring on your side to send it onto the battlefield. This is the BACK lane.' },
  { wait: 'next', hl: 'unit-you-0', text: 'Your card became a fighter! Above its head: ⚔ is how hard it hits and the green bar is its health. It stands in an Ember ▲ lane and it is an Ember fighter, so it hits +2 harder here.' },
  { wait: 'next', hl: 'energy', text: 'Cards cost energy (the blue diamonds). That card cost 2, all you had. Next turn you get 3, then 4, up to 6.' },
  { wait: 'end', hl: 'end', text: "Tap END TURN. Fighters attack when you end your turn — but on the very first turn of a duel nobody attacks." },
  { wait: 'next', hl: 'lane-them-1', text: 'My turn: I placed a fighter in the MIDDLE lane. Your side of that lane was empty, so it ran straight through and hit you for 2. Empty lanes let fighters hit the hero!' },
  { wait: 'next', hl: 'unit-you-0', text: 'The same goes for you: your BACK-lane fighter faces an empty lane, so when you end your turn it will run across and hit me directly. See the → tag over it?' },
  { wait: 'play', hl: 'lane-you-1', allowSelect: () => true, allowLane: (l) => l === 1, text: "Let's stop my middle fighter. Pick any card you can afford, then place it on the glowing MIDDLE ring to block it." },
  { wait: 'end', hl: 'end', text: 'Now END TURN and watch your fighters run across their lanes and attack! The damage shows on whoever gets hit, with the sum that made it.' },
  { wait: 'next', text: 'Your back-lane fighter hit me directly, and your middle fighter hit mine. Then I attacked back. A fighter whose health bar runs out is knocked out.' },
  { wait: 'tactic', hl: 'unit-you-1', allowUnitTap: true, skip: true, text: 'Tactics: tap your MIDDLE fighter, then press FORTIFY (1 energy). It will block 4 damage from every hit until your next turn.' },
  { wait: 'next', hl: 'terrain', text: 'Last thing: elements. A fighter on its own element lane hits +2. Ember ▲ beats Gale ❖, Gale beats Tide ≈, Tide beats Ember: +3 when you hit a fighter yours beats.' },
  { wait: 'next', text: "That's everything! Finish the duel your way — keep placing fighters and ending your turn. Tap ? any time for the rules." },
  { wait: 'free' },
]

export function TutorialBubble({ step, onNext, onSkip }) {
  if (!step?.text) return null
  return (
    <div className={`tut-bubble ${['select', 'play', 'tactic'].includes(step.wait) ? 'top' : ''}`} role="dialog" aria-live="polite" aria-label="Tutorial">
      <div className="tut-who"><Avatar seed={TRAINER.id} size={28} ring="var(--gold)" /><b>Pip</b><span className="tut-badge">TUTORIAL</span></div>
      <p>{step.text}</p>
      <div className="tut-btns">
        <button className="link" onClick={onSkip}>Skip tutorial</button>
        {step.wait === 'next' && <button className="tut-next" onClick={onNext}>Next ▶</button>}
        {step.wait === 'tactic' && step.skip && <button className="link" onClick={onNext}>Skip this step</button>}
      </div>
    </div>
  )
}
