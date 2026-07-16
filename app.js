// ==========================================
// せどり在庫管理・運用管理 - ロジック (app.js)
// ==========================================

// ==========================================
// Firebase 接続設定 (Firebase コンソールから取得した設定をここに貼り付けてください)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBY_8OFC-d9zV6FG3uJXidpsjNKpdY-0ng",
  authDomain: "sedoriapp-ce892.firebaseapp.com",
  projectId: "sedoriapp-ce892",
  storageBucket: "sedoriapp-ce892.firebasestorage.app",
  messagingSenderId: "38069026118",
  appId: "1:38069026118:web:94aca0a9e42d409e377947",
  measurementId: "G-Q3EWM50VLH"
};

let db = null;
let currentUser = null;
let unsubscribeProducts = null;

// Firebase の初期化（APIキーが初期値のままでない場合のみ実行）
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  } catch (e) {
    console.error("Firebase初期化失敗:", e);
  }
} else {
  console.warn("Firebase設定が未完了です。app.jsのfirebaseConfigに設定を入力してください。LocalStorageフォールバックが稼働します。");
}

// アプリのデータ状態
let products = [];
let categories = []; // カテゴリーリスト
let searchQuery = '';
let dateFilterQuery = ''; // カレンダー日付フィルター値
let statusFilterQuery = 'all'; // 状態フィルター値 (all, inventory, sold)
let editingProductId = null; // 編集中の商品IDを保持する変数 (nullなら通常登録)
let revenueChartInstance = null; // Chart.jsのインスタンス保持用

// デフォルトのカテゴリー
const DEFAULT_CATEGORIES = ['本', 'おもちゃ', '家電', 'アパレル', 'ゲーム', 'その他'];

// DOM要素の安全な取得ヘルパー
function safeGetElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`警告: ID [${id}] の要素が見つかりません。`);
  }
  return el;
}

// DOM要素の取得
const formSection = safeGetElement('form-section');
const formTitle = safeGetElement('form-title');
const productForm = safeGetElement('product-form');
const productNameInput = safeGetElement('product-name');
const productCategoryInput = safeGetElement('product-category'); // カテゴリー選択
const addCategoryBtn = safeGetElement('add-category-btn'); // カテゴリー簡易追加ボタン
const manageCategoriesBtn = safeGetElement('manage-categories-btn'); // カテゴリー管理ボタン
const purchasePriceInput = safeGetElement('purchase-price');
const sellPriceInput = safeGetElement('sell-price');
const shippingInput = safeGetElement('shipping');
const feeRateInput = safeGetElement('fee-rate');
const productStatusInput = safeGetElement('product-status'); // 状態
const purchaseDateInput = safeGetElement('purchase-date'); // 仕入れ日
const saleDateInput = safeGetElement('sale-date'); // 販売日
const saleDateGroup = safeGetElement('sale-date-group'); // 販売日グループ

const submitBtn = safeGetElement('submit-btn');
const cancelBtn = safeGetElement('cancel-btn');

// カテゴリー管理モーダル要素
const categoryModal = safeGetElement('category-modal');
const closeModalX = safeGetElement('close-modal-x');
const closeCategoryModalBtn = safeGetElement('close-category-modal-btn');
const newCategoryInput = safeGetElement('new-category-input');
const modalAddCategoryBtn = safeGetElement('modal-add-category-btn');
const modalCategoryList = safeGetElement('modal-category-list');

// 検索・フィルター要素
const searchInput = safeGetElement('search-input');
const dateFilterInput = safeGetElement('date-filter');
const clearDateBtn = safeGetElement('clear-date-btn');
const statusFilterInput = safeGetElement('status-filter'); // 状態フィルター

// タブ・ページ切り替え要素
const tabInventory = safeGetElement('tab-inventory');
const tabReport = safeGetElement('tab-report');
const inventoryPage = safeGetElement('inventory-page');
const reportPage = safeGetElement('report-page');

// サマリー要素 (在庫管理用)
const totalCountEl = safeGetElement('total-count');
const totalInvestmentEl = safeGetElement('total-investment');
const totalSalesEl = safeGetElement('total-sales');
const totalProfitEl = safeGetElement('total-profit');

// 一覧エリア
const emptyStateEl = safeGetElement('empty-state');
const listWrapperEl = safeGetElement('product-list-wrapper');
const tableBodyEl = safeGetElement('product-table-body');
const mobileListEl = safeGetElement('product-mobile-list');

// レポートページ要素
const reportMonthSelect = safeGetElement('report-month-select');
const reportTotalInvestmentEl = safeGetElement('report-total-investment'); // 文字仕入れ
const reportTotalSalesEl = safeGetElement('report-total-sales'); // 文字売上
const reportTotalProfitEl = safeGetElement('report-total-profit'); // 文字利益
const reportTotalProfitCard = safeGetElement('report-total-profit-card'); // 文字利益カード

const diagnosticCard = safeGetElement('diagnostic-card');
const diagnosticIcon = safeGetElement('diagnostic-icon');
const diagnosticTitle = safeGetElement('diagnostic-title');
const diagnosticDesc = safeGetElement('diagnostic-desc');

// 資金繰り診断要素
const cashflowCard = safeGetElement('cashflow-card');
const cashflowIcon = safeGetElement('cashflow-icon');
const cashflowTitle = safeGetElement('cashflow-title');
const cashflowDesc = safeGetElement('cashflow-desc');

// --- 収支サマリー用資金増減要素 ---
const reportTotalCashFlowEl = safeGetElement('report-total-cashflow');
const reportTotalCashFlowCard = safeGetElement('report-total-cashflow-card');

// --- データインポート・エクスポート要素 ---
const exportDataBtn = safeGetElement('export-data-btn');
const importDataFile = safeGetElement('import-data-file');

// --- ユーティリティ関数 ---

// 金額を「¥1,500」のようなカンマ区切り形式に変換する
function formatCurrency(amount) {
  const num = Number(amount);
  if (isNaN(num)) return '¥0';
  if (num < 0) {
    return '-¥' + Math.abs(num).toLocaleString('ja-JP');
  }
  return '¥' + num.toLocaleString('ja-JP');
}

// 今日（または指定日）の日付を「2026/07/15」形式で取得する
function getFormattedDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

// カレンダー入力の日付(YYYY-MM-DD)を、保存形式(YYYY/MM/DD)に変換する
function formatDateInput(val) {
  if (!val) return '';
  return val.replace(/-/g, '/');
}

// 保存形式の日付(YYYY/MM/DD)を、カレンダー入力形式(YYYY-MM-DD)に変換する
function formatDateToInput(val) {
  if (!val) return '';
  return val.replace(/\//g, '-');
}

// 手数料（円）を計算する
function calculateFee(sellPrice, feeRate, oldFee) {
  const sPrice = Number(sellPrice) || 0;
  // feeRate が undefined や null、または空文字列の場合は oldFee (手数料金額) を採用する
  if (feeRate !== undefined && feeRate !== null && feeRate !== '' && !isNaN(feeRate)) {
    return Math.round(sPrice * (Number(feeRate) / 100));
  }
  return Number(oldFee) || 0;
}

// --- カテゴリー管理処理 ---

function loadCategories() {
  // Firebaseがログイン中の場合は、ログイン時に同期されるため何もしない
  if (db && currentUser) return;

  const saved = localStorage.getItem('sedori_categories');
  categories = [];
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        categories = parsed.filter(Boolean).map(String);
      }
    } catch (e) {
      console.error('カテゴリーのパースに失敗しました:', e);
    }
  }
  
  // カテゴリーが空、または配列でなければデフォルトをセット
  if (!Array.isArray(categories) || categories.length === 0) {
    categories = [...DEFAULT_CATEGORIES];
  }
  
  // 「その他」が必ず含まれるようにする
  if (!categories.includes('その他')) {
    categories.push('その他');
  }
  
  saveCategories();
}

function saveCategories() {
  if (db && currentUser) {
    db.collection('users').doc(currentUser.uid).collection('categories').doc('list').set({
      names: categories
    }).catch(e => console.error("Firestoreカテゴリ保存失敗:", e));
  } else {
    localStorage.setItem('sedori_categories', JSON.stringify(categories));
  }
}

function updateCategorySelects(selectedValue) {
  if (!productCategoryInput) return;
  const currentVal = selectedValue || productCategoryInput.value;
  productCategoryInput.innerHTML = '';
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    productCategoryInput.appendChild(option);
  });

  if (categories.includes(currentVal)) {
    productCategoryInput.value = currentVal;
  } else {
    productCategoryInput.value = categories[0] || 'その他';
  }
}

// カテゴリーを追加
function addCategory(name) {
  const cleanName = name.trim();
  if (!cleanName) return;
  if (categories.includes(cleanName)) {
    alert('そのカテゴリーは既に登録されています。');
    return;
  }
  categories.push(cleanName);
  saveCategories();
  updateCategorySelects(cleanName);
  updateModalCategoryList();
}

// カテゴリーを削除
function deleteCategory(name) {
  if (name === 'その他') {
    alert('「その他」カテゴリーは削除できません。');
    return;
  }
  if (confirm(`カテゴリー「${name}」を削除しますか？\n（すでに登録されている商品のカテゴリー名は書き換わりません）`)) {
    categories = categories.filter(cat => cat !== name);
    saveCategories();
    updateCategorySelects();
    updateModalCategoryList();
  }
}

function updateModalCategoryList() {
  if (!modalCategoryList) return;
  modalCategoryList.innerHTML = '';
  categories.forEach(cat => {
    const li = document.createElement('li');
    li.textContent = cat;

    // その他は削除不可
    if (cat !== 'その他') {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-delete-category';
      deleteBtn.innerHTML = '<i class="fa-regular fa-trash-can"></i>';
      deleteBtn.title = 'このカテゴリーを削除';
      deleteBtn.onclick = function () {
        deleteCategory(cat);
      };
      li.appendChild(deleteBtn);
    }
    modalCategoryList.appendChild(li);
  });
}

// --- 商品データの読み書き ---

function loadData() {
  // Firebaseがログイン中の場合は、ログイン時に同期されるため何もしない
  if (db && currentUser) return;

  const saved = localStorage.getItem('sedori_inventory');
  products = [];
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        products = parsed.map(p => {
          if (!p || typeof p !== 'object') return null;

          const legacyDate = p.date || getFormattedDate();
          const initialStatus = p.status !== undefined ? p.status : (Number(p.sellPrice) > 0 ? 'sold' : 'inventory');

          return {
            id: p.id ? String(p.id) : Date.now().toString() + Math.random(),
            name: p.name ? String(p.name) : '無題の商品',
            category: p.category ? String(p.category) : 'その他', // カテゴリー互換処理
            price: Number(p.price) || 0,
            sellPrice: p.sellPrice !== undefined ? Number(p.sellPrice) : 0,
            shipping: p.shipping !== undefined ? Number(p.shipping) : 0,
            feeRate: (p.feeRate !== undefined && p.feeRate !== '' && !isNaN(p.feeRate)) ? Number(p.feeRate) : undefined,
            fee: p.fee !== undefined ? Number(p.fee) : 0,
            status: initialStatus === 'sold' ? 'sold' : 'inventory',
            purchaseDate: p.purchaseDate ? String(p.purchaseDate) : legacyDate,
            saleDate: p.saleDate ? String(p.saleDate) : (initialStatus === 'sold' ? legacyDate : ''),
            date: legacyDate
          };
        }).filter(Boolean);
      }
    } catch (e) {
      console.error('データの読み込みに失敗しました:', e);
      products = [];
    }
  }
}

function saveData() {
  localStorage.setItem('sedori_inventory', JSON.stringify(products));
}

// --- 描画処理 (在庫管理) ---

function render() {
  // 1. 検索クエリでフィルター (商品名 or カテゴリー or 仕入れ日/販売日の部分一致)
  let filteredProducts = products;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredProducts = filteredProducts.filter(product => {
      const name = (product.name || '').toLowerCase();
      const cat = (product.category || '').toLowerCase();
      const pDate = (product.purchaseDate || '').toLowerCase();
      const sDate = (product.saleDate || '').toLowerCase();
      return name.includes(q) || cat.includes(q) || pDate.includes(q) || sDate.includes(q);
    });
  }

  // 2. カレンダー日付指定フィルター
  if (dateFilterQuery) {
    const targetDate = dateFilterQuery.replace(/-/g, '/');
    filteredProducts = filteredProducts.filter(product =>
      product.purchaseDate === targetDate ||
      (product.saleDate && product.saleDate === targetDate)
    );
  }

  // 3. 状態フィルター
  if (statusFilterQuery !== 'all') {
    filteredProducts = filteredProducts.filter(product => product.status === statusFilterQuery);
  }

  // 在庫管理用の数値集計
  const totalCount = products.length;
  const totalInvestment = products.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const totalSales = products.filter(p => p.status === 'sold').reduce((sum, item) => sum + (Number(item.sellPrice) || 0), 0);
  const totalProfit = products.filter(p => p.status === 'sold').reduce((sum, item) => {
    const price = Number(item.price) || 0;
    const sellPrice = Number(item.sellPrice) || 0;
    const shipping = Number(item.shipping) || 0;
    const fee = calculateFee(sellPrice, item.feeRate, item.fee);
    return sum + (sellPrice - price - shipping - fee);
  }, 0);

  let averageProfitRate = 0;
  if (totalSales > 0) {
    averageProfitRate = Math.round((totalProfit / totalSales) * 100);
  }

  // サマリー表示への安全な代入
  if (totalCountEl) totalCountEl.innerHTML = `${totalCount} <span class="unit">個</span>`;
  if (totalInvestmentEl) totalInvestmentEl.textContent = formatCurrency(totalInvestment);
  if (totalSalesEl) totalSalesEl.textContent = formatCurrency(totalSales);

  if (totalProfitEl) {
    let profitClass = 'profit-zero';
    if (totalProfit > 0) {
      profitClass = 'profit-positive';
    } else if (totalProfit < 0) {
      profitClass = 'profit-negative';
    }
    totalProfitEl.className = `summary-value ${profitClass}`;
    totalProfitEl.innerHTML = `${formatCurrency(totalProfit)} <span class="profit-rate-summary" id="average-profit-rate">(${averageProfitRate}%)</span>`;
  }

  // 表示エリアのトグル
  if (filteredProducts.length === 0) {
    if (emptyStateEl) emptyStateEl.classList.remove('hidden');
    if (listWrapperEl) listWrapperEl.classList.add('hidden');

    if (emptyStateEl) {
      const pText = emptyStateEl.querySelector('p');
      const hintText = emptyStateEl.querySelector('.empty-hint');
      if (searchQuery || dateFilterQuery || statusFilterQuery !== 'all') {
        if (pText) pText.textContent = '条件に合う商品は見つかりませんでした。';
        if (hintText) hintText.textContent = '検索条件を変更してみてください。';
      } else {
        if (pText) pText.textContent = '登録された商品はありません。';
        if (hintText) hintText.textContent = '上のフォームから商品を登録してみましょう！';
      }
    }
    return;
  }

  if (emptyStateEl) emptyStateEl.classList.add('hidden');
  if (listWrapperEl) listWrapperEl.classList.remove('hidden');

  // PC用テーブルの描画
  if (tableBodyEl) {
    tableBodyEl.innerHTML = '';
    filteredProducts.forEach(product => {
      const price = Number(product.price) || 0;
      const sellPrice = Number(product.sellPrice) || 0;
      const shipping = Number(product.shipping) || 0;
      const fee = calculateFee(sellPrice, product.feeRate, product.fee);
      const profit = sellPrice - price - shipping - fee;
      const profitRate = sellPrice > 0 ? Math.round((profit / sellPrice) * 100) : 0;

      let itemProfitClass = 'profit-zero';
      if (profit > 0) {
        itemProfitClass = 'profit-positive';
      } else if (profit < 0) {
        itemProfitClass = 'profit-negative';
      }

      const feeText = product.feeRate !== undefined && product.feeRate !== 0
        ? `${formatCurrency(fee)} <span class="profit-rate" style="display:inline;">(${product.feeRate}%)</span>`
        : formatCurrency(fee);

      const badgeHtml = product.status === 'sold'
        ? '<span class="badge badge-sold">売了</span>'
        : '<span class="badge badge-inventory">在庫</span>';

      const dateCellHtml = `
        <div class="date-cell-container">
          <div class="date-cell-item">仕: <span>${product.purchaseDate || '-'}</span></div>
          ${product.status === 'sold' ? `<div class="date-cell-item">売: <span>${product.saleDate || '-'}</span></div>` : ''}
        </div>
      `;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong>${escapeHtml(product.name)}</strong>
          <br>
          <span class="category-tag">${escapeHtml(product.category || 'その他')}</span>
        </td>
        <td class="text-center">${badgeHtml}</td>
        <td class="text-right price-text">${formatCurrency(price)}</td>
        <td class="text-right price-text">${formatCurrency(sellPrice)}</td>
        <td class="text-right price-text">${formatCurrency(shipping)}</td>
        <td class="text-right price-text">${feeText}</td>
        <td class="text-right">
          <span class="${itemProfitClass}">${formatCurrency(profit)}</span>
          <span class="profit-rate">(${profitRate}%)</span>
        </td>
        <td>${dateCellHtml}</td>
        <td class="text-center">
          <div class="action-buttons">
            <button class="btn btn-edit btn-edit-action" data-id="${product.id}">
              <i class="fa-regular fa-pen-to-square"></i> 編集
            </button>
            <button class="btn btn-danger btn-delete" data-id="${product.id}">
              <i class="fa-regular fa-trash-can"></i> 削除
            </button>
          </div>
        </td>
      `;
      tableBodyEl.appendChild(tr);
    });
  }

  // スマホ用カードの描画
  if (mobileListEl) {
    mobileListEl.innerHTML = '';
    filteredProducts.forEach(product => {
      const price = Number(product.price) || 0;
      const sellPrice = Number(product.sellPrice) || 0;
      const shipping = Number(product.shipping) || 0;
      const fee = calculateFee(sellPrice, product.feeRate, product.fee);
      const profit = sellPrice - price - shipping - fee;
      const profitRate = sellPrice > 0 ? Math.round((profit / sellPrice) * 100) : 0;

      let itemProfitClass = 'profit-zero';
      if (profit > 0) {
        itemProfitClass = 'profit-positive';
      } else if (profit < 0) {
        itemProfitClass = 'profit-negative';
      }

      const feeText = product.feeRate !== undefined && product.feeRate !== 0
        ? `${formatCurrency(fee)} (${product.feeRate}%)`
        : formatCurrency(fee);

      const badgeHtml = product.status === 'sold'
        ? '<span class="badge badge-sold">売了</span>'
        : '<span class="badge badge-inventory">在庫</span>';

      const mobileDateText = product.status === 'sold'
        ? `<i class="fa-regular fa-calendar"></i> 仕: ${product.purchaseDate || '-'} / 売: ${product.saleDate || '-'}`
        : `<i class="fa-regular fa-calendar"></i> 仕: ${product.purchaseDate || '-'}`;

      const card = document.createElement('div');
      card.className = 'mobile-product-card';
      card.innerHTML = `
        <div class="mobile-card-row">
          <span class="mobile-card-title">
            ${badgeHtml}
            ${escapeHtml(product.name)}
            <span class="category-tag badge-category">${escapeHtml(product.category || 'その他')}</span>
          </span>
          <span class="mobile-card-price">
            <span class="${itemProfitClass}">${formatCurrency(profit)}</span> <span class="profit-rate" style="display:inline;">(${profitRate}%)</span>
          </span>
        </div>
        <div class="mobile-card-details">
          <div class="mobile-detail-item">仕入れ: <span>${formatCurrency(price)}</span></div>
          <div class="mobile-detail-item">販売: <span>${formatCurrency(sellPrice)}</span></div>
          <div class="mobile-detail-item">送料: <span>${formatCurrency(shipping)}</span></div>
          <div class="mobile-detail-item">手数料: <span>${feeText}</span></div>
        </div>
        <div class="mobile-card-footer">
          <span class="date-text">${mobileDateText}</span>
          <div class="action-buttons">
            <button class="btn btn-edit btn-edit-action" data-id="${product.id}">
              <i class="fa-regular fa-pen-to-square"></i> 編集
            </button>
            <button class="btn btn-danger btn-delete" data-id="${product.id}">
              <i class="fa-regular fa-trash-can"></i> 削除
            </button>
          </div>
        </div>
      `;
      mobileListEl.appendChild(card);
    });
  }

  // イベント再割り当て
  document.querySelectorAll('.btn-delete').forEach(button => {
    button.onclick = function (e) {
      const id = e.currentTarget.getAttribute('data-id');
      deleteProduct(id);
    };
  });

  document.querySelectorAll('.btn-edit-action').forEach(button => {
    button.onclick = function (e) {
      const id = e.currentTarget.getAttribute('data-id');
      startEdit(id);
    };
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- 在庫追加・更新・削除 ---

function addProduct(name, price, sellPrice, shipping, feeRate, status, purchaseDate, saleDate, category) {
  const today = getFormattedDate();
  const newProduct = {
    name: name.trim(),
    category: category || 'その他',
    price: parseInt(price, 10) || 0,
    sellPrice: sellPrice ? parseInt(sellPrice, 10) : 0,
    shipping: shipping ? parseInt(shipping, 10) : 0,
    feeRate: (feeRate !== '' && !isNaN(feeRate)) ? parseFloat(feeRate) : null,
    status: status || 'inventory',
    purchaseDate: purchaseDate ? formatDateInput(purchaseDate) : today,
    saleDate: status === 'sold' ? (saleDate ? formatDateInput(saleDate) : today) : '',
    date: today
  };

  if (db && currentUser) {
    // Firestoreに追加
    newProduct.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection('users').doc(currentUser.uid).collection('products').add(newProduct)
      .catch(err => alert("追加エラー: " + err.message));
  } else {
    // ローカルフォールバック
    newProduct.id = Date.now().toString();
    products.unshift(newProduct);
    saveData();
    render();
  }
}

function updateProduct(id, name, price, sellPrice, shipping, feeRate, status, purchaseDate, saleDate, category) {
  const today = getFormattedDate();
  const updatedFields = {
    name: name.trim(),
    category: category || 'その他',
    price: parseInt(price, 10) || 0,
    sellPrice: sellPrice ? parseInt(sellPrice, 10) : 0,
    shipping: shipping ? parseInt(shipping, 10) : 0,
    feeRate: (feeRate !== '' && !isNaN(feeRate)) ? parseFloat(feeRate) : null,
    status: status || 'inventory',
    purchaseDate: purchaseDate ? formatDateInput(purchaseDate) : today,
    saleDate: status === 'sold' ? (saleDate ? formatDateInput(saleDate) : today) : ''
  };

  if (db && currentUser) {
    // Firestoreを更新
    updatedFields.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection('users').doc(currentUser.uid).collection('products').doc(id).update(updatedFields)
      .then(() => cancelEdit())
      .catch(err => alert("更新エラー: " + err.message));
  } else {
    // ローカルフォールバック
    products = products.map(product => {
      if (product.id === id) {
        return {
          ...product,
          ...updatedFields,
          fee: undefined
        };
      }
      return product;
    });

    saveData();
    cancelEdit();
    render();
  }
}

function deleteProduct(id) {
  const productToDelete = products.find(p => p.id === id);
  if (!productToDelete) return;
  const confirmMsg = `「${productToDelete.name}」をリストから削除しますか？`;

  if (confirm(confirmMsg)) {
    if (editingProductId === id) {
      cancelEdit();
    }

    if (db && currentUser) {
      // Firestoreから削除
      db.collection('users').doc(currentUser.uid).collection('products').doc(id).delete()
        .catch(err => alert("削除エラー: " + err.message));
    } else {
      // ローカルフォールバック
      products = products.filter(product => product.id !== id);
      saveData();
      render();
    }
  }
}

// --- 編集・キャンセル・状態変化制御 ---

function toggleSaleDateInput(status) {
  if (saleDateGroup) {
    if (status === 'sold') {
      saleDateGroup.classList.remove('hidden');
    } else {
      saleDateGroup.classList.add('hidden');
    }
  }
}

// 商品状態セレクト変更イベント
if (productStatusInput) {
  productStatusInput.onchange = function (e) {
    toggleSaleDateInput(e.target.value);
  };
}

function startEdit(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  editingProductId = id;
  if (productNameInput) productNameInput.value = product.name || '';
  if (productCategoryInput) productCategoryInput.value = product.category || 'その他';
  if (purchasePriceInput) purchasePriceInput.value = product.price || '';
  if (sellPriceInput) sellPriceInput.value = product.sellPrice || '';
  if (shippingInput) shippingInput.value = product.shipping || '';
  if (productStatusInput) productStatusInput.value = product.status || 'inventory';

  // 日付のセット
  if (purchaseDateInput) purchaseDateInput.value = formatDateToInput(product.purchaseDate);
  if (saleDateInput) saleDateInput.value = formatDateToInput(product.saleDate);

  // 状態に応じた販売日入力欄の表示切り替え
  toggleSaleDateInput(product.status);

  if (feeRateInput) {
    if (product.feeRate !== undefined) {
      feeRateInput.value = product.feeRate;
    } else if (product.fee && product.sellPrice) {
      feeRateInput.value = Math.round((product.fee / product.sellPrice) * 100);
    } else {
      feeRateInput.value = '';
    }
  }

  clearErrors();
  if (formSection) formSection.classList.add('edit-mode');
  if (formTitle) formTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> 商品を編集する';
  if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> 更新する';
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  if (formSection) formSection.scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  editingProductId = null;
  if (productForm) productForm.reset();
  toggleSaleDateInput('inventory');
  updateCategorySelects(); // カテゴリーをリセット
  clearErrors();

  if (formSection) formSection.classList.remove('edit-mode');
  if (formTitle) formTitle.innerHTML = '<i class="fa-solid fa-circle-plus"></i> 新しい商品を登録する';
  if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> リストに追加する';
  if (cancelBtn) cancelBtn.classList.add('hidden');
}

function clearErrors() {
  const groups = [
    productNameInput ? productNameInput.parentElement : null,
    purchasePriceInput ? purchasePriceInput.parentElement.parentElement : null,
    sellPriceInput ? sellPriceInput.parentElement.parentElement : null,
    shippingInput ? shippingInput.parentElement.parentElement : null,
    feeRateInput ? feeRateInput.parentElement.parentElement : null
  ];
  groups.forEach(g => {
    if (g) g.classList.remove('has-error');
  });
}

// --- タブ切り替えとレポート表示ロジック ---

function setupTabs() {
  if (tabInventory && tabReport && inventoryPage && reportPage) {
    tabInventory.onclick = function () {
      tabInventory.classList.add('active');
      tabReport.classList.remove('active');
      inventoryPage.classList.remove('hidden');
      reportPage.classList.add('hidden');
      render();
    };

    tabReport.onclick = function () {
      tabInventory.classList.remove('active');
      tabReport.classList.add('active');
      inventoryPage.classList.add('hidden');
      reportPage.classList.remove('hidden');

      updateReportMonthSelect();
      renderReportPage();
    };
  }
}

function updateReportMonthSelect() {
  if (!reportMonthSelect) return;

  const allMonths = [];
  products.forEach(p => {
    if (p.purchaseDate) allMonths.push(p.purchaseDate.substring(0, 7));
    if (p.saleDate) allMonths.push(p.saleDate.substring(0, 7));
  });

  const months = [...new Set(allMonths.filter(Boolean))];
  months.sort((a, b) => b.localeCompare(a));

  const previouslySelected = reportMonthSelect.value;
  reportMonthSelect.innerHTML = '';

  if (months.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'データなし';
    reportMonthSelect.appendChild(option);
    return;
  }

  months.forEach(m => {
    const option = document.createElement('option');
    option.value = m;
    const parts = m.split('/');
    option.textContent = `${parts[0]}年${parts[1]}月`;
    reportMonthSelect.appendChild(option);
  });

  if (months.includes(previouslySelected)) {
    reportMonthSelect.value = previouslySelected;
  } else {
    reportMonthSelect.value = months[0];
  }
}

function renderReportPage() {
  if (!reportMonthSelect) return;
  const selectedMonth = reportMonthSelect.value;
  if (!selectedMonth) {
    setDiagnosticState('empty');
    setCashFlowState('empty');
    updateReportSummaryText(0, 0, 0, 0, 0);
    if (revenueChartInstance) {
      try {
        revenueChartInstance.destroy();
      } catch (e) { }
      revenueChartInstance = null;
    }
    return;
  }

  // 1. 仕入れ総額の集計
  const monthlyInvestedProducts = products.filter(p => p.purchaseDate && p.purchaseDate.startsWith(selectedMonth));
  const totalInvestment = monthlyInvestedProducts.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

  // 2. 売上・経費・利益の集計
  const monthlySoldProducts = products.filter(p => p.status === 'sold' && p.saleDate && p.saleDate.startsWith(selectedMonth));

  const totalSales = monthlySoldProducts.reduce((sum, item) => sum + (Number(item.sellPrice) || 0), 0);
  const totalShipping = monthlySoldProducts.reduce((sum, item) => sum + (Number(item.shipping) || 0), 0);
  const totalFee = monthlySoldProducts.reduce((sum, item) => sum + calculateFee(item.sellPrice, item.feeRate, item.fee), 0);

  const totalSoldInvestment = monthlySoldProducts.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const totalProfit = totalSales - totalSoldInvestment - totalShipping - totalFee;

  const profitRate = totalSales > 0 ? Math.round((totalProfit / totalSales) * 100) : 0;

  // 3. 実質売上額（純回収額 = 売上総額 - 送料 - 手数料）
  const realSales = totalSales - totalShipping - totalFee;
  // 4. 資金増減（キャッシュフロー差額 = 純回収額 - 仕入れ総額）
  const cashFlowDiff = realSales - totalInvestment;

  updateReportSummaryText(totalInvestment, totalSales, totalProfit, profitRate, cashFlowDiff);

  // 運用状況診断の判定
  if (monthlyInvestedProducts.length === 0 && monthlySoldProducts.length === 0) {
    setDiagnosticState('empty');
  } else if (totalProfit < 0) {
    setDiagnosticState('warning', totalProfit, profitRate);
  } else if (profitRate >= 25) {
    setDiagnosticState('excellent', totalProfit, profitRate);
  } else {
    setDiagnosticState('good', totalProfit, profitRate);
  }

  // 資金繰り（キャッシュフロー）診断の判定
  if (monthlyInvestedProducts.length === 0 && monthlySoldProducts.length === 0) {
    setCashFlowState('empty');
  } else if (cashFlowDiff >= 0) {
    setCashFlowState('safe', realSales, totalInvestment, cashFlowDiff);
  } else {
    setCashFlowState('warning', realSales, totalInvestment, cashFlowDiff);
  }

  renderChart(totalInvestment, totalSales, totalProfit);
}

function updateReportSummaryText(investment, sales, profit, rate, cashFlow) {
  if (reportTotalInvestmentEl) reportTotalInvestmentEl.textContent = formatCurrency(investment);
  if (reportTotalSalesEl) reportTotalSalesEl.textContent = formatCurrency(sales);

  if (reportTotalProfitCard) {
    reportTotalProfitCard.className = 'monthly-summary-card';
    if (profit > 0) {
      reportTotalProfitCard.classList.add('profit-positive');
    } else if (profit < 0) {
      reportTotalProfitCard.classList.add('profit-negative');
    }
  }

  if (reportTotalProfitEl) {
    reportTotalProfitEl.innerHTML = `${formatCurrency(profit)} <span class="profit-rate-summary" id="report-average-profit-rate">(${rate}%)</span>`;
  }

  // 資金増減の更新 (符号付き)
  if (reportTotalCashFlowEl) {
    reportTotalCashFlowEl.textContent = (cashFlow >= 0 ? '+' : '') + formatCurrency(cashFlow);
  }
  if (reportTotalCashFlowCard) {
    reportTotalCashFlowCard.className = 'monthly-summary-card';
    if (cashFlow > 0) {
      reportTotalCashFlowCard.classList.add('profit-positive');
    } else if (cashFlow < 0) {
      reportTotalCashFlowCard.classList.add('profit-negative');
    }
  }
}

function setDiagnosticState(state, profit = 0, rate = 0) {
  if (!diagnosticCard) return;
  diagnosticCard.className = 'diagnostic-card';

  if (state === 'empty') {
    diagnosticCard.classList.add('state-empty');
    if (diagnosticIcon) diagnosticIcon.className = 'fa-solid fa-circle-info';
    if (diagnosticTitle) diagnosticTitle.textContent = '登録データがありません';
    if (diagnosticDesc) diagnosticDesc.textContent = '選択された月の仕入れ、および販売データが登録されていません。まずは「在庫管理」ページから商品の登録や、売了データの更新を行ってください。';
  } else if (state === 'warning') {
    diagnosticCard.classList.add('state-warning');
    if (diagnosticIcon) diagnosticIcon.className = 'fa-solid fa-circle-exclamation';
    if (diagnosticTitle) diagnosticTitle.textContent = `改善が必要です (赤字: ${formatCurrency(profit)})`;
    if (diagnosticDesc) diagnosticDesc.innerHTML = `今月の売了利益は赤字、または仕入れ（総投資）に対して回収が追いついていません。まだ売れていない在庫の販売を最優先で進めるか、今後の「仕入れ値」と「売り値」のバランスを見直しましょう。`;
  } else if (state === 'good') {
    diagnosticCard.classList.add('state-good');
    if (diagnosticIcon) diagnosticIcon.className = 'fa-solid fa-circle-check';
    if (diagnosticTitle) diagnosticTitle.textContent = `黒字運用です (確定利益: ${formatCurrency(profit)} / 利益率: ${rate}%)`;
    if (diagnosticDesc) diagnosticDesc.innerHTML = `今月は売了商品から利益が出ています！順調に資産回収ができています。さらに「手残り利益」を大きくするために、送料を抑える梱包方法を試したり、手数料率の安いフリマアプリを選んでみるのもおすすめです。`;
  } else if (state === 'excellent') {
    diagnosticCard.classList.add('state-excellent');
    if (diagnosticIcon) diagnosticIcon.className = 'fa-solid fa-star';
    if (diagnosticTitle) diagnosticTitle.textContent = `絶好調です！ (確定利益: ${formatCurrency(profit)} / 利益率: ${rate}%)`;
    if (diagnosticDesc) diagnosticDesc.innerHTML = `売了商品の利益率が <strong>${rate}%</strong> と非常に高く、極めて効率の良い取引ができています！現在の仕入れ基準と売り方がバッチリ噛み合っています。この調子でどんどん進めていきましょう！`;
  }
}

function setCashFlowState(state, realSales = 0, investment = 0, diff = 0) {
  if (!cashflowCard) return;
  cashflowCard.className = 'diagnostic-card';

  if (state === 'empty') {
    cashflowCard.classList.add('state-empty');
    if (cashflowIcon) cashflowIcon.className = 'fa-solid fa-circle-info';
    if (cashflowTitle) cashflowTitle.textContent = 'データなし';
    if (cashflowDesc) cashflowDesc.textContent = '当月中に仕入れた商品、または販売完了した商品のデータがありません。';
  } else if (state === 'warning') {
    cashflowCard.classList.add('state-warning');
    if (cashflowIcon) cashflowIcon.className = 'fa-solid fa-triangle-exclamation';
    if (cashflowTitle) cashflowTitle.textContent = `注意：仕入れ超過です（資金増減: -${formatCurrency(Math.abs(diff))}）`;
    if (cashflowDesc) cashflowDesc.innerHTML = `今月の仕入れ総額（出ていくお金）<strong>${formatCurrency(investment)}</strong> に対し、手元に入った純回収額（売上から送料・手数料を引いた実質売上）は <strong>${formatCurrency(realSales)}</strong> です。<br>手元のお集め金が実質 <strong>${formatCurrency(Math.abs(diff))}</strong> 減っており、<strong>【黒字倒産】を防ぐため注意が必要</strong>です。一時的に新しい仕入れをセーブし、すでにある在庫 of 販売・現金化を最優先に進めましょう！`;
  } else if (state === 'safe') {
    cashflowCard.classList.add('state-excellent');
    if (cashflowIcon) cashflowIcon.className = 'fa-solid fa-circle-check';
    if (cashflowTitle) cashflowTitle.textContent = `安全：キャッシュ増加中（資金増減: +${formatCurrency(diff)}）`;
    if (cashflowDesc) cashflowDesc.innerHTML = `今月の仕入れ総額 <strong>${formatCurrency(investment)}</strong> に対し、手元に入った純回収額（売上から送料・手数料を引いた実質売上）は <strong>${formatCurrency(realSales)}</strong> です。<br>手元の資金が実質 <strong>${formatCurrency(diff)}</strong> 増えており、良好に資金が回っています。この調子で健全なキャッシュフローを維持しましょう！`;
  }
}

function renderChart(investment, sales, profit) {
  const canvas = document.getElementById('revenue-chart');
  if (!canvas) return;

  // 既存のチャートをライブラリの機能で確実に破壊する (Canvas is already in use エラーの防止)
  if (typeof Chart !== 'undefined') {
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
      try {
        existingChart.destroy();
      } catch (e) { }
    }
  }

  const ctx = canvas.getContext('2d');

  if (revenueChartInstance) {
    try {
      revenueChartInstance.destroy();
    } catch (e) { }
    revenueChartInstance = null;
  }

  // グローバルな Chart オブジェクトが存在するかチェック
  if (typeof Chart === 'undefined') {
    console.error('Chart.js が読み込まれていません。');
    return;
  }

  // 渡されたデータに NaN があれば 0 に置換して Chart.js のクラッシュを防ぐ
  const safeInvestment = isNaN(investment) ? 0 : Number(investment);
  const safeSales = isNaN(sales) ? 0 : Number(sales);
  const safeProfit = isNaN(profit) ? 0 : Number(profit);

  const profitColor = safeProfit >= 0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(239, 68, 68, 0.85)';
  const profitBorderColor = safeProfit >= 0 ? '#10b981' : '#ef4444';

  try {
    revenueChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['仕入れ額', '売上額', '手残り利益'],
        datasets: [{
          label: '収支規模 (円)',
          data: [safeInvestment, safeSales, safeProfit],
          backgroundColor: [
            'rgba(2, 132, 199, 0.75)',
            'rgba(59, 130, 246, 0.4)',
            profitColor
          ],
          borderColor: [
            '#0284c7',
            '#3b82f6',
            profitBorderColor
          ],
          borderWidth: 1.5,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return ' ' + context.raw.toLocaleString('ja-JP') + ' 円';
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: '#e2e8f0'
            },
            ticks: {
              font: {
                family: 'Noto Sans JP'
              },
              callback: function (value) {
                return '¥' + value.toLocaleString('ja-JP');
              }
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: {
                family: 'Noto Sans JP',
                weight: 'bold'
              }
            }
          }
        }
      }
    });
  } catch (e) {
    console.error('グラフの生成中にエラーが発生しました:', e);
  }
}


if (productForm) {
  productForm.onsubmit = function (e) {
    e.preventDefault();

    let isValid = true;

    // バリデーション: 商品名
    const nameValue = productNameInput ? productNameInput.value.trim() : '';
    if (!nameValue) {
      if (productNameInput) productNameInput.parentElement.classList.add('has-error');
      isValid = false;
    } else {
      if (productNameInput) productNameInput.parentElement.classList.remove('has-error');
    }

    // バリデーション: 仕入れ価格
    const priceValue = purchasePriceInput ? purchasePriceInput.value : '';
    if (!priceValue || isNaN(priceValue) || parseInt(priceValue, 10) < 0) {
      if (purchasePriceInput) purchasePriceInput.parentElement.parentElement.classList.add('has-error');
      isValid = false;
    } else {
      if (purchasePriceInput) purchasePriceInput.parentElement.parentElement.classList.remove('has-error');
    }

    // バリデーション: 販売価格
    const sellPriceValue = sellPriceInput ? sellPriceInput.value : '';
    if (sellPriceValue && (isNaN(sellPriceValue) || parseInt(sellPriceValue, 10) < 0)) {
      if (sellPriceInput) sellPriceInput.parentElement.parentElement.classList.add('has-error');
      isValid = false;
    } else {
      if (sellPriceInput) sellPriceInput.parentElement.parentElement.classList.remove('has-error');
    }

    // バリデーション: 送料
    const shippingValue = shippingInput ? shippingInput.value : '';
    if (shippingValue && (isNaN(shippingValue) || parseInt(shippingValue, 10) < 0)) {
      if (shippingInput) shippingInput.parentElement.parentElement.classList.add('has-error');
      isValid = false;
    } else {
      if (shippingInput) shippingInput.parentElement.parentElement.classList.remove('has-error');
    }

    // バリデーション: 手数料率
    const feeRateValue = feeRateInput ? feeRateInput.value : '';
    if (feeRateValue && (isNaN(feeRateValue) || parseFloat(feeRateValue) < 0 || parseFloat(feeRateValue) > 100)) {
      if (feeRateInput) feeRateInput.parentElement.parentElement.classList.add('has-error');
      isValid = false;
    } else {
      if (feeRateInput) feeRateInput.parentElement.parentElement.classList.remove('has-error');
    }

    if (isValid) {
      const statusValue = productStatusInput ? productStatusInput.value : 'inventory';
      const purchaseDateValue = purchaseDateInput ? purchaseDateInput.value : '';
      const saleDateValue = saleDateInput ? saleDateInput.value : '';
      const categoryValue = productCategoryInput ? productCategoryInput.value : 'その他';

      if (editingProductId) {
        updateProduct(editingProductId, nameValue, priceValue, sellPriceValue, shippingValue, feeRateValue, statusValue, purchaseDateValue, saleDateValue, categoryValue);
      } else {
        addProduct(nameValue, priceValue, sellPriceValue, shippingValue, feeRateValue, statusValue, purchaseDateValue, saleDateValue, categoryValue);
        productForm.reset();
        updateCategorySelects(); // カテゴリーをリセット
        if (productNameInput) productNameInput.focus();
      }
    }
  };
}

if (cancelBtn) {
  cancelBtn.onclick = function () {
    cancelEdit();
  };
}

// カテゴリー管理関係のイベントハンドラー
if (addCategoryBtn) {
  addCategoryBtn.onclick = function () {
    const newCat = prompt('新しいカテゴリー名を入力してください：\n（例：本、家電、コスメ など）');
    if (newCat && newCat.trim()) {
      addCategory(newCat.trim());
    }
  };
}

if (manageCategoriesBtn) {
  manageCategoriesBtn.onclick = function () {
    if (categoryModal) {
      updateModalCategoryList();
      categoryModal.classList.remove('hidden');
    }
  };
}

if (closeModalX) {
  closeModalX.onclick = function () {
    if (categoryModal) categoryModal.classList.add('hidden');
  };
}

if (closeCategoryModalBtn) {
  closeCategoryModalBtn.onclick = function () {
    if (categoryModal) categoryModal.classList.add('hidden');
  };
}

if (modalAddCategoryBtn) {
  modalAddCategoryBtn.onclick = function () {
    if (newCategoryInput) {
      const val = newCategoryInput.value.trim();
      if (val) {
        addCategory(val);
        newCategoryInput.value = '';
      }
    }
  };
}

// 検索
if (searchInput) {
  searchInput.oninput = function (e) {
    searchQuery = e.target.value;
    render();
  };
}

if (dateFilterInput) {
  dateFilterInput.onchange = function (e) {
    dateFilterQuery = e.target.value;
    if (clearDateBtn) {
      if (dateFilterQuery) {
        clearDateBtn.style.display = 'flex';
      } else {
        clearDateBtn.style.display = 'none';
      }
    }
    render();
  };
}

if (clearDateBtn) {
  clearDateBtn.onclick = function () {
    if (dateFilterInput) dateFilterInput.value = '';
    dateFilterQuery = '';
    clearDateBtn.style.display = 'none';
    render();
  };
}

if (statusFilterInput) {
  statusFilterInput.onchange = function (e) {
    statusFilterQuery = e.target.value;
    render();
  };
}

// レポート月変更
if (reportMonthSelect) {
  reportMonthSelect.onchange = function () {
    renderReportPage();
  };
}

const inputs = [productNameInput, purchasePriceInput, sellPriceInput, shippingInput, feeRateInput].filter(Boolean);
inputs.forEach(input => {
  input.oninput = function () {
    const parent = input.id === 'product-name' ? input.parentElement : input.parentElement.parentElement;
    if (parent) parent.classList.remove('has-error');
  };
});

// データの書き出し（保存）処理
if (exportDataBtn) {
  exportDataBtn.onclick = function () {
    const dataToExport = {
      products: products,
      categories: categories
    };
    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // ダウンロード用の一時リンクを作成してクリック
    const a = document.createElement('a');
    a.href = url;
    a.download = `せどりデータバックアップ_${getFormattedDate().replace(/\//g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
}


// データの読み込み（復元）処理
if (importDataFile) {
  importDataFile.onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const importedData = JSON.parse(evt.target.result);

        if (importedData && (Array.isArray(importedData.products) || Array.isArray(importedData))) {
          const confirmMsg = 'データを読み込みますか？\n現在保存されているデータはすべて上書き（追加）されます。';
          if (confirm(confirmMsg)) {
            const newProducts = Array.isArray(importedData.products) ? importedData.products : importedData;
            const newCategories = Array.isArray(importedData.categories) ? importedData.categories : DEFAULT_CATEGORIES;

            if (db && currentUser) {
              // Firebase接続時：Firestoreに書き込み
              const productsRef = db.collection('users').doc(currentUser.uid).collection('products');
              
              // 既存のデータを全削除する（上書き要件のため）
              db.collection('users').doc(currentUser.uid).collection('products').get().then(snapshot => {
                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                return batch.commit();
              }).then(() => {
                // 新しいデータを追加
                const promises = newProducts.map(p => {
                  const legacyDate = p.date || getFormattedDate();
                  const initialStatus = p.status !== undefined ? p.status : (Number(p.sellPrice) > 0 ? 'sold' : 'inventory');
                  return productsRef.add({
                    name: p.name ? String(p.name) : '無題の商品',
                    category: p.category ? String(p.category) : 'その他',
                    price: Number(p.price) || 0,
                    sellPrice: p.sellPrice !== undefined ? Number(p.sellPrice) : 0,
                    shipping: p.shipping !== undefined ? Number(p.shipping) : 0,
                    feeRate: (p.feeRate !== undefined && p.feeRate !== '' && !isNaN(p.feeRate)) ? Number(p.feeRate) : null,
                    status: initialStatus === 'sold' ? 'sold' : 'inventory',
                    purchaseDate: p.purchaseDate ? String(p.purchaseDate) : legacyDate,
                    saleDate: p.saleDate ? String(p.saleDate) : '',
                    date: legacyDate,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                  });
                });

                // カテゴリーも更新
                categories = [...new Set([...DEFAULT_CATEGORIES, ...newCategories])];
                saveCategories();

                return Promise.all(promises);
              }).then(() => {
                alert('クラウドへのデータ復元に成功しました！');
              }).catch(err => {
                alert('データの復元に失敗しました: ' + err.message);
              });

            } else {
              // ローカルフォールバック
              products = newProducts.map(p => {
                if (!p || typeof p !== 'object') return null;
                const legacyDate = p.date || getFormattedDate();
                return {
                  id: p.id ? String(p.id) : Date.now().toString() + Math.random(),
                  name: p.name ? String(p.name) : '無題の商品',
                  category: p.category ? String(p.category) : 'その他',
                  price: Number(p.price) || 0,
                  sellPrice: p.sellPrice !== undefined ? Number(p.sellPrice) : 0,
                  shipping: p.shipping !== undefined ? Number(p.shipping) : 0,
                  feeRate: (p.feeRate !== undefined && p.feeRate !== '' && !isNaN(p.feeRate)) ? Number(p.feeRate) : undefined,
                  fee: p.fee !== undefined ? Number(p.fee) : 0,
                  status: p.status === 'sold' ? 'sold' : 'inventory',
                  purchaseDate: p.purchaseDate ? String(p.purchaseDate) : legacyDate,
                  saleDate: p.saleDate ? String(p.saleDate) : '',
                  date: legacyDate
                };
              }).filter(Boolean);

              categories = [...new Set([...DEFAULT_CATEGORIES, ...newCategories])];

              saveData();
              saveCategories();
              updateCategorySelects();
              render();
              alert('データの復元に成功しました！');
            }
          }
        } else {
          alert('正しいバックアップファイルではありません。');
        }
      } catch (err) {
        alert('ファイルの読み込みに失敗しました。正しいJSONファイルかご確認ください。');
      }
      importDataFile.value = '';
    };
    reader.readAsText(file);
  };
}

// Firebase 関連要素の取得とイベント設定
const authContainer = safeGetElement('auth-container');
const authForm = safeGetElement('auth-form');
const authEmailInput = safeGetElement('auth-email');
const authPasswordInput = safeGetElement('auth-password');
const authSubmitBtn = safeGetElement('auth-submit-btn');
const authSwitchBtn = safeGetElement('auth-switch-btn');
const userInfoBar = safeGetElement('user-info-bar');
const userEmailDisplay = safeGetElement('user-email-display');
const logoutBtn = safeGetElement('logout-btn');

let isSignUpMode = false;

if (authSwitchBtn) {
  authSwitchBtn.onclick = function () {
    isSignUpMode = !isSignUpMode;
    if (isSignUpMode) {
      if (authSubmitBtn) authSubmitBtn.textContent = '新規登録して開始';
      authSwitchBtn.textContent = '登録済みの方（ログイン画面へ）';
    } else {
      if (authSubmitBtn) authSubmitBtn.textContent = 'ログイン';
      authSwitchBtn.textContent = '新規アカウントを作成する';
    }
  };
}

if (authForm) {
  authForm.onsubmit = function (e) {
    e.preventDefault();
    if (!db) {
      alert("Firebaseの設定（firebaseConfig）が完了していないため、ログイン機能は利用できません。app.jsの設定をご確認ください。");
      return;
    }

    const email = authEmailInput ? authEmailInput.value.trim() : '';
    const password = authPasswordInput ? authPasswordInput.value : '';

    if (!email || password.length < 6) {
      alert("メールアドレスおよび6文字以上のパスワードを正しく入力してください。");
      return;
    }

    if (isSignUpMode) {
      firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(() => {
          alert("アカウントが作成され、ログインしました！");
        })
        .catch(err => {
          alert("新規登録エラー: " + err.message);
        });
    } else {
      firebase.auth().signInWithEmailAndPassword(email, password)
        .catch(err => {
          alert("ログインエラー: " + err.message);
        });
    }
  };
}

if (logoutBtn) {
  logoutBtn.onclick = function () {
    if (confirm("ログアウトしますか？")) {
      firebase.auth().signOut()
        .then(() => {
          alert("ログアウトしました。");
        })
        .catch(err => {
          alert("ログアウトエラー: " + err.message);
        });
    }
  };
}

// データのリアルタイム同期開始
function startSyncData() {
  if (!db || !currentUser) return;

  // 1. 商品データのリアルタイム同期
  const userProductsRef = db.collection('users').doc(currentUser.uid).collection('products');
  unsubscribeProducts = userProductsRef.orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    products = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      products.push({
        id: doc.id,
        ...data,
        purchaseDate: data.purchaseDate || data.date,
        saleDate: data.saleDate || ''
      });
    });
    render();
  }, err => {
    console.error("Firestore同期エラー:", err);
  });

  // 2. カテゴリーのロード
  const userCategoriesRef = db.collection('users').doc(currentUser.uid).collection('categories').doc('list');
  userCategoriesRef.get().then(doc => {
    if (doc.exists) {
      const data = doc.data();
      if (Array.isArray(data.names)) {
        categories = [...new Set([...DEFAULT_CATEGORIES, ...data.names])];
      }
    } else {
      categories = [...DEFAULT_CATEGORIES];
    }
    updateCategorySelects();
    render();
  }).catch(err => {
    console.error("カテゴリ取得エラー:", err);
    categories = [...DEFAULT_CATEGORIES];
    updateCategorySelects();
    render();
  });
}

// --- 初期化 ---
window.onload = function () {
  setupTabs();

  if (db) {
    // Firebase設定済みの場合は認証状態を監視
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        currentUser = user;
        if (authContainer) authContainer.classList.add('hidden');
        if (userEmailDisplay) userEmailDisplay.textContent = user.email;
        if (userInfoBar) userInfoBar.classList.remove('hidden');
        document.body.classList.remove('auth-mode');
        
        startSyncData();
      } else {
        currentUser = null;
        if (authContainer) authContainer.classList.remove('hidden');
        if (userInfoBar) userInfoBar.classList.add('hidden');
        document.body.classList.add('auth-mode');
        
        if (unsubscribeProducts) {
          unsubscribeProducts();
          unsubscribeProducts = null;
        }
        
        products = [];
        categories = [...DEFAULT_CATEGORIES];
        updateCategorySelects();
        render();
      }
    });
  } else {
    // Firebase未設定の場合はLocalStorageフォールバック
    if (authContainer) authContainer.classList.add('hidden');
    if (userInfoBar) userInfoBar.classList.add('hidden');
    document.body.classList.remove('auth-mode');

    loadCategories();
    updateCategorySelects();
    loadData();
    render();
  }
};
