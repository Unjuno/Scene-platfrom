/** Pure domain model. Work revisions and permission checks must ALSO be enforced on the server. */
export function uid(prefix = 'id') {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}
export function cue(text = '', speaker = '') { return { id: uid('cue'), speaker, text }; }
export function scene(image = '', title = '') { return { id: uid('scene'), title, image, cues: [cue()] }; }
export function newWork() {
  return {
    id: uid('work'), ownerId: 'local-demo', version: 1, title: '', description: '',
    visibility: 'local-draft', dubPermission: 'deny', scenes: [scene()],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'local',
  };
}
export function validDraft(work) {
  const errors = [];
  if (!work || typeof work !== 'object') return ['下書きのデータがありません'];
  if (!Array.isArray(work.scenes) || work.scenes.length === 0) errors.push('シーンがありません');
  else for (const [i, entry] of work.scenes.entries()) {
    if (!Array.isArray(entry.cues)) errors.push(`シーン${i + 1}の台本が不正です`);
    else if (entry.cues.some(c => typeof c.text !== 'string')) errors.push(`シーン${i + 1}の台詞が不正です`);
  }
  if (!['allow','deny'].includes(work.dubPermission)) errors.push('アフレコ許可値が不正です');
  return errors;
}
export function validWork(work) {
  const errors = [];
  if (!work || typeof work !== 'object') return ['作品データがありません'];
  if (!String(work.title ?? '').trim()) errors.push('作品名を入力してください');
  if (!Array.isArray(work.scenes) || work.scenes.length === 0) errors.push('シーンを1枚以上追加してください');
  else for (const [i, s] of work.scenes.entries()) {
    if (!s.image) errors.push(`シーン${i + 1}の画像を選んでください`);
    if (!Array.isArray(s.cues)) errors.push(`シーン${i + 1}の台本が不正です`);
    else for (const c of s.cues) if (typeof c.text !== 'string') errors.push(`シーン${i + 1}の台詞が不正です`);
  }
  if (!['allow', 'deny'].includes(work.dubPermission)) errors.push('アフレコ許可値が不正です');
  return errors;
}
export function moveScene(work, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= work.scenes.length || to >= work.scenes.length) return work;
  const scenes = [...work.scenes];
  scenes.splice(to, 0, scenes.splice(from, 1)[0]);
  return { ...work, scenes };
}
export function canPublishDub(work, actorId, isAuthenticated, revision) {
  return Boolean(isAuthenticated && actorId && work && work.visibility === 'public' && work.dubPermission === 'allow' && work.version === revision);
}
export function safeText(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
export function makeManifest(work) {
  return {
    schema: 'scene-work-v1', id: work.id, version: work.version, title: work.title,
    description: work.description, visibility: work.visibility,
    dubPermission: work.dubPermission,
    scenes: work.scenes.map(s => ({ id: s.id, title: s.title, image: /^data:/.test(s.image) ? '[画像は別途書き出しが必要]' : s.image, cues: s.cues })),
  };
}
