import test from 'node:test';
import assert from 'node:assert/strict';
import { MACHINES, Actor, Epoch, transition } from '../src/machines.mjs';
import { newWork, scene, cue, validWork, validDraft, moveScene, canPublishDub, safeText } from '../src/domain.mjs';

test('all transition destinations exist', () => {
  for (const [name, machine] of Object.entries(MACHINES)) {
    for (const events of Object.values(machine.states)) {
      for (const target of Object.values(events)) {
        assert.ok(Object.hasOwn(machine.states, typeof target === 'string' ? target : target.to), name);
      }
    }
  }
});

test('auth: no transition from anonymous straight to authenticated', () => {
  assert.equal(transition('auth', 'anonymous', 'SUCCESS').accepted, false);
  assert.equal(transition('auth', 'anonymous', 'LOGIN').to, 'authenticating');
  assert.equal(transition('auth', 'authenticating', 'SUCCESS').to, 'authenticated');
  assert.equal(transition('auth', 'authenticated', 'EXPIRED').to, 'expired');
});

test('player: voice required for autoplay; manual forward remains ready', () => {
  assert.equal(transition('player', 'ready', 'PLAY', {hasAudio:false}).accepted, false);
  assert.equal(transition('player', 'ready', 'NEXT').to, 'ready');
  assert.equal(transition('player', 'ready', 'PLAY', {hasAudio:true}).to, 'playing');
  assert.equal(transition('player', 'playing', 'PAUSE').to, 'paused');
  assert.equal(transition('player', 'paused', 'PLAY', {hasAudio:true}).to, 'playing');
});

test('editor: no saving before validation', () => {
  assert.equal(transition('editor', 'editing', 'SUCCESS').accepted, false);
  assert.equal(transition('editor', 'editing', 'VALIDATE').to, 'validating');
  assert.equal(transition('editor', 'validating', 'VALID', {valid:false}).accepted, false);
  assert.equal(transition('editor', 'validating', 'VALID', {valid:true}).to, 'saving');
  assert.equal(transition('editor', 'saving', 'SUCCESS').to, 'saved');
});

test('recorder: cannot publish or stop prior to recording', () => {
  const actor = new Actor('recorder');
  assert.equal(actor.send('STOP').accepted, false);
  assert.equal(actor.send('REQUEST').to, 'requesting');
  assert.equal(actor.send('GRANTED').to, 'ready');
  assert.equal(actor.send('START').to, 'recording');
  assert.equal(actor.send('START').accepted, false);
  assert.equal(actor.send('STOP').to, 'stopping');
  assert.equal(actor.send('SAVED').to, 'reviewing');
});

test('work: requires owner, valid document, persisted asset before publish', () => {
  const invalid = { isOwner:true, valid:true, persisted:false };
  assert.equal(transition('work','draft','BEGIN_PUBLISH',invalid).accepted,false);
  assert.equal(transition('work','draft','BEGIN_PUBLISH',{ ...invalid,persisted:true }).to,'publishing');
  assert.equal(transition('work','published','HIDE',{isOwner:false}).accepted,false);
});

test('dub: revoke or wrong revision prevents publication', () => {
  const ctx = {authenticated:true, dubPermission:'allow',revisionValid:true};
  assert.equal(transition('dub','local','BEGIN_PUBLISH',{...ctx,dubPermission:'deny'}).accepted,false);
  assert.equal(transition('dub','local','BEGIN_PUBLISH',{...ctx,revisionValid:false}).accepted,false);
  assert.equal(transition('dub','local','BEGIN_PUBLISH',ctx).to,'validating');
  assert.equal(transition('dub','verifying','CONFIRMED').to,'published');
  assert.equal(transition('dub','uploading','CONFIRMED').accepted,false);
});

test('ratings: cannot submit without authentication', () => {
  assert.equal(transition('rating','idle','SUBMIT',{authenticated:false}).accepted,false);
  assert.equal(transition('rating','idle','SUBMIT',{authenticated:true}).to,'submitting');
});

test('epoch: stale network response is ignored', () => {
  const e = new Epoch(); const old = e.next(); const fresh = e.next();
  assert.equal(e.current(old), false); assert.equal(e.current(fresh), true); e.invalidate(); assert.equal(e.current(fresh), false);
});

test('a scene can carry multiple cues; no fixed duration', () => {
  const w = newWork(); w.title = '静かな駅'; w.scenes[0].image='assets/scene1.svg'; w.scenes[0].cues=[cue('一つ目'),cue('二つ目')];
  assert.deepEqual(validWork(w),[]); assert.equal(w.scenes[0].cues.length,2); assert.equal('duration' in w.scenes[0],false);
});

test('scene reorder preserves identity and order', () => {
  const w=newWork(); w.scenes=[scene('a'),scene('b'),scene('c')];
  const result=moveScene(w,0,2); assert.deepEqual(result.scenes.map(x=>x.image),['b','c','a']);
  assert.deepEqual(w.scenes.map(x=>x.image),['a','b','c']);
});

test('publication requires authenticated work revision + author permission', () => {
  const w = newWork(); w.visibility='public';w.dubPermission='allow';
  assert.equal(canPublishDub(w,'actor',true,1),true);
  assert.equal(canPublishDub(w,'actor',false,1),false);
  assert.equal(canPublishDub(w,'actor',true,2),false);
  w.dubPermission='deny';assert.equal(canPublishDub(w,'actor',true,1),false);
});

test('user input is escaped before HTML interpolation',()=>{
  assert.equal(safeText('<script>alert("x")</script>'),'&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('incomplete draft can be saved without publishable title or image', () => {
  const w = newWork();
  assert.deepEqual(validDraft(w), []);
  assert.ok(validWork(w).length >= 2);
});
