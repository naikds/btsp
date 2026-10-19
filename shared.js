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
        void: 9999,
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
    }
};

let cachedSoulCoreElem = null;

window.addEventListener('DOMContentLoaded', () => {
    console.log("子ウィンドウの準備ができました！");

    // 親ウィンドウが存在するか確認しつつ、親の関数を呼ぶ
    if (window.opener && !window.opener.closed) {
        // 親側に用意しておいた「子から呼ばれる用の関数」を実行する
        window.opener.onChildReady(); 
    }
});

window.initSharedBoard = function(data){
    console.log('initが呼ばれた',data);
    if (!cachedSoulCoreElem) {
        cachedSoulCoreElem = document.createElement('div');
        cachedSoulCoreElem.id = 'soul-core';
        cachedSoulCoreElem.className = 'soul-core-elem';
        cachedSoulCoreElem.innerHTML = 'SOUL<br>CORE';
        cachedSoulCoreElem.addEventListener('pointerup', (e) => {
            e.stopPropagation();
            e.preventDefault();
            state.selected = { type: 'soul', id: null };
            renderAll();
        });
    }

    // 2. 40枚分のカードデータとDOMを生成する
    state.cards = [];
    data.forEach(conf => {
        const cardId = conf.id;
        
        const cardData = {
            id: cardId,
            imgUrl: conf.imgUrl,
            core: 0,
            tapped: false,
            heavyTapped: false,
            lastTapTime: 0,
            element: null // ここにDOMを保持
        };

        console.log('カードdom生成',cardData);

        // カードのDOMを生成してキャッシュ
        cardData.element = createCardElementOnce(cardData);
        state.cards.push(cardData);
        state.zones.deck.push(cardId);     
    });
}

window.updateSharedBoard = function(data) {
    console.log("親からデータを受け取ったよ:", data);
    // 受け取ったデータを元に盤面の表示を更新する処理
    state.zones = data.zones;
    state.core = data.core;
    state.soulCore = data.soulCore;

    state.cards.forEach(card=>{
        let paCard = data.cards.find(c=>c.id === card.id);
        card.core = paCard.core;
        card.tapped = paCard.tapped;
        card.heavyTapped = paCard.heavyTapped;
    })

    document.getElementById('handCount').innerHTML = `手札：${data.handCount}枚`

    renderZones();
    renderCores();
    renderSoulCore();
};

window.showPreviewModal = function(data){
    const previewModal = document.getElementById('card-preview-modal');
    const previewImg = document.getElementById('card-preview-img');
    previewImg.src = data;
    previewModal.style.display = 'flex';
}
window.closePreviewModal = function(){
    const previewImg = document.getElementById('card-preview-modal');
    previewImg.style.display = 'none';
}

function renderZones() {
    const zoneContainers = {
        field1: document.getElementById('field1-cards-container'),
        field2: document.getElementById('field2-cards-container'),
        temp: document.getElementById('temp-cards-container'),
        free: document.getElementById('free-cards-container')
    };

    Object.keys(zoneContainers).forEach(zoneName => {
        const container = zoneContainers[zoneName];
        container.innerHTML = ''; // コンテナのクリアは行うが、DOM自体は使い回す

        state.zones[zoneName].forEach(cardId => {
            const cardData = findCardData(cardId);
            if (!cardData || !cardData.element) return;

            const isInField = (zoneName === 'field1' || zoneName === 'field2');

            // 1. クラスの状態を最新にする
            updateCardStateVisual(cardData, isInField);

            // 2. 既存のDOM要素をコンテナに配置（移動）する
            container.appendChild(cardData.element);
        });
    });
}

function renderCores() {
    ['reserve', 'life', 'trash'].forEach(type => {
        document.getElementById(`${type}-count`).innerText = state.core[type];
    });
    document.querySelectorAll('[data-num="choice-count"]').forEach(x => {
        x.innerHTML = state.core["choice"];
    });
}

function renderSoulCore() {
    if (!cachedSoulCoreElem) return;

    // 選択状態のクラス切り替え
    if (state.selected.type === 'soul') {
        cachedSoulCoreElem.classList.add('selected');
    } else {
        cachedSoulCoreElem.classList.remove('selected');
    }

    // もしソウルコアがカードの上にある場合
    if (typeof state.soulCore.location === 'string' && state.soulCore.location.startsWith('card-')) {
        const cardData = findCardData(state.soulCore.location);
        if (cardData && cardData.element) {
            // カード内のui要素にアタッチするなどの処理
            const ui = cardData.element.querySelector('.card-ui');
            if (ui && !ui.contains(cachedSoulCoreElem)) {
                ui.appendChild(cachedSoulCoreElem);
            }
        }
        return;
    }

    // リザーブまたはトラッシュのホルダーに配置する場合
    if (state.soulCore.location === 'reserve') {
        const holder = document.getElementById('reserve-soul-holder');
        if (holder && !holder.contains(cachedSoulCoreElem)) {
            holder.appendChild(cachedSoulCoreElem);
        }
    } else if (state.soulCore.location === 'trash') {
        const holder = document.getElementById('trash-soul-holder');
        if (holder && !holder.contains(cachedSoulCoreElem)) {
            holder.appendChild(cachedSoulCoreElem);
        }
    }
}

// --- カード検索ヘルパー ---
function findCardData(id) {
    return state.cards.find(c => c.id === id);
}


// 状態が変わったときにカードの見た目だけを更新する関数
function updateCardStateVisual(cardData, isInField) {
    const card = cardData.element;
    
    // tapped, in-field, selected の切り替え
    if (cardData.tapped && isInField) card.classList.add('tapped');
    else card.classList.remove('tapped');

    //重疲労の場合はタップより優先される
    if (cardData.heavyTapped && isInField) card.classList.add('heavy-tapped');
    else card.classList.remove('heavy-tapped');

    if (isInField) card.classList.add('in-field');
    else card.classList.remove('in-field');

    if (state.selected.type === 'card' && state.selected.id === cardData.id) {
        card.classList.add('selected');
    } else {
        card.classList.remove('selected');
    }

    // コアバッジのテキスト更新
    const coreBadgeSpan = card.querySelector('.core-badge span');
    if (coreBadgeSpan) {
        let coreText = `C:${cardData.core}`;
        if (state.soulCore.location === cardData.id) {
            coreText += `<span class="soul-core-badge">+1</span>`;
        }
        coreBadgeSpan.innerHTML = coreText;
    }
}

function createCardElementOnce(cardData) {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = cardData.id;

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'card-img-wrapper';
    const img = document.createElement('img');
    img.src = cardData.imgUrl;
    imgWrapper.appendChild(img);
    card.appendChild(imgWrapper);

    const ui = document.createElement('div');
    ui.className = 'card-ui';
    card.appendChild(ui);

    // コアバッジ
    const coreBadge = document.createElement('div');
    coreBadge.className = 'core-badge';
    coreBadge.innerHTML = `<span>C:0</span>`;
    ui.appendChild(coreBadge);

    return card;
}