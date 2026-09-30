// --- アプリケーションの状態（Single Source of Truth） ---
let state = {
    cardConfigs: [],       // デッキ構築時の設定
    cards: [],             // 生成された全カードデータのマスターリスト
    zones: {
        deck: [],              // 山札（カードIDの配列）
        hand: [],          // 手札（カードIDの配列）
        field1: [],         // フィールド（カードIDの配列）
        field2: [],         // フィールド（カードIDの配列）
        temp: [],          // めくり置き場（カードIDの配列）
        free: [],          // 一時置き場（カードIDの配列）
        trash: [],         // カードトラッシュ（カードデータの配列）
        remove: []         // 除外ゾーン（カードデータの配列）
    },
    core: {
        void: 999999999999999999114514,
        reserve: 3,
        life: 5,
        trash: 0,
        choice: 0
    },
    soulCore: {
        location: 'reserve', // 'reserve', 'trash', または カードID
    },
    selected: {
        type: null,          // 'card' または 'soul'
        id: null             // 選択されたカードID または null
    },
    modal: {
        mode: 'card-trash',  // 'card-trash' または 'remove'
        selectedId: null     // モーダル内で選択中のカードID
    },
    loadedImage: null
};

// --- 1. 画像プレビュー＆分割線表示ボタン ---
document.getElementById('preview-btn').addEventListener('click', () => {
    const fileInput = document.getElementById('deck-image-input');
    if (fileInput.files.length === 0) {
        alert('デッキ画像を選択してください');
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            state.loadedImage = img;
            showSplitPreview(img);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
});

function showSplitPreview(img) {
    const cols = parseInt(document.getElementById('grid-cols').value);
    const rows = parseInt(document.getElementById('grid-rows').value);
    const topOffset = parseInt(document.getElementById('top-offset')?.value) || 0;
    const canvas = document.getElementById('canvas-preview');
    const ctx = canvas.getContext('2d');

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // 分割線を描画
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = Math.max(2, img.width / 300);

    const pWidth = img.width / cols;
    // カードエリアの高さを基準に高さを算出
    const cardAreaHeight = img.height - topOffset;
    const pHeight = cardAreaHeight / rows;

    for (let c = 1; c < cols; c++) {
        ctx.beginPath();
        ctx.moveTo(c * pWidth, topOffset);
        ctx.lineTo(c * pWidth, img.height);
        ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
        ctx.beginPath();
        ctx.moveTo(0, topOffset + (r * pHeight));
        ctx.lineTo(img.width, topOffset + (r * pHeight));
        ctx.stroke();
    }

    const overlaysContainer = document.getElementById('grid-overlays');
    overlaysContainer.innerHTML = '';
    state.cardConfigs = [];

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = pWidth;
    tempCanvas.height = pHeight;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            tempCtx.clearRect(0, 0, pWidth, pHeight);
            // 切り出し元のY座標に topOffset を加算
            const sourceX = c * pWidth;
            const sourceY = topOffset + (r * pHeight);
            tempCtx.drawImage(img, sourceX, sourceY, pWidth, pHeight, 0, 0, pWidth, pHeight);

            const dataUrl = tempCanvas.toDataURL();

            const configObj = { imgUrl: dataUrl, count: 3 };
            state.cardConfigs.push(configObj);

            const cellDiv = document.createElement('div');
            cellDiv.className = 'grid-overlay-cell';
            cellDiv.style.left = (c * 100 / cols) + '%';
            // cellDiv.style.top = (r * 100 / rows) + '%';
            cellDiv.style.top = ((topOffset + (r * pHeight)) / img.height) * 100 + '%';
            cellDiv.style.width = (100 / cols) + '%';
            // cellDiv.style.height = (100 / rows) + '%';
            cellDiv.style.height = (pHeight / img.height) * 100 + '%';

            const badge = document.createElement('div');
            badge.className = 'grid-counter-badge';

            const btnMinus = document.createElement('button');
            btnMinus.innerText = '-';
            const countSpan = document.createElement('span');
            countSpan.innerText = configObj.count;
            const btnPlus = document.createElement('button');
            btnPlus.innerText = '+';

            btnMinus.addEventListener('pointerup', (e) => {
                e.preventDefault();
                if (configObj.count > 0) {
                    configObj.count--;
                    countSpan.innerText = configObj.count;
                    updateTotalCount();
                }
            });
            btnPlus.addEventListener('pointerup', (e) => {
                e.preventDefault();
                configObj.count++;
                countSpan.innerText = configObj.count;
                updateTotalCount();
            });

            badge.appendChild(btnMinus);
            badge.appendChild(countSpan);
            badge.appendChild(btnPlus);
            cellDiv.appendChild(badge);
            overlaysContainer.appendChild(cellDiv);
        }
    }

    updateTotalCount();
    document.getElementById('preview-section').style.display = 'block';
}

function updateTotalCount() {
    let total = state.cardConfigs.reduce((sum, conf) => sum + conf.count, 0);
    const totalValElem = document.getElementById('total-count-val');
    const infoElem = document.getElementById('deck-total-info');

    totalValElem.innerText = total;
    infoElem.className = (total === 40) ? 'valid' : 'invalid';
}

// --- 4. 「決定」ボタンでゲーム開始 ---
document.getElementById('start-game-btn').addEventListener('pointerup', () => {
    let total = state.cardConfigs.reduce((sum, conf) => sum + conf.count, 0);
    if (total !== 40) {
        alert(`デッキの合計枚数が40枚ではありません（現在 ${total} 枚）。バトスピのデッキは40枚にする必要があります！`);
        return;
    }

    state.cards = [];
    state.zones = { deck: [], hand: [], field1: [], field2: [], temp: [], free: [], trash: [], remove: [] };
    state.soulCore = { location: 'reserve' };

    state.cardConfigs.forEach(conf => {
        for (let i = 0; i < conf.count; i++) {
            const cardId = 'card-' + Math.random().toString(36).substr(2, 9);
            state.cards.push({
                id: cardId,
                imgUrl: conf.imgUrl,
                core: 0,
                tapped: false
            });
            state.zones.deck.push(cardId);
        }
    });

    shuffleArray(state.zones.deck);

    document.getElementById('setup-container').style.display = 'none';
    document.getElementById('playmat').style.display = 'block';

    renderAll();

    for (let i = 0; i < 4; i++) {
        drawCard('hand');
    }
});
//testStart();
function testStart() {

    function createWhiteImage(width, height) {
        // 一時的にCanvasを作成
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const ctx = c.getContext('2d');

        // 真っ白に塗る
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // Canvasの内容をData URL（base64）に変換
        const dataUrl = c.toDataURL('image/png');

        // 新しいImageオブジェクトを作成し、そのData URLをソースとして設定
        const img = new Image();
        img.src = dataUrl;
        return img;
    }

    showSplitPreview(createWhiteImage(1201, 1362));
    state.cardConfigs[0].count = 0;
    state.cardConfigs[1].count = 1;

    state.cards = [];
    state.zones = { deck: [], hand: [], field1: [], field2: [], temp: [], free: [], trash: [], remove: [] };
    state.soulCore = { location: 'reserve' };

    state.cardConfigs.forEach(conf => {
        for (let i = 0; i < conf.count; i++) {
            const cardId = 'card-' + Math.random().toString(36).substr(2, 9);
            state.cards.push({
                id: cardId,
                imgUrl: conf.imgUrl,
                core: 0,
                tapped: false
            });
            state.zones.deck.push(cardId);
        }
    });

    shuffleArray(state.zones.deck);

    document.getElementById('setup-container').style.display = 'none';
    document.getElementById('playmat').style.display = 'block';

    renderAll();

    for (let i = 0; i < 4; i++) {
        drawCard('hand');
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// --- コア増減ロジック ---
function setupCoreCounter(type) {
    //右クリックでcohiceの中身を配置
    document.getElementById(`zone-${type}`).addEventListener('pointerup', (e) => {
        e.preventDefault(); // ブラウザ標準の「名前を付けて保存」などのメニューを出さないようにする
        if (state.core['choice'] > 0) {
            state.core[type] += state.core['choice'];
            state.core['choice'] = 0;
        }
        renderCores();
    });

    document.getElementById(`${type}-counter`).addEventListener('pointerup', (e) => {
        e.preventDefault();
        if (state.core[type] > 0) {
            state.core[type]--;
            state.core['choice']++;
        }
        renderCores();
    });
}
['void', 'reserve', 'life', 'trash'].forEach(setupCoreCounter);

function renderCores() {
    ['reserve', 'life', 'trash'].forEach(type => {
        document.getElementById(`${type}-count`).innerText = state.core[type];
    });
    document.querySelectorAll('[data-num="choice-count"]').forEach(x => {
        x.innerHTML = state.core["choice"];
    });
}

// --- カード検索ヘルパー ---
function findCardData(id) {
    return state.cards.find(c => c.id === id);
}

function removeCardFromAllZones(cardId) {
    Object.keys(state.zones).forEach(zoneName => {
        state.zones[zoneName] = state.zones[zoneName].filter(id => id !== cardId);
    });
}

// カードがフィールドから離れる、または別ゾーンへ移動するときの処理（コアとソウルコアの回収）
function handleCardLeavingField(cardId) {
    const card = findCardData(cardId);
    if (!card) return;

    if (card.core > 0) {
        state.core.reserve += card.core;
        card.core = 0;
    }

    // ソウルコアがこのカードに乗っていた場合、自動的にリザーブに戻す
    if (state.soulCore.location === cardId) {
        state.soulCore.location = 'reserve';
    }

    card.tapped = false;
}

// --- カード移動の共通アクション ---
function moveCard(cardId, targetZone) {
    // フィールドにいたカードが別の場所（手札・トラッシュ・デッキなど）に移動する場合の離脱チェック
    const wasInField = state.zones.field1.includes(cardId) || state.zones.field2.includes(cardId);
    if (wasInField && (targetZone !== 'field1' && targetZone !== 'field2')) {
        handleCardLeavingField(cardId);
    }

    removeCardFromAllZones(cardId);

    state.zones[targetZone].push(cardId);

    state.selected = { type: null, id: null };
    renderAll();
}

document.getElementById('reset-game-btn').addEventListener('pointerup', (e) => {
    e.preventDefault();

    // 1. 各ゾーンをクリアして、全カードを再び山札（deck）に戻す
    state.zones.deck = [];
    state.zones.hand = [];
    state.zones.field1 = [];
    state.zones.field2 = [];
    state.zones.temp = [];
    state.zones.free = [];
    state.zones.trash = [];
    state.zones.remove = [];

    // マスターリストから全カードIDを山札に再登録
    state.cards.forEach(card => {
        // カードのコアやタップ状態もリセット
        card.core = 0;
        card.tapped = false;
        state.zones.deck.push(card.id);
    });

    // 2. 山札をもう一度バラバラにする（最初の並び替え）
    shuffleArray(state.zones.deck);

    // 3. コアとソウルコアの初期化
    state.core = {
        choice: 0,
        reserve: 3,
        life: 5,
        trash: 0
    };
    state.soulCore = {
        location: 'reserve'
    };

    // 4. 選択状態のクリア
    state.selected = { type: null, id: null };

    // 5. 再描画
    renderAll();

    // 6. 初期手札（4枚）を配る
    for (let i = 0; i < 4; i++) {
        drawCard('hand');
    }
});

const actionBtn = document.querySelectorAll('[data-act]');
actionBtn.forEach(button => {
    switch (button.dataset.act) {
        case "draw":
            button.addEventListener('pointerup', () => drawCard('hand'));
            break;
        case "flip":
            button.addEventListener('pointerup', () => drawCard('temp'));
            break;
        case "deck-to-bottom":
            button.addEventListener('pointerup', () => {
                if (state.selected.type !== 'card') {
                    alert('山札の下へ送るカードを選択してください！');
                    return;
                }
                moveCard(state.selected.id, 'deck');
            });
            break;
        case "refresh":
            button.addEventListener('pointerup', () => {
                state.core.reserve += state.core.trash + 1;
                state.core.trash = 0;
                state.zones.field1.forEach(id => {
                    const cardData = findCardData(id);
                    cardData.tapped = false;
                });
                state.zones.field2.forEach(id => {
                    const cardData = findCardData(id);
                    cardData.tapped = false;
                });
                renderAll();
            });
            break;
    }
});

// --- ゾーンごとの一括操作ボタン ---
document.getElementById('temp-to-hand-btn').addEventListener('pointerup', () => {
    moveAllTempCards(state.zones.temp, state.zones.hand);
});

document.getElementById('temp-to-trash-btn').addEventListener('pointerup', () => {
    moveAllTempCards(state.zones.temp, state.zones.trash);
});

document.getElementById('temp-to-bottom-btn').addEventListener('pointerup', () => {
    moveAllTempCards(state.zones.temp, state.zones.deck);
});

document.getElementById('free-to-trash-btn').addEventListener('pointerup', () => {
    moveAllTempCards(state.zones.free, state.zones.trash);
});

document.getElementById('free-to-bottom-btn').addEventListener('pointerup', () => {
    moveAllTempCards(state.zones.free, state.zones.deck);
});

function moveAllTempCards(sourceZone, targetZone) {
    sourceZone.forEach(id => {
        handleCardLeavingField(id);
        targetZone.push(id);
    })
    sourceZone.length = 0;
    renderAll();
}



function drawCard(targetZone) {
    if (state.zones.deck.length === 0) {
        alert('山札がありません！');
        return;
    }
    const cardId = state.zones.deck.shift();

    // 山札から引く際もフィールド（元々フィールドにいた扱いはないが安全のため）からの離脱チェック
    handleCardLeavingField(cardId);

    state.zones[targetZone].push(cardId);
    renderAll();
}



// --- ドラッグ＆ドロップ風 クリック移動ゾーンの定義 ---
const dropZones = [
    { elem: document.getElementById('zone-hand'), zoneName: 'hand' },
    { elem: document.getElementById('zone-field1'), zoneName: 'field1' },
    { elem: document.getElementById('zone-field2'), zoneName: 'field2' },
    { elem: document.getElementById('zone-temp'), zoneName: 'temp' },
    { elem: document.getElementById('zone-free'), zoneName: 'free' },
    { elem: document.getElementById('zone-reserve'), zoneName: 'soul-reserve' },
    { elem: document.getElementById('zone-trash'), zoneName: 'soul-trash' },
    { elem: document.getElementById('zone-card-trash'), zoneName: 'card-trash' },
    { elem: document.getElementById('zone-remove'), zoneName: 'remove' }
];

dropZones.forEach(zone => {
    zone.elem.addEventListener('pointerup', (e) => {
        e.preventDefault();
        const isBackground = (
            e.target === zone.elem ||
            e.target.classList.contains('zone-title') ||
            e.target.id.includes('content') ||
            e.target.id.includes('holder') ||
            e.target.id.includes('container')
        );

        if (!isBackground) return;

        if (zone.zoneName === 'card-trash' || zone.zoneName === 'remove') {
            if (state.selected.type === 'card') {
                moveCard(state.selected.id, zone.zoneName === 'card-trash' ? 'trash' : 'remove');
            } else {
                openModal(zone.zoneName);
            }
            return;
        }

        if (zone.zoneName === 'soul-reserve' || zone.zoneName === 'soul-trash') {
            if (state.selected.type === 'soul') {
                state.soulCore.location = (zone.zoneName === 'soul-reserve') ? 'reserve' : 'trash';
                state.selected = { type: null, id: null };
                renderAll();
            }
            return;
        }

        if (state.selected.type === 'card') {
            moveCard(state.selected.id, zone.zoneName);
        }
    });
});

// ソウルコア自体のクリック選択
document.getElementById('soul-core').addEventListener('pointerup', (e) => {
    e.preventDefault();
    state.selected = { type: 'soul', id: null };
    renderAll();
});

// --- 描画エンジン（Render） ---
function renderAll() {
    renderCores();
    renderDeckCount();
    renderCountsDisplay();
    renderZones();
    renderSoulCore();
    renderModal();
}

function renderDeckCount() {
    document.querySelectorAll('[data-num="deck-count"]').forEach(x => {
        x.innerText = state.zones.deck.length;
    });
}

function renderCountsDisplay() {
    document.getElementById('card-trash-count').innerText = state.zones.trash.length;
    document.getElementById('remove-count').innerText = state.zones.remove.length;
}

function renderZones() {
    const zoneContainers = {
        hand: document.getElementById('zone-hand'),
        field1: document.getElementById('field1-cards-container'),
        field2: document.getElementById('field2-cards-container'),
        temp: document.getElementById('temp-cards-container'),
        free: document.getElementById('free-cards-container')
    };

    Object.keys(zoneContainers).forEach(zoneName => {
        const container = zoneContainers[zoneName];
        container.innerHTML = '';
        state.zones[zoneName].forEach(cardId => {
            const cardData = findCardData(cardId);
            const cardElem = createCardElement(cardData, zoneName === 'field1' || zoneName === 'field2');
            container.appendChild(cardElem);
        });
    });
}

function createCardElement(cardData, isInField) {
    const card = document.createElement('div');
    card.className = 'card';
    if (cardData.tapped && isInField) card.classList.add('tapped');
    if (isInField) card.classList.add('in-field');
    if (state.selected.type === 'card' && state.selected.id === cardData.id) {
        card.classList.add('selected');
    }
    card.id = cardData.id;

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'card-img-wrapper';

    // 1. 下の層：見た目の画像（タッチを無効化してブラウザのズームを防ぐ）
    const img = document.createElement('img');
    img.src = cardData.imgUrl;
    img.style.pointerEvents = 'none';
    img.style['touch-action'] = 'none';
    imgWrapper.appendChild(img);

    // 2. 上の層：透明な操作用オーバーレイ（CSSクラスを使用）
    const touchOverlay = document.createElement('div');
    touchOverlay.className = 'card-touch-overlay';
    imgWrapper.appendChild(touchOverlay);

    card.appendChild(imgWrapper);

    const ui = document.createElement('div');
    ui.className = 'card-ui';
    card.appendChild(ui);

    // コアバッジの描画
    const coreBadge = document.createElement('div');
    coreBadge.className = 'core-badge';
    let coreText = `C:${cardData.core}`;
    if (state.soulCore.location === cardData.id) {
        coreText += `<span class="soul-core-badge">+1</span>`;
    }
    coreBadge.innerHTML = `<span>${coreText}</span>`;

    ui.addEventListener('pointerup', (e) => {
        e.preventDefault();
        if (cardData.core > 0) {
            cardData.core--;
            state.core['choice']++;
        }
        renderAll();
    });
    ui.appendChild(coreBadge);

    // ソウルコアが乗っている場合のインジケーター描画
    if (state.soulCore.location === cardData.id) {
        const soulIndicator = document.createElement('div');
        soulIndicator.className = 'card-soul-indicator';
        if (state.selected.type === 'soul') soulIndicator.classList.add('selected');
        soulIndicator.innerHTML = 'SOUL<br>CORE';

        soulIndicator.addEventListener('pointerup', (e) => {
            e.preventDefault();
            state.selected = { type: 'soul', id: null };
            renderAll();
        });
        ui.appendChild(soulIndicator);
    }

    // カードデータに初期値がなければ持たせる
    if (cardData.lastTapTime === undefined) {
        cardData.lastTapTime = 0;
    }

    // タップ判定は透明オーバーレイ側で行う
    touchOverlay.addEventListener('pointerup', (e) => {
        e.preventDefault();

        const currentTime = new Date().getTime();
        const tapInterval = currentTime - cardData.lastTapTime;

        if (tapInterval < 400 && tapInterval > 0 && isInField) {
            cardData.tapped = !cardData.tapped;
            cardData.lastTapTime = 0;
            renderAll();
        } else {
            if (state.core['choice'] > 0 && isInField) {
                cardData.core += state.core['choice'];
                state.core['choice'] = 0;
                renderAll();
                return;
            }
            if (state.selected.type === 'soul' && isInField) {
                state.soulCore.location = cardData.id;
                state.selected = { type: null, id: null };
                renderAll();
                return;
            }

            state.selected = { type: 'card', id: cardData.id };
            renderAll();

            cardData.lastTapTime = currentTime;
        }
    });

    // 右クリックでプレビュー
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const previewModal = document.getElementById('card-preview-modal');
        const previewImg = document.getElementById('card-preview-img');
        previewImg.src = cardData.imgUrl;
        previewModal.style.display = 'flex';
    });

    document.getElementById('card-preview-modal').addEventListener('pointerup', (e) => {
        e.preventDefault();
        document.getElementById('card-preview-modal').style.display = 'none';
    });

    return card;
}

// 【変更後：renderSoulCore】
function renderSoulCore() {
    // 1. 既存のソウルコア要素があれば一旦画面から消す（重複防止）
    let soulCoreElem = document.getElementById('soul-core');
    if (soulCoreElem) {
        soulCoreElem.remove();
    }

    // もしソウルコアがカード上にある場合は、createCardElement 側で描画されるためここでは何もしない
    if (typeof state.soulCore.location === 'string' && state.soulCore.location.startsWith('card-')) {
        return;
    }

    // 2. ソウルコアのDOM要素を新規作成
    soulCoreElem = document.createElement('div');
    soulCoreElem.id = 'soul-core';
    soulCoreElem.className = 'soul-core-elem'; // 必要に応じてクラス名
    if (state.selected.type === 'soul') {
        soulCoreElem.classList.add('selected');
    }
    soulCoreElem.innerHTML = 'SOUL<br>CORE';

    // クリックされたらソウルコアを選択状態にする
    soulCoreElem.addEventListener('pointerup', (e) => {
        e.preventDefault();
        state.selected = { type: 'soul', id: null };
        renderAll();
    });

    // 3. 現在地（reserve または trash）のホルダーへ配置
    if (state.soulCore.location === 'reserve') {
        const holder = document.getElementById('reserve-soul-holder');
        if (holder) holder.appendChild(soulCoreElem);
    } else if (state.soulCore.location === 'trash') {
        const holder = document.getElementById('trash-soul-holder');
        if (holder) holder.appendChild(soulCoreElem);
    }
}

// --- モーダル関連（トラッシュ・除外ゾーン一覧） ---
function openModal(mode) {
    state.modal.mode = mode;
    state.modal.selectedId = null;
    document.getElementById('list-modal').style.display = 'flex';
    renderModal();
}

function closeModal() {
    document.getElementById('list-modal').style.display = 'none';
}

document.getElementById('close-modal-btn').addEventListener('pointerup', closeModal);

function renderModal() {
    const mode = state.modal.mode;
    // targetList にはカードIDの配列が入るようになる
    const targetList = (mode === 'card-trash') ? state.zones.trash : state.zones.remove;

    const titleElem = document.getElementById('modal-title');
    titleElem.innerHTML = `${mode === 'card-trash' ? 'カードトラッシュ' : '除外ゾーン'}一覧 (<span id="modal-count">${targetList.length}</span>枚)`;

    const container = document.getElementById('modal-cards-container');
    container.innerHTML = '';

    if (targetList.length === 0) {
        container.innerHTML = `<p style="color:#aaa;">${mode === 'card-trash' ? 'トラッシュ' : '除外'}にカードはありません。</p>`;
    }

    // IDの配列を回して、マスターからカードデータを取得して描画
    targetList.forEach(cardId => {
        const cardData = findCardData(cardId);
        if (!cardData) return;

        const card = document.createElement('div');
        card.className = 'card in-field';
        if (cardData.tapped) card.classList.add('tapped');
        if (state.modal.selectedId === cardData.id) card.classList.add('selected');

        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'card-img-wrapper';
        const img = document.createElement('img');
        img.src = cardData.imgUrl;
        imgWrapper.appendChild(img);
        card.appendChild(imgWrapper);

        card.addEventListener('pointerup', (e) => {
            e.preventDefault();
            if (state.modal.selectedId === cardData.id) {
                state.modal.selectedId = null;
            } else {
                state.modal.selectedId = cardData.id;
            }
            renderModal();
        });

        container.appendChild(card);
    });

    updateModalToolbarState();
}

function updateModalToolbarState() {
    const hasSelection = state.modal.selectedId !== null;
    document.getElementById('modal-to-hand-btn').disabled = !hasSelection;
    document.getElementById('modal-to-field-btn').disabled = !hasSelection;
    document.getElementById('modal-to-deck-btn').disabled = !hasSelection;
    document.getElementById('modal-to-free-btn').disabled = !hasSelection;

    const statusText = document.getElementById('modal-selection-status');
    if (hasSelection) {
        statusText.innerText = 'カード選択中 (上のボタンで移動先を選択)';
        statusText.style.color = '#4CAF50';
    } else {
        statusText.innerText = 'カードを選択してください';
        statusText.style.color = '#ffeb3b';
    }
}

// モーダルからの移動ボタン
document.getElementById('modal-to-hand-btn').addEventListener('pointerup', () => moveCardFromModal('hand'));
document.getElementById('modal-to-field-btn').addEventListener('pointerup', () => moveCardFromModal('field1'));
document.getElementById('modal-to-deck-btn').addEventListener('pointerup', () => moveCardFromModal('deck'));
document.getElementById('modal-to-free-btn').addEventListener('pointerup', () => moveCardFromModal('free'));

function moveCardFromModal(targetZone) {
    const cardId = state.modal.selectedId;
    if (!cardId) return;

    handleCardLeavingField(cardId);

    const sourceList = (state.modal.mode === 'card-trash') ? state.zones.trash : state.zones.remove;
    const index = sourceList.indexOf(cardId); // IDのインデックスを探す

    if (index !== -1) {
        sourceList.splice(index, 1); // 配列からIDを削除
        state.modal.selectedId = null;

        state.zones[targetZone].push(cardId);

        renderAll();
        renderModal();
    }
}

// プレイマットの背景クリックで選択解除
document.getElementById('playmat').addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (e.target.id === 'playmat') {
        state.selected = { type: null, id: null };
        renderAll();
    }
});

//効いてた。各エリアのズームとかは起きなくなった。カード上のズームだけおきる。テストいる
//テストの結果300だと足りない500でもギリ起こる。600で不都合ないと思いたい
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 600) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, { passive: false });

