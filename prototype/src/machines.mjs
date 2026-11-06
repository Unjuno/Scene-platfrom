/**
 * SCENE finite-state machines: pure, dependency-free transition rules.
 * Every external side effect is performed by a caller only after acceptance.
 * Rejected events leave the state unchanged. Never equate a visual button state
 * with server-side authorization.
 * @typedef {{type:string}} Event
 * @typedef {{from:string,to:string,event:string,accepted:boolean,reason?:string}} TransitionResult
 */
const G = {
  authed: ({ authenticated }) => authenticated === true,
  own: ({ isOwner }) => isOwner === true,
  publishable: ({ isOwner, valid, persisted }) => isOwner === true && valid === true && persisted === true,
  canDub: ({ authenticated, dubPermission, revisionValid }) => authenticated === true && dubPermission === 'allow' && revisionValid === true,
  hasAudio: ({ hasAudio }) => hasAudio === true,
  valid: ({ valid }) => valid === true,
};
const rule = (to, guard) => Object.freeze({ to, guard });
export const MACHINES = Object.freeze({
  auth: {
    initial: 'anonymous', states: {
      anonymous: { LOGIN: 'authenticating' },
      authenticating: { SUCCESS: 'authenticated', FAILED: 'failed', CANCEL: 'anonymous' },
      authenticated: { LOGOUT: 'anonymous', EXPIRED: 'expired' },
      expired: { LOGIN: 'authenticating', LOGOUT: 'anonymous' },
      failed: { RETRY: 'authenticating', CANCEL: 'anonymous' },
    },
  },
  player: {
    initial: 'idle', states: {
      idle: { OPEN: 'loading' },
      loading: { READY: 'ready', FAILED: 'failed', CANCEL: 'idle' },
      ready: { NEXT: 'ready', PREVIOUS: 'ready', JUMP: 'ready', PLAY: rule('playing', 'hasAudio'), FINISH: 'ended', CLOSE: 'idle' },
      playing: { PAUSE: 'paused', FINISH: 'ended', NEXT: 'playing', PREVIOUS: 'playing', JUMP: 'playing', FAILED: 'failed', CLOSE: 'idle' },
      paused: { PLAY: rule('playing', 'hasAudio'), NEXT: 'paused', PREVIOUS: 'paused', JUMP: 'paused', FINISH: 'ended', CLOSE: 'idle' },
      ended: { RESTART: 'ready', CLOSE: 'idle' },
      failed: { RETRY: 'loading', CLOSE: 'idle' },
    },
  },
  editor: {
    initial: 'editing', states: {
      editing: { CHANGE: 'editing', VALIDATE: 'validating', RESET: 'editing' },
      validating: { VALID: rule('saving', 'valid'), INVALID: 'editing', CANCEL: 'editing' },
      saving: { SUCCESS: 'saved', FAILED: 'failed' },
      saved: { CHANGE: 'editing', VALIDATE: 'validating' },
      failed: { CHANGE: 'editing', RETRY: 'validating' },
    },
  },
  recorder: {
    initial: 'idle', states: {
      idle: { REQUEST: 'requesting', IMPORT: 'reviewing' },
      requesting: { GRANTED: 'ready', DENIED: 'failed', FAILED: 'failed' },
      ready: { START: 'recording', IMPORT: 'reviewing', CANCEL: 'idle' },
      recording: { STOP: 'stopping', FAILED: 'failed' },
      stopping: { SAVED: 'reviewing', FAILED: 'failed' },
      reviewing: { RETAKE: 'ready', REQUEST: 'requesting', IMPORT: 'reviewing', SELECT: 'reviewing', RESET: 'idle' },
      failed: { RETRY: 'idle', RESET: 'idle' },
    },
  },
  upload: {
    initial: 'idle', states: {
      idle: { SELECT: 'checking' },
      checking: { VALID: 'optimizing', INVALID: 'failed', CANCEL: 'idle' },
      optimizing: { DONE: 'persisting', FAILED: 'failed', CANCEL: 'idle' },
      persisting: { COMMITTED: 'complete', FAILED: 'failed' },
      complete: { SELECT: 'checking', RESET: 'idle' },
      failed: { RETRY: 'checking', RESET: 'idle' },
    },
  },
  rating: {
    initial: 'idle', states: {
      idle: { SUBMIT: rule('submitting', 'authed') },
      submitting: { SUCCESS: 'committed', FAILED: 'failed' },
      committed: { SUBMIT: rule('submitting', 'authed'), RESET: 'idle' },
      failed: { RETRY: rule('submitting', 'authed'), RESET: 'idle' },
    },
  },
  work: {
    initial: 'draft', states: {
      draft: { BEGIN_PUBLISH: rule('publishing', 'publishable'), REMOVE: rule('removed', 'own') },
      publishing: { SUCCESS: 'published', FAILED: 'draft' },
      published: { HIDE: rule('hidden', 'own'), REMOVE: rule('removed', 'own') },
      hidden: { SHOW: rule('published', 'own'), REMOVE: rule('removed', 'own') },
      removed: {},
    },
  },
  dub: {
    initial: 'local', states: {
      local: { BEGIN_PUBLISH: rule('validating', 'canDub'), REMOVE: 'removed' },
      validating: { VALID: 'uploading', INVALID: 'local' },
      uploading: { UPLOADED: 'verifying', FAILED: 'local' },
      verifying: { CONFIRMED: 'published', FAILED: 'local' },
      published: { HIDE: 'hidden' },
      hidden: { SHOW: 'published', REMOVE: 'removed' },
      removed: {},
    },
  },
});

/** @param {keyof typeof MACHINES} name @param {string} state @param {Event|string} event @param {object} context */
export function transition(name, state, event, context = {}) {
  const machine = MACHINES[name];
  if (!machine) throw new TypeError(`Unknown machine: ${name}`);
  if (!Object.hasOwn(machine.states, state)) throw new TypeError(`Unknown state: ${name}.${state}`);
  const type = typeof event === 'string' ? event : event?.type;
  const target = machine.states[state][type];
  if (!target) return { from: state, to: state, event: type, accepted: false, reason: 'Illegal transition' };
  const dest = typeof target === 'string' ? target : target.to;
  const guard = typeof target === 'string' ? null : target.guard;
  if (guard && !G[guard](context)) {
    return { from: state, to: state, event: type, accepted: false, reason: `Guard ${guard} rejected` };
  }
  return { from: state, to: dest, event: type, accepted: true };
}

/** Runtime store for UI actors. Strictly one state per machine; no independent booleans. */
export class Actor {
  constructor(name, onChange = () => {}) {
    if (!MACHINES[name]) throw new TypeError(`Unknown machine ${name}`);
    this.name = name;
    this.state = MACHINES[name].initial;
    this.onChange = onChange;
  }
  send(event, context = {}) {
    const result = transition(this.name, this.state, event, context);
    if (result.accepted) {
      this.state = result.to;
      this.onChange(result);
    }
    return result;
  }
}

/** A request token guards against stale asynchronous completions on navigation. */
export class Epoch {
  constructor() { this.value = 0; }
  next() { return ++this.value; }
  current(token) { return token === this.value; }
  invalidate() { ++this.value; }
}
