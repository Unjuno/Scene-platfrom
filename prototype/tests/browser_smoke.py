"""Local Chromium smoke and screenshot capture, not a production validation."""
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
import json
import os
BASE = os.environ.get('SCENE_URL', 'http://127.0.0.1:8000')

ROOT = Path(__file__).resolve().parent.parent
SCREEN = ROOT.parent / 'screenshots'
SCREEN.mkdir(exist_ok=True)
fixture = SCREEN / 'test-scene.png'
img = Image.new('RGB',(900,560),(38,72,91))
draw=ImageDraw.Draw(img)
draw.ellipse((620,65,780,225), fill=(225,202,158))
draw.polygon([(0,450),(250,290),(530,470),(900,290),(900,560),(0,560)], fill=(20,47,58))
draw.rectangle((220,330,380,530),fill=(70,78,82))
img.save(fixture)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
    desktop = browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1,permissions=['microphone'])
    page = desktop.new_page()
    exceptions=[]
    page.on('pageerror',lambda e: exceptions.append(str(e)))
    page.goto(f'{BASE}/#/lobby',wait_until='networkidle')
    page.screenshot(path=str(SCREEN/'01-lobby-desktop.png'),full_page=True)
    results.append(['lobby',page.get_by_role('heading',name='ひとつの絵に、').count() or page.locator('.hero-copy h1').count()])
    page.get_by_role('button',name='幕を開ける').click()
    page.locator('.theater-stage img').wait_for()
    results.append(['theater-start',page.locator('.theater-overlay').inner_text()])
    page.get_by_role('button',name='次の絵へ').click()
    results.append(['theater-next',page.locator('.theater-overlay').inner_text()])
    page.screenshot(path=str(SCREEN/'02-theater-desktop.png'),full_page=True)
    page.get_by_role('button',name='次の絵へ').click()
    page.get_by_role('button',name='鑑賞を終える').click()
    results.append(['theater-end',page.get_by_text('最後までご覧いただき').count()])
    page.get_by_role('button',name='最初から観る').click()
    results.append(['theater-restart',page.locator('.theater-overlay').inner_text()])
    page.goto(f'{BASE}/#/create',wait_until='networkidle')
    page.locator('#work-title').fill('ブラウザ検証作品')
    page.locator('#work-description').fill('静止画と台本の試作')
    page.locator('#image-picker').set_input_files(str(fixture))
    page.locator('img[alt="現在のシーン画像"]').wait_for()
    page.locator('[data-field="cue-text"]').first.fill('ここで物語がはじまる。')
    page.get_by_role('button',name='台詞を追加').click()
    page.locator('[data-field="cue-text"]').last.fill('そして、もう一つの言葉。')
    page.screenshot(path=str(SCREEN/'03-creator-desktop.png'),full_page=True)
    results.append(['creator-cues',page.locator('[data-field="cue-text"]').count()])
    page.get_by_role('button',name='下書きを保存').click()
    page.get_by_text('この端末に下書きを保存しました').wait_for()
    results.append(['saved-toast',page.get_by_text('この端末に下書きを保存しました').count()])
    page.goto(f'{BASE}/#/library',wait_until='networkidle')
    results.append(['library-title',page.get_by_text('ブラウザ検証作品').count()])
    page.reload(wait_until='networkidle')
    results.append(['library-after-reload',page.get_by_text('ブラウザ検証作品').count()])
    page.goto(f'{BASE}/#/perform',wait_until='networkidle')
    page.screenshot(path=str(SCREEN/'04-perform-desktop.png'),full_page=True)
    page.goto(f'{BASE}/#/studio/sample-moon',wait_until='networkidle')
    results.append(['studio-load',page.get_by_role('heading',name='声を、重ねる。').count()])
    page.screenshot(path=str(SCREEN/'05-studio-desktop.png'),full_page=True)
    page.get_by_role('button',name='マイクを準備').click()
    page.get_by_role('button',name='録音開始').wait_for(timeout=15000)
    page.get_by_role('button',name='録音開始').click()
    page.get_by_role('button',name='録音を停止').wait_for(timeout=15000)
    page.wait_for_timeout(800)
    page.get_by_role('button',name='録音を停止').click()
    page.get_by_text('録音テイク',exact=False).wait_for(timeout=15000)
    page.get_by_role('button',name='音声を書き出す').wait_for(timeout=15000)
    results.append(['recorded-take',page.get_by_role('button',name='音声を書き出す').count()])
    results.append(['page-errors',exceptions])
    desktop.close()
    for width,height in [(390,844),(320,740)]:
        mobile=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,is_mobile=True,has_touch=True)
        p2=mobile.new_page()
        err=[]
        p2.on('pageerror',lambda e:err.append(str(e)))
        for route in ['lobby','explore','create','perform','theater/sample-moon']:
            p2.goto(f'{BASE}/#/{route}',wait_until='networkidle')
            p2.wait_for_timeout(120)
            dims=p2.evaluate('({innerWidth,scrollWidth:document.documentElement.scrollWidth})')
            results.append([f'mobile-{width}-{route}',dims])
            if width==390:
                p2.screenshot(path=str(SCREEN/f'06-mobile-{route.replace("/","-")}.png'),full_page=True)
        results.append([f'mobile-{width}-pageerrors',err])
        mobile.close()
    browser.close()
(SCREEN/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
