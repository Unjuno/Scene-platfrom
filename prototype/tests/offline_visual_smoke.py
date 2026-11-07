"""Use Chromium's set_content for visual/interaction QA if localhost navigation is blocked.

This deliberately runs from an opaque origin. It cannot verify IndexedDB, a real
microphone, login, a server, publishing, or full origin-specific runtime behavior.
No mock backend is presented as a production pass. Run `scripts/build_standalone.py`
first to ensure assets and modules are embedded.
"""
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
import json

ROOT = Path(__file__).resolve().parents[2]
HTML = (ROOT / 'scene-redesign-preview.html').read_text().replace('<script type="module">', '<script>')
OUT = ROOT / 'screenshots'
OUT.mkdir(exist_ok=True)
LOG = []

def record(name, ok, details=None):
    LOG.append({'check': name, 'pass': bool(ok), 'details': details})
    assert ok, f'{name}: {details}'

def capture(page, name):
    page.screenshot(path=str(OUT / name), full_page=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width, height in [(1440, 900), (390, 844), (320, 740)]:
        context = browser.new_context(viewport={'width':width, 'height':height}, is_mobile=(width < 700), has_touch=(width < 700), device_scale_factor=1)
        page = context.new_page()
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(HTML, wait_until='load')
        page.get_by_role('heading', name='ひとつの絵に、 いくつもの声。').wait_for(timeout=9000)
        capture(page, f'01-lobby-{width}.png')
        record(f'lobby-{width}', page.get_by_role('button', name='幕を開ける').count() == 1)
        page.get_by_role('button', name='幕を開ける').click()
        page.locator('.theater-overlay').get_by_text('01 / 03').wait_for(timeout=10000)
        page.get_by_role('button', name='次の絵へ').click()
        record(f'theater-next-{width}', page.locator('.theater-overlay').inner_text().strip() == '02 / 03')
        page.get_by_role('button', name='次の絵へ').click()
        record(f'theater-last-{width}', page.locator('.theater-overlay').inner_text().strip() == '03 / 03')
        page.get_by_role('button', name='鑑賞を終える').click()
        record(f'theater-ended-{width}', page.get_by_text('最後までご覧いただき').count() == 1)
        capture(page, f'02-theater-{width}.png')
        page.get_by_role('button', name='最初から観る').click()
        record(f'theater-restart-{width}', page.locator('.theater-overlay').inner_text().strip() == '01 / 03')
        page.evaluate("location.hash='#/explore'")
        page.locator('#search-works').wait_for()
        page.locator('#search-works').fill('存在しない作品を探す')
        record(f'filter-empty-{width}', page.get_by_text('条件に合う作品がありません').is_visible())
        card=page.locator('.work-card').first
        record(f'filter-card-hidden-{width}', card.evaluate('(el) => getComputedStyle(el).display === "none"'))
        page.evaluate("location.hash='#/create'")
        page.locator('#work-title').wait_for()
        page.locator('#work-title').fill('試作テスト作品')
        record(f'creator-image-picker-{width}', page.locator('#image-picker[accept="image/jpeg,image/png,image/webp"]').count() == 1)
        page.get_by_role('button', name='台詞を追加').click()
        record(f'creator-multiple-cues-{width}', page.locator('[data-field="cue-text"]').count() == 2)
        record(f'creator-unsaved-status-{width}', page.locator('#editor-save-status').inner_text().startswith('未保存'))
        capture(page, f'03-creator-{width}.png')
        page.evaluate("location.hash='#/perform'")
        page.get_by_role('heading', name='その物語に、あなたの声を。').wait_for()
        capture(page, f'04-perform-{width}.png')
        page.evaluate("location.hash='#/studio/sample-moon'")
        page.get_by_role('heading', name='声を、重ねる。').wait_for()
        record(f'recorder-local-warning-{width}', page.get_by_text('公開機能は未接続です。',exact=False).count() > 0)
        capture(page, f'05-studio-{width}.png')
        page.evaluate("location.hash='#/library'")
        page.get_by_role('heading', name='ここに、あなたの物語が残る。').wait_for()
        capture(page, f'06-library-{width}.png')
        page.evaluate("location.hash='#/lobby'")
        page.locator('.stage-hero').wait_for()
        record(f'no-js-errors-{width}', not errors, errors)
        dims=page.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})')
        record(f'no-horizontal-overflow-{width}',dims['scrollWidth']<=dims['width'],dims)
        context.close()
    browser.close()
(OUT/'offline-results.json').write_text(json.dumps(LOG,ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(LOG),'failures':0, 'environment':'opaque origin (set_content), no actual IndexedDB/mic/backend', 'results_file':str(OUT/'offline-results.json')},ensure_ascii=False))
