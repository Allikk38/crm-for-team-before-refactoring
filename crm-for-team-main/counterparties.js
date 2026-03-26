/**
 * ============================================
 * ФАЙЛ: counterparties.js
 * РОЛЬ: Логика управления контрагентами
 * СВЯЗИ:
 *   - core.js: loadCSV(), utils.saveCSVToGitHub()
 *   - auth.js: auth.getCurrentUser(), auth.hasPermission()
 *   - Данные: data/counterparties.csv, data/deals.csv
 * МЕХАНИКА:
 *   1. Загрузка контрагентов и сделок
 *   2. Отображение карточек контрагентов
 *   3. Фильтрация по типу, поиск
 *   4. CRUD операции с контрагентами
 *   5. Отображение связанных сделок
 *   6. Экспорт в CSV
 * ============================================
 */

// Используем let вместо var, чтобы избежать конфликтов с глобальными переменными
let counterpartiesData = [];
let dealsData = [];
let currentUserData = null;

// Типы контрагентов
const COUNTERPARTY_TYPES = {
    seller: { name: 'Продавец', icon: '🏠', class: 'type-seller' },
    buyer: { name: 'Покупатель', icon: '👤', class: 'type-buyer' },
    developer: { name: 'Застройщик', icon: '🏗️', class: 'type-developer' },
    investor: { name: 'Инвестор', icon: '💼', class: 'type-investor' }
};

// ========== ЗАГРУЗКА ДАННЫХ ==========

async function loadCounterparties() {
    console.log('[counterparties.js] Загрузка контрагентов...');
    try {
        const data = await loadCSV('data/counterparties.csv');
        
        // Проверяем, есть ли данные
        if (!data || data.length === 0) {
            console.warn('[counterparties.js] Файл counterparties.csv пуст или не найден, создаём пустой массив');
            counterpartiesData = [];
            renderCounterparties();
            return;
        }
        
        counterpartiesData = [];
        for (let i = 0; i < data.length; i++) {
            const c = data[i];
            counterpartiesData.push({
                id: parseInt(c.id),
                type: c.type || 'seller',
                person_type: c.person_type || 'individual',
                name: c.name || '',
                phone: c.phone || '',
                email: c.email || '',
                telegram: c.telegram || '',
                whatsapp: c.whatsapp || '',
                notes: c.notes || '',
                created_at: c.created_at || '',
                updated_at: c.updated_at || ''
            });
        }
        
        console.log('[counterparties.js] Загружено контрагентов:', counterpartiesData.length);
        renderCounterparties();
        
    } catch (error) {
        console.error('[counterparties.js] Ошибка загрузки контрагентов:', error);
        counterpartiesData = [];
        renderCounterparties();
        
        // Показываем пользователю понятное сообщение
        const grid = document.getElementById('counterpartiesGrid');
        if (grid) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Ошибка загрузки контрагентов</p><p style="font-size: 0.8rem;">Проверьте наличие файла data/counterparties.csv</p></div>';
        }
    }
}

async function loadDealsForCounterparties() {
    console.log('[counterparties.js] Загрузка сделок...');
    try {
        const data = await loadCSV('data/deals.csv');
        dealsData = [];
        if (data && data.length > 0) {
            for (let i = 0; i < data.length; i++) {
                const d = data[i];
                dealsData.push({
                    id: parseInt(d.id),
                    seller_id: parseInt(d.seller_id) || null,
                    buyer_id: parseInt(d.buyer_id) || null,
                    agent_id: d.agent_id || null,
                    status: d.status || 'new',
                    price_current: parseInt(d.price_current) || 0,
                    created_at: d.created_at || ''
                });
            }
        }
        console.log('[counterparties.js] Загружено сделок:', dealsData.length);
    } catch (error) {
        console.error('[counterparties.js] Ошибка загрузки сделок:', error);
        dealsData = [];
    }
}

// ========== ФИЛЬТРАЦИЯ ПО РОЛИ ==========

function filterCounterpartiesByRole() {
    if (!currentUserData) return [];
    
    // Админ и менеджер видят всё
    if (currentUserData.role === 'admin' || currentUserData.role === 'manager') {
        return counterpartiesData;
    }
    
    // Агент видит только своих клиентов (через сделки)
    if (currentUserData.role === 'agent') {
        // Находим сделки агента
        const agentDeals = dealsData.filter(function(d) {
            return d.agent_id === currentUserData.github_username;
        });
        
        // Собираем ID контрагентов из сделок агента
        const counterpartyIds = [];
        for (let i = 0; i < agentDeals.length; i++) {
            if (agentDeals[i].seller_id) counterpartyIds.push(agentDeals[i].seller_id);
            if (agentDeals[i].buyer_id) counterpartyIds.push(agentDeals[i].buyer_id);
        }
        
        return counterpartiesData.filter(function(c) {
            return counterpartyIds.indexOf(c.id) !== -1;
        });
    }
    
    // Наблюдатель видит только публичных (можно настроить позже)
    return [];
}

// ========== RENDER КАРТОЧЕК ==========

function renderCounterparties() {
    console.log('[counterparties.js] Рендеринг контрагентов...');
    const grid = document.getElementById('counterpartiesGrid');
    if (!grid) return;
    
    const filtered = filterCounterpartiesByRole();
    const searchText = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const typeFilter = document.getElementById('typeFilter')?.value || 'all';
    const personTypeFilter = document.getElementById('personTypeFilter')?.value || 'all';
    
    // Фильтрация
    const displayList = filtered.filter(function(c) {
        const matchSearch = searchText === '' ||
            c.name.toLowerCase().includes(searchText) ||
            (c.phone && c.phone.includes(searchText)) ||
            (c.email && c.email.toLowerCase().includes(searchText));
        
        const matchType = typeFilter === 'all' || c.type === typeFilter;
        const matchPersonType = personTypeFilter === 'all' || c.person_type === personTypeFilter;
        
        return matchSearch && matchType && matchPersonType;
    });
    
    if (displayList.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Нет контрагентов</p><p style="font-size: 0.8rem;">Добавьте первого контрагента</p></div>';
        return;
    }
    
    let html = '';
    for (let i = 0; i < displayList.length; i++) {
        const c = displayList[i];
        const typeInfo = COUNTERPARTY_TYPES[c.type] || COUNTERPARTY_TYPES.seller;
        
        // Получаем связанные сделки
        const relatedDeals = getDealsByCounterparty(c.id);
        const dealsCount = relatedDeals.length;
        const activeDeals = relatedDeals.filter(function(d) {
            return d.status !== 'closed' && d.status !== 'cancelled';
        }).length;
        
        // Аватар (инициалы или иконка)
        const avatarText = getInitials(c.name);
        
        html += '<div class="counterparty-card" onclick="openCounterpartyModal(' + c.id + ')">' +
            '<div class="counterparty-card-header">' +
                '<div class="counterparty-avatar">' +
                    (c.person_type === 'legal' ? '<i class="fas fa-building"></i>' : avatarText) +
                '</div>' +
                '<div class="counterparty-info">' +
                    '<h3>' + escapeHtml(c.name) + 
                        '<span class="counterparty-type ' + typeInfo.class + '">' + typeInfo.icon + ' ' + typeInfo.name + '</span>' +
                    '</h3>' +
                    '<div class="counterparty-contacts">' +
                        (c.phone ? '<span><i class="fas fa-phone"></i> ' + escapeHtml(c.phone) + '</span>' : '') +
                        (c.email ? '<span><i class="fas fa-envelope"></i> ' + escapeHtml(c.email) + '</span>' : '') +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="counterparty-card-body">' +
                '<div class="counterparty-stats">' +
                    '<div class="counterparty-stat"><i class="fas fa-handshake"></i> Сделок: ' + dealsCount + '</div>' +
                    '<div class="counterparty-stat"><i class="fas fa-play-circle"></i> Активных: ' + activeDeals + '</div>' +
                    (c.telegram ? '<div class="counterparty-stat"><i class="fab fa-telegram"></i> Telegram</div>' : '') +
                    (c.whatsapp ? '<div class="counterparty-stat"><i class="fab fa-whatsapp"></i> WhatsApp</div>' : '') +
                '</div>' +
                (c.notes ? '<div class="counterparty-notes"><i class="fas fa-sticky-note"></i> ' + escapeHtml(c.notes.substring(0, 80)) + (c.notes.length > 80 ? '...' : '') + '</div>' : '') +
            '</div>' +
            '<div class="counterparty-card-footer">' +
                '<button class="counterparty-btn" onclick="event.stopPropagation(); editCounterparty(' + c.id + ')"><i class="fas fa-edit"></i> Редактировать</button>' +
                '<button class="counterparty-btn" onclick="event.stopPropagation(); createDealForCounterparty(' + c.id + ', \'' + c.type + '\')"><i class="fas fa-handshake"></i> Создать сделку</button>' +
                '<button class="counterparty-btn danger" onclick="event.stopPropagation(); deleteCounterparty(' + c.id + ')"><i class="fas fa-trash"></i> Удалить</button>' +
            '</div>' +
        '</div>';
    }
    
    grid.innerHTML = html;
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function getDealsByCounterparty(counterpartyId) {
    return dealsData.filter(function(d) {
        return d.seller_id === counterpartyId || d.buyer_id === counterpartyId;
    });
}

// ========== CRUD КОНТРАГЕНТОВ ==========

function openCounterpartyModal(counterpartyId) {
    const modal = document.getElementById('counterpartyModal');
    const modalTitle = document.getElementById('modalTitle');
    const relatedDealsSection = document.getElementById('relatedDealsSection');
    
    if (counterpartyId) {
        modalTitle.innerHTML = '<i class="fas fa-user-edit"></i> Редактировать контрагента';
        let counterparty = null;
        for (let i = 0; i < counterpartiesData.length; i++) {
            if (counterpartiesData[i].id === counterpartyId) {
                counterparty = counterpartiesData[i];
                break;
            }
        }
        if (counterparty) {
            document.getElementById('counterpartyId').value = counterparty.id;
            document.getElementById('counterpartyType').value = counterparty.type;
            document.getElementById('counterpartyPersonType').value = counterparty.person_type;
            document.getElementById('counterpartyName').value = counterparty.name;
            document.getElementById('counterpartyPhone').value = counterparty.phone || '';
            document.getElementById('counterpartyEmail').value = counterparty.email || '';
            document.getElementById('counterpartyTelegram').value = counterparty.telegram || '';
            document.getElementById('counterpartyWhatsapp').value = counterparty.whatsapp || '';
            document.getElementById('counterpartyNotes').value = counterparty.notes || '';
            
            // Показываем связанные сделки
            const relatedDeals = getDealsByCounterparty(counterpartyId);
            if (relatedDeals.length > 0) {
                relatedDealsSection.style.display = 'block';
                renderRelatedDeals(relatedDeals);
            } else {
                relatedDealsSection.style.display = 'none';
            }
        }
    } else {
        modalTitle.innerHTML = '<i class="fas fa-user-plus"></i> Новый контрагент';
        document.getElementById('counterpartyId').value = '';
        document.getElementById('counterpartyType').value = 'seller';
        document.getElementById('counterpartyPersonType').value = 'individual';
        document.getElementById('counterpartyName').value = '';
        document.getElementById('counterpartyPhone').value = '';
        document.getElementById('counterpartyEmail').value = '';
        document.getElementById('counterpartyTelegram').value = '';
        document.getElementById('counterpartyWhatsapp').value = '';
        document.getElementById('counterpartyNotes').value = '';
        relatedDealsSection.style.display = 'none';
    }
    
    modal.classList.add('active');
}

function closeCounterpartyFormModal() {
    document.getElementById('counterpartyModal').classList.remove('active');
}

function renderRelatedDeals(relatedDeals) {
    const container = document.getElementById('relatedDealsList');
    if (!container) return;
    
    const statusLabels = {
        new: '🆕 Новая',
        showing: '👁️ Показ',
        negotiation: '💰 Торг',
        deposit: '💎 Задаток',
        documents: '📋 Документы',
        contract: '✍️ Договор',
        payment: '💵 Расчёт',
        closed: '✅ Закрыта',
        cancelled: '❌ Отказ'
    };
    
    let html = '';
    for (let i = 0; i < relatedDeals.length; i++) {
        const d = relatedDeals[i];
        const statusText = statusLabels[d.status] || d.status;
        html += '<div class="deal-item" onclick="goToDeal(' + d.id + ')">' +
            '<span>Сделка №' + d.id + '</span>' +
            '<span class="deal-status">' + statusText + '</span>' +
            '<span>' + (d.price_current || 0).toLocaleString() + ' ₽</span>' +
        '</div>';
    }
    
    container.innerHTML = html;
}

async function saveCounterparty() {
    const id = document.getElementById('counterpartyId').value;
    const counterpartyData = {
        type: document.getElementById('counterpartyType').value,
        person_type: document.getElementById('counterpartyPersonType').value,
        name: document.getElementById('counterpartyName').value.trim(),
        phone: document.getElementById('counterpartyPhone').value.trim(),
        email: document.getElementById('counterpartyEmail').value.trim(),
        telegram: document.getElementById('counterpartyTelegram').value.trim(),
        whatsapp: document.getElementById('counterpartyWhatsapp').value.trim(),
        notes: document.getElementById('counterpartyNotes').value.trim()
    };
    
    if (!counterpartyData.name) {
        alert('Введите имя/название');
        return;
    }
    
    if (id) {
        await updateCounterparty(parseInt(id), counterpartyData);
    } else {
        await createCounterparty(counterpartyData);
    }
    
    closeCounterpartyFormModal();
}

async function createCounterparty(data) {
    if (!currentUserData || (currentUserData.role !== 'admin' && currentUserData.role !== 'manager')) {
        showToast('error', 'У вас нет прав на создание контрагентов');
        return;
    }
    
    let maxId = 0;
    for (let i = 0; i < counterpartiesData.length; i++) {
        if (counterpartiesData[i].id > maxId) maxId = counterpartiesData[i].id;
    }
    const newId = maxId + 1;
    
    const newCounterparty = {
        id: newId,
        type: data.type,
        person_type: data.person_type,
        name: data.name,
        phone: data.phone,
        email: data.email,
        telegram: data.telegram,
        whatsapp: data.whatsapp,
        notes: data.notes,
        created_at: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString().split('T')[0]
    };
    
    counterpartiesData.push(newCounterparty);
    await saveCounterpartiesToGitHub();
    renderCounterparties();
    showToast('success', 'Контрагент добавлен');
}

async function updateCounterparty(id, data) {
    let index = -1;
    for (let i = 0; i < counterpartiesData.length; i++) {
        if (counterpartiesData[i].id === id) {
            index = i;
            break;
        }
    }
    
    if (index !== -1) {
        counterpartiesData[index] = {
            ...counterpartiesData[index],
            type: data.type,
            person_type: data.person_type,
            name: data.name,
            phone: data.phone,
            email: data.email,
            telegram: data.telegram,
            whatsapp: data.whatsapp,
            notes: data.notes,
            updated_at: new Date().toISOString().split('T')[0]
        };
        
        await saveCounterpartiesToGitHub();
        renderCounterparties();
        showToast('success', 'Контрагент обновлён');
    }
}

function editCounterparty(id) {
    openCounterpartyModal(id);
}

async function deleteCounterparty(id) {
    let counterparty = null;
    for (let i = 0; i < counterpartiesData.length; i++) {
        if (counterpartiesData[i].id === id) {
            counterparty = counterpartiesData[i];
            break;
        }
    }
    
    if (!counterparty) return;
    
    if (!confirm('Вы уверены, что хотите удалить контрагента "' + counterparty.name + '"?')) {
        return;
    }
    
    const newList = [];
    for (let i = 0; i < counterpartiesData.length; i++) {
        if (counterpartiesData[i].id !== id) newList.push(counterpartiesData[i]);
    }
    counterpartiesData = newList;
    await saveCounterpartiesToGitHub();
    renderCounterparties();
    showToast('success', 'Контрагент удалён');
}

async function saveCounterpartiesToGitHub() {
    if (!currentUserData) return false;
    
    const dataToSave = [];
    for (let i = 0; i < counterpartiesData.length; i++) {
        const c = counterpartiesData[i];
        dataToSave.push({
            id: c.id,
            type: c.type,
            person_type: c.person_type,
            name: c.name,
            phone: c.phone,
            email: c.email,
            telegram: c.telegram,
            whatsapp: c.whatsapp,
            notes: c.notes,
            created_at: c.created_at,
            updated_at: c.updated_at
        });
    }
    
    return await window.utils.saveCSVToGitHub(
        'data/counterparties.csv',
        dataToSave,
        'Update counterparties by ' + currentUserData.name
    );
}

// ========== ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ==========

function createDealForCounterparty(counterpartyId, type) {
    // Перенаправляем на страницу создания заявки с предзаполненным полем
    let url = 'deals.html?';
    if (type === 'seller') {
        url += 'seller=' + counterpartyId;
    } else if (type === 'buyer') {
        url += 'buyer=' + counterpartyId;
    }
    window.location.href = url;
}

function goToDeal(dealId) {
    window.location.href = 'deals.html?deal=' + dealId;
}

function exportCounterparties() {
    const filtered = filterCounterpartiesByRole();
    const dataToExport = filtered.map(function(c) {
        return {
            'Тип': COUNTERPARTY_TYPES[c.type]?.name || c.type,
            'Имя': c.name,
            'Телефон': c.phone,
            'Email': c.email,
            'Telegram': c.telegram,
            'WhatsApp': c.whatsapp,
            'Примечания': c.notes,
            'Дата создания': c.created_at
        };
    });
    
    const csv = arrayToCSV(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', 'counterparties.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', 'Экспорт завершён');
}

function arrayToCSV(data) {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = [
        headers.join(','),
        ...data.map(obj => headers.map(header => {
            let value = obj[header] || '';
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        }).join(','))
    ];
    return rows.join('\n');
}

function showToast(type, message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle') + '"></i><span>' + escapeHtml(message) + '</span>';
    document.body.appendChild(toast);
    setTimeout(function() {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========

async function init() {
    console.log('[counterparties.js] === ИНИЦИАЛИЗАЦИЯ ===');
    
    // Получаем текущего пользователя из глобального объекта auth
    if (window.auth && typeof window.auth.getCurrentUser === 'function') {
        await window.auth.initAuth();
        currentUserData = window.auth.getCurrentUser();
    } else {
        console.error('[counterparties.js] Auth модуль не найден');
        currentUserData = null;
    }
    
    console.log('[counterparties.js] Пользователь:', currentUserData ? currentUserData.name + ' (' + currentUserData.role + ')' : 'не авторизован');
    
    if (!currentUserData) {
        window.location.href = 'auth.html';
        return;
    }
    
    await loadDealsForCounterparties();
    await loadCounterparties();
    renderCounterparties();
    
    // Обработчики фильтров
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', renderCounterparties);
    
    const typeFilter = document.getElementById('typeFilter');
    if (typeFilter) typeFilter.addEventListener('change', renderCounterparties);
    
    const personTypeFilter = document.getElementById('personTypeFilter');
    if (personTypeFilter) personTypeFilter.addEventListener('change', renderCounterparties);
    
    const addBtn = document.getElementById('addCounterpartyBtn');
    if (addBtn) addBtn.addEventListener('click', function() { openCounterpartyModal(); });
    
    if (window.theme && typeof window.theme.initTheme === 'function') window.theme.initTheme();
    if (window.sidebar && typeof window.sidebar.initSidebar === 'function') window.sidebar.initSidebar();
    
    console.log('[counterparties.js] === ИНИЦИАЛИЗАЦИЯ ЗАВЕРШЕНА ===');
}

// Запускаем инициализацию после загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
