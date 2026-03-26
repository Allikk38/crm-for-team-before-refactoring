/**
 * ============================================
 * ФАЙЛ: deals.js
 * РОЛЬ: Логика управления заявками (Kanban-доска)
 * СВЯЗИ:
 *   - core.js: loadCSV(), utils.saveCSVToGitHub()
 *   - auth.js: auth.getCurrentUser(), auth.hasPermission()
 *   - Данные: data/deals.csv, data/counterparties.csv, data/complexes.csv, data/users.csv
 * МЕХАНИКА:
 *   1. Загрузка заявок, контрагентов, объектов, пользователей
 *   2. Отображение Kanban-доски с 9 статусами
 *   3. Drag-and-drop для изменения статуса заявки
 *   4. CRUD операции с заявками
 *   5. Фильтрация по роли пользователя
 *   6. Интеграция с объектами и контрагентами
 *   7. Сохранение всех изменений в GitHub
 * ============================================
 */

// Глобальные переменные модуля
let dealsData = [];
let counterpartiesData = [];
let complexesData = [];
let usersData = [];
let currentUserData = null;
let draggedDeal = null;

// Статусы заявок (порядок важен для Kanban)
const DEAL_STATUSES = [
    { id: 'new', name: 'Новая', icon: 'N', color: '#9e9e9e' },
    { id: 'showing', name: 'Показ', icon: 'V', color: '#2196f3' },
    { id: 'negotiation', name: 'Торг', icon: 'R', color: '#ffc107' },
    { id: 'deposit', name: 'Задаток', icon: 'D', color: '#9c27b0' },
    { id: 'documents', name: 'Документы', icon: 'P', color: '#ff9800' },
    { id: 'contract', name: 'Договор', icon: 'S', color: '#f44336' },
    { id: 'payment', name: 'Расчёт', icon: 'M', color: '#4caf50' },
    { id: 'closed', name: 'Закрыта', icon: 'C', color: '#607d8b' },
    { id: 'cancelled', name: 'Отказ', icon: 'X', color: '#9e9e9e' }
];

// Типы сделок
const DEAL_TYPES = {
    primary: { name: 'Первичка', icon: 'P', class: 'type-primary' },
    secondary: { name: 'Вторичка', icon: 'S', class: 'type-secondary' },
    exchange: { name: 'Альтернатива', icon: 'A', class: 'type-exchange' },
    urgent: { name: 'Срочный выкуп', icon: 'U', class: 'type-urgent' }
};

// ========== ЗАГРУЗКА ДАННЫХ ==========

async function loadDeals() {
    console.log('[deals.js] Загрузка заявок...');
    try {
        const dealsCsv = await loadCSV('data/deals.csv');
        
        if (!dealsCsv || dealsCsv.length === 0) {
            console.warn('[deals.js] Файл deals.csv пуст или не найден, создаём пустой массив');
            dealsData = [];
            renderKanban();
            return;
        }
        
        dealsData = [];
        for (let i = 0; i < dealsCsv.length; i++) {
            const d = dealsCsv[i];
            dealsData.push({
                id: parseInt(d.id),
                complex_id: parseInt(d.complex_id) || null,
                apartment: d.apartment || '',
                seller_id: parseInt(d.seller_id) || null,
                buyer_id: parseInt(d.buyer_id) || null,
                agent_id: d.agent_id || '',
                type: d.type || 'secondary',
                status: d.status || 'new',
                price_initial: parseInt(d.price_initial) || 0,
                price_current: parseInt(d.price_current) || 0,
                commission: parseFloat(d.commission) || 3,
                deadline: d.deadline || '',
                bank: d.bank || '',
                mortgage_approved: d.mortgage_approved === 'true',
                notes: d.notes || '',
                created_at: d.created_at || '',
                updated_at: d.updated_at || ''
            });
        }
        
        console.log('[deals.js] Загружено заявок:', dealsData.length);
        
        if (window.notifications && window.notifications.checkDeadlines) {
            window.notifications.checkDeadlines(dealsData);
        }
        
        renderKanban();
        
    } catch (error) {
        console.error('[deals.js] Ошибка загрузки заявок:', error);
        dealsData = [];
        renderKanban();
        
        const board = document.getElementById('kanbanBoard');
        if (board) {
            board.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Ошибка загрузки заявок</p><p style="font-size: 0.8rem;">Проверьте наличие файла data/deals.csv</p></div>';
        }
    }
}

async function loadCounterpartiesForDeals() {
    console.log('[deals.js] Загрузка контрагентов...');
    try {
        const data = await loadCSV('data/counterparties.csv');
        counterpartiesData = [];
        if (data && data.length > 0) {
            for (let i = 0; i < data.length; i++) {
                const c = data[i];
                counterpartiesData.push({
                    id: parseInt(c.id),
                    type: c.type || 'seller',
                    person_type: c.person_type || 'individual',
                    name: c.name || '',
                    phone: c.phone || '',
                    email: c.email || '',
                    notes: c.notes || '',
                    created_at: c.created_at || ''
                });
            }
        }
        console.log('[deals.js] Загружено контрагентов:', counterpartiesData.length);
    } catch (error) {
        console.error('[deals.js] Ошибка загрузки контрагентов:', error);
        counterpartiesData = [];
    }
}

async function loadComplexesForDeals() {
    console.log('[deals.js] Загрузка объектов...');
    try {
        complexesData = await loadCSV('data/complexes.csv');
        console.log('[deals.js] Загружено объектов:', complexesData.length);
        
        const complexSelect = document.getElementById('dealComplex');
        if (complexSelect) {
            complexSelect.innerHTML = '<option value="">Выберите объект</option>';
            for (let i = 0; i < complexesData.length; i++) {
                const c = complexesData[i];
                const option = document.createElement('option');
                option.value = c.id;
                option.textContent = c.title + ' (' + c.address + ')';
                complexSelect.appendChild(option);
            }
        }
    } catch (error) {
        console.error('[deals.js] Ошибка загрузки объектов:', error);
        complexesData = [];
    }
}

async function loadUsersForDeals() {
    console.log('[deals.js] Загрузка пользователей...');
    try {
        usersData = await loadCSV('data/users.csv');
        console.log('[deals.js] Загружено пользователей:', usersData.length);
        
        const agentSelect = document.getElementById('dealAgent');
        if (agentSelect) {
            agentSelect.innerHTML = '<option value="">Выберите агента</option>';
            for (let i = 0; i < usersData.length; i++) {
                const u = usersData[i];
                if (u.role === 'agent' || u.role === 'manager' || u.role === 'admin') {
                    const option = document.createElement('option');
                    option.value = u.github_username;
                    option.textContent = u.name + ' (' + u.role + ')';
                    agentSelect.appendChild(option);
                }
            }
        }
        
        updateCounterpartySelects();
    } catch (error) {
        console.error('[deals.js] Ошибка загрузки пользователей:', error);
        usersData = [];
    }
}

function updateCounterpartySelects() {
    const sellerSelect = document.getElementById('dealSeller');
    const buyerSelect = document.getElementById('dealBuyer');
    
    if (sellerSelect) {
        sellerSelect.innerHTML = '<option value="">Выберите продавца</option>';
        for (let i = 0; i < counterpartiesData.length; i++) {
            const c = counterpartiesData[i];
            if (c.type === 'seller' || c.type === 'developer') {
                const option = document.createElement('option');
                option.value = c.id;
                option.textContent = c.name + (c.phone ? ' (' + c.phone + ')' : '');
                sellerSelect.appendChild(option);
            }
        }
    }
    
    if (buyerSelect) {
        buyerSelect.innerHTML = '<option value="">Выберите покупателя</option>';
        for (let i = 0; i < counterpartiesData.length; i++) {
            const c = counterpartiesData[i];
            if (c.type === 'buyer' || c.type === 'investor') {
                const option = document.createElement('option');
                option.value = c.id;
                option.textContent = c.name + (c.phone ? ' (' + c.phone + ')' : '');
                buyerSelect.appendChild(option);
            }
        }
    }
}

// ========== ФИЛЬТРАЦИЯ ПО РОЛИ ==========

function filterDealsByRole() {
    if (!currentUserData) return [];
    
    if (currentUserData.role === 'admin' || currentUserData.role === 'manager') {
        console.log('[deals.js] Фильтрация: admin/manager, показываем все заявки:', dealsData.length);
        return dealsData;
    }
    
    if (currentUserData.role === 'agent') {
        const filtered = dealsData.filter(function(deal) {
            return deal.agent_id === currentUserData.github_username;
        });
        console.log('[deals.js] Фильтрация: agent, своих заявок:', filtered.length);
        return filtered;
    }
    
    const filtered = dealsData.filter(function(deal) {
        return deal.status === 'closed' || deal.status === 'cancelled';
    });
    console.log('[deals.js] Фильтрация: viewer, закрытых заявок:', filtered.length);
    return filtered;
}

// ========== RENDER KANBAN ==========

function renderKanban() {
    console.log('[deals.js] Рендеринг Kanban-доски...');
    const board = document.getElementById('kanbanBoard');
    if (!board) return;
    
    const filteredDeals = filterDealsByRole();
    const searchText = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const typeFilter = document.getElementById('typeFilter')?.value || 'all';
    const agentFilter = document.getElementById('agentFilter')?.value || 'all';
    
    const displayDeals = filteredDeals.filter(function(deal) {
        const complex = getComplexById(deal.complex_id);
        const seller = getCounterpartyById(deal.seller_id);
        const buyer = getCounterpartyById(deal.buyer_id);
        
        const matchSearch = searchText === '' ||
            deal.id.toString().includes(searchText) ||
            (complex && complex.title.toLowerCase().includes(searchText)) ||
            (seller && seller.name.toLowerCase().includes(searchText)) ||
            (buyer && buyer.name.toLowerCase().includes(searchText));
        
        const matchType = typeFilter === 'all' || deal.type === typeFilter;
        const matchAgent = agentFilter === 'all' || deal.agent_id === agentFilter;
        
        return matchSearch && matchType && matchAgent;
    });
    
    console.log('[deals.js] После фильтрации заявок:', displayDeals.length);
    
    const dealsByStatus = {};
    for (let i = 0; i < DEAL_STATUSES.length; i++) {
        dealsByStatus[DEAL_STATUSES[i].id] = [];
    }
    
    for (let i = 0; i < displayDeals.length; i++) {
        const deal = displayDeals[i];
        if (dealsByStatus[deal.status]) {
            dealsByStatus[deal.status].push(deal);
        } else {
            dealsByStatus['new'].push(deal);
        }
    }
    
    let html = '';
    for (let i = 0; i < DEAL_STATUSES.length; i++) {
        const status = DEAL_STATUSES[i];
        const statusDeals = dealsByStatus[status.id] || [];
        
        html += '<div class="deal-column" data-status="' + status.id + '">' +
            '<div class="deal-column-header" style="border-top: 3px solid ' + status.color + ';">' +
                '<span><span class="status-icon">' + status.icon + '</span> ' + status.name + '</span>' +
                '<span class="count">' + statusDeals.length + '</span>' +
            '</div>' +
            '<div class="deals-container" data-status="' + status.id + '">';
        
        for (let j = 0; j < statusDeals.length; j++) {
            html += createDealCard(statusDeals[j]);
        }
        
        if (statusDeals.length === 0) {
            html += '<div class="empty-deals"><i class="fas fa-inbox"></i><p>Нет заявок</p></div>';
        }
        
        html += '</div></div>';
    }
    
    board.innerHTML = html;
    
    setupDragAndDrop();
    
    document.querySelectorAll('.deal-card').forEach(function(card) {
        card.addEventListener('click', function(e) {
            if (!e.target.closest('.delete-deal')) {
                const dealId = parseInt(this.getAttribute('data-deal-id'));
                openDealModal(dealId);
            }
        });
    });
    
    updateAgentFilter();
    
    console.log('[deals.js] Рендеринг завершён');
}

function createDealCard(deal) {
    const complex = getComplexById(deal.complex_id);
    const seller = getCounterpartyById(deal.seller_id);
    const buyer = getCounterpartyById(deal.buyer_id);
    const dealType = DEAL_TYPES[deal.type] || DEAL_TYPES.secondary;
    
    const priceFormatted = (deal.price_current || deal.price_initial).toLocaleString();
    let deadlineClass = '';
    if (deal.deadline) {
        const today = new Date().toISOString().split('T')[0];
        if (deal.deadline < today && deal.status !== 'closed' && deal.status !== 'cancelled') {
            deadlineClass = 'overdue';
        }
    }
    
    const canEdit = canEditDeal(deal);
    
    return '<div class="deal-card" data-deal-id="' + deal.id + '" draggable="' + canEdit + '">' +
        '<div class="deal-title">' +
            '<span>Заявка N' + deal.id + '</span>' +
            '<span class="deal-number">' + (complex ? complex.title : '—') + '</span>' +
        '</div>' +
        '<div class="deal-participants">' +
            '<span title="Продавец">S: ' + (seller ? escapeHtml(seller.name) : '—') + '</span>' +
            '<span>→</span>' +
            '<span title="Покупатель">B: ' + (buyer ? escapeHtml(buyer.name) : '—') + '</span>' +
        '</div>' +
        '<div class="deal-price">' +
            '<span class="deal-type ' + dealType.class + '">' + dealType.icon + ' ' + dealType.name + '</span>' +
            '<span>' + priceFormatted + ' RUB</span>' +
        '</div>' +
        '<div class="deal-meta">' +
            '<span><i class="fas fa-user-tie"></i> ' + (deal.agent_id || '—') + '</span>' +
            '<span class="' + deadlineClass + '"><i class="fas fa-calendar"></i> ' + (deal.deadline || '—') + '</span>' +
        '</div>' +
        (canEdit ? '<div class="deal-meta" style="margin-top: 8px;"><button class="delete-deal" onclick="event.stopPropagation(); deleteDeal(' + deal.id + ')"><i class="fas fa-trash"></i> Удалить</button></div>' : '') +
    '</div>';
}

function getComplexById(id) {
    if (!id) return null;
    for (let i = 0; i < complexesData.length; i++) {
        if (complexesData[i].id == id) return complexesData[i];
    }
    return null;
}

function getCounterpartyById(id) {
    if (!id) return null;
    for (let i = 0; i < counterpartiesData.length; i++) {
        if (counterpartiesData[i].id == id) return counterpartiesData[i];
    }
    return null;
}

// ========== DRAG AND DROP ==========

function setupDragAndDrop() {
    const cards = document.querySelectorAll('.deal-card[draggable="true"]');
    const containers = document.querySelectorAll('.deals-container');
    
    cards.forEach(function(card) {
        card.removeEventListener('dragstart', handleDragStart);
        card.removeEventListener('dragend', handleDragEnd);
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
    });
    
    containers.forEach(function(container) {
        container.removeEventListener('dragover', handleDragOver);
        container.removeEventListener('drop', handleDrop);
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    draggedDeal = e.target.closest('.deal-card');
    if (draggedDeal) {
        draggedDeal.classList.add('dragging');
        e.dataTransfer.setData('text/plain', draggedDeal.getAttribute('data-deal-id'));
        console.log('[deals.js] Начат drag заявки:', draggedDeal.getAttribute('data-deal-id'));
    }
}

function handleDragEnd(e) {
    if (draggedDeal) {
        draggedDeal.classList.remove('dragging');
        draggedDeal = null;
        console.log('[deals.js] Drag завершён');
    }
}

function handleDragOver(e) {
    e.preventDefault();
}

async function handleDrop(e) {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('text/plain');
    const newStatus = e.target.closest('.deal-column')?.getAttribute('data-status');
    
    if (dealId && newStatus) {
        console.log('[deals.js] Drop заявки', dealId, 'в статус', newStatus);
        await updateDealStatus(parseInt(dealId), newStatus);
    }
}

async function updateDealStatus(dealId, newStatus) {
    console.log('[deals.js] Обновление статуса заявки', dealId, '->', newStatus);
    let deal = null;
    for (let i = 0; i < dealsData.length; i++) {
        if (dealsData[i].id === dealId) {
            deal = dealsData[i];
            break;
        }
    }
    
    if (!deal) {
        console.error('[deals.js] Заявка не найдена:', dealId);
        return;
    }
    
    if (!canEditDeal(deal)) {
        console.warn('[deals.js] Нет прав на изменение заявки:', dealId);
        showToast('error', 'У вас нет прав на изменение этой заявки');
        return;
    }
    
    if (deal.status !== newStatus) {
        deal.status = newStatus;
        deal.updated_at = new Date().toISOString().split('T')[0];
        await saveDealsToGitHub();
        renderKanban();
        showToast('success', 'Статус заявки N' + dealId + ' изменён на "' + getStatusName(newStatus) + '"');
        console.log('[deals.js] Статус заявки обновлён:', dealId, newStatus);
    }
}

function getStatusName(statusId) {
    for (let i = 0; i < DEAL_STATUSES.length; i++) {
        if (DEAL_STATUSES[i].id === statusId) return DEAL_STATUSES[i].name;
    }
    return statusId;
}

// ========== CRUD ЗАЯВОК ==========

function canEditDeal(deal) {
    if (!currentUserData) return false;
    if (currentUserData.role === 'admin') return true;
    if (currentUserData.role === 'manager') return true;
    if (currentUserData.role === 'agent') {
        return deal.agent_id === currentUserData.github_username;
    }
    return false;
}

function openDealModal(dealId) {
    console.log('[deals.js] Открытие модального окна заявки:', dealId || 'новая');
    const modal = document.getElementById('dealModal');
    const modalTitle = document.getElementById('modalTitle');
    
    if (dealId) {
        modalTitle.textContent = 'Редактировать заявку';
        let deal = null;
        for (let i = 0; i < dealsData.length; i++) {
            if (dealsData[i].id === dealId) {
                deal = dealsData[i];
                break;
            }
        }
        if (deal) {
            document.getElementById('dealId').value = deal.id;
            document.getElementById('dealComplex').value = deal.complex_id || '';
            document.getElementById('dealApartment').value = deal.apartment || '';
            document.getElementById('dealSeller').value = deal.seller_id || '';
            document.getElementById('dealBuyer').value = deal.buyer_id || '';
            document.getElementById('dealType').value = deal.type;
            document.getElementById('dealAgent').value = deal.agent_id || '';
            document.getElementById('dealPriceInitial').value = deal.price_initial;
            document.getElementById('dealPriceCurrent').value = deal.price_current;
            document.getElementById('dealCommission').value = deal.commission;
            document.getElementById('dealDeadline').value = deal.deadline || '';
            document.getElementById('dealBank').value = deal.bank || '';
            document.getElementById('dealMortgageApproved').value = deal.mortgage_approved ? 'true' : 'false';
            document.getElementById('dealNotes').value = deal.notes || '';
        }
    } else {
        modalTitle.textContent = 'Создать заявку';
        document.getElementById('dealId').value = '';
        document.getElementById('dealComplex').value = '';
        document.getElementById('dealApartment').value = '';
        document.getElementById('dealSeller').value = '';
        document.getElementById('dealBuyer').value = '';
        document.getElementById('dealType').value = 'secondary';
        document.getElementById('dealAgent').value = currentUserData?.github_username || '';
        document.getElementById('dealPriceInitial').value = '';
        document.getElementById('dealPriceCurrent').value = '';
        document.getElementById('dealCommission').value = '3';
        document.getElementById('dealDeadline').value = '';
        document.getElementById('dealBank').value = '';
        document.getElementById('dealMortgageApproved').value = 'false';
        document.getElementById('dealNotes').value = '';
    }
    
    modal.classList.add('active');
}

function closeDealModal() {
    console.log('[deals.js] Закрытие модального окна');
    document.getElementById('dealModal').classList.remove('active');
}

async function saveDeal() {
    console.log('[deals.js] Сохранение заявки...');
    const dealId = document.getElementById('dealId').value;
    const dealData = {
        complex_id: document.getElementById('dealComplex').value ? parseInt(document.getElementById('dealComplex').value) : null,
        apartment: document.getElementById('dealApartment').value,
        seller_id: document.getElementById('dealSeller').value ? parseInt(document.getElementById('dealSeller').value) : null,
        buyer_id: document.getElementById('dealBuyer').value ? parseInt(document.getElementById('dealBuyer').value) : null,
        type: document.getElementById('dealType').value,
        agent_id: document.getElementById('dealAgent').value,
        price_initial: parseInt(document.getElementById('dealPriceInitial').value) || 0,
        price_current: parseInt(document.getElementById('dealPriceCurrent').value) || 0,
        commission: parseFloat(document.getElementById('dealCommission').value) || 3,
        deadline: document.getElementById('dealDeadline').value,
        bank: document.getElementById('dealBank').value,
        mortgage_approved: document.getElementById('dealMortgageApproved').value === 'true',
        notes: document.getElementById('dealNotes').value
    };
    
    if (!dealData.complex_id) {
        alert('Выберите объект');
        return;
    }
    
    if (dealId) {
        await updateDeal(parseInt(dealId), dealData);
    } else {
        await createDeal(dealData);
    }
    
    closeDealModal();
}

async function createDeal(dealData) {
    console.log('[deals.js] Создание новой заявки...');
    if (!currentUserData || (currentUserData.role !== 'admin' && currentUserData.role !== 'manager' && currentUserData.role !== 'agent')) {
        showToast('error', 'У вас нет прав на создание заявок');
        return;
    }
    
    let maxId = 0;
    for (let i = 0; i < dealsData.length; i++) {
        if (dealsData[i].id > maxId) maxId = dealsData[i].id;
    }
    const newId = maxId + 1;
    
    const newDeal = {
        id: newId,
        complex_id: dealData.complex_id,
        apartment: dealData.apartment,
        seller_id: dealData.seller_id,
        buyer_id: dealData.buyer_id,
        agent_id: dealData.agent_id || currentUserData.github_username,
        type: dealData.type,
        status: 'new',
        price_initial: dealData.price_initial,
        price_current: dealData.price_current || dealData.price_initial,
        commission: dealData.commission,
        deadline: dealData.deadline,
        bank: dealData.bank,
        mortgage_approved: dealData.mortgage_approved,
        notes: dealData.notes,
        created_at: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString().split('T')[0]
    };
    
    dealsData.push(newDeal);
    await saveDealsToGitHub();
    renderKanban();
    showToast('success', 'Заявка N' + newId + ' создана');
    console.log('[deals.js] Заявка создана:', newId);
}

async function updateDeal(dealId, dealData) {
    console.log('[deals.js] Обновление заявки:', dealId);
    let dealIndex = -1;
    for (let i = 0; i < dealsData.length; i++) {
        if (dealsData[i].id === dealId) {
            dealIndex = i;
            break;
        }
    }
    
    if (dealIndex !== -1) {
        const deal = dealsData[dealIndex];
        
        if (!canEditDeal(deal)) {
            showToast('error', 'У вас нет прав на редактирование этой заявки');
            return;
        }
        
        dealsData[dealIndex] = {
            ...deal,
            complex_id: dealData.complex_id,
            apartment: dealData.apartment,
            seller_id: dealData.seller_id,
            buyer_id: dealData.buyer_id,
            agent_id: dealData.agent_id,
            type: dealData.type,
            price_initial: dealData.price_initial,
            price_current: dealData.price_current,
            commission: dealData.commission,
            deadline: dealData.deadline,
            bank: dealData.bank,
            mortgage_approved: dealData.mortgage_approved,
            notes: dealData.notes,
            updated_at: new Date().toISOString().split('T')[0]
        };
        
        await saveDealsToGitHub();
        renderKanban();
        showToast('success', 'Заявка N' + dealId + ' обновлена');
        console.log('[deals.js] Заявка обновлена:', dealId);
    }
}

async function deleteDeal(dealId) {
    console.log('[deals.js] Удаление заявки:', dealId);
    let deal = null;
    for (let i = 0; i < dealsData.length; i++) {
        if (dealsData[i].id === dealId) {
            deal = dealsData[i];
            break;
        }
    }
    
    if (!deal) return;
    
    if (!canEditDeal(deal)) {
        showToast('error', 'У вас нет прав на удаление этой заявки');
        return;
    }
    
    if (confirm('Вы уверены, что хотите удалить заявку N' + dealId + '?')) {
        const newDeals = [];
        for (let i = 0; i < dealsData.length; i++) {
            if (dealsData[i].id !== dealId) newDeals.push(dealsData[i]);
        }
        dealsData = newDeals;
        await saveDealsToGitHub();
        renderKanban();
        showToast('success', 'Заявка N' + dealId + ' удалена');
        console.log('[deals.js] Заявка удалена:', dealId);
    }
}

async function saveDealsToGitHub() {
    console.log('[deals.js] Сохранение заявок в GitHub...');
    if (!currentUserData) return false;
    
    const dealsToSave = [];
    for (let i = 0; i < dealsData.length; i++) {
        const d = dealsData[i];
        dealsToSave.push({
            id: d.id,
            complex_id: d.complex_id || '',
            apartment: d.apartment,
            seller_id: d.seller_id || '',
            buyer_id: d.buyer_id || '',
            agent_id: d.agent_id,
            type: d.type,
            status: d.status,
            price_initial: d.price_initial,
            price_current: d.price_current,
            commission: d.commission,
            deadline: d.deadline || '',
            bank: d.bank || '',
            mortgage_approved: d.mortgage_approved ? 'true' : 'false',
            notes: d.notes || '',
            created_at: d.created_at,
            updated_at: d.updated_at
        });
    }
    
    const result = await window.utils.saveCSVToGitHub(
        'data/deals.csv',
        dealsToSave,
        'Update deals by ' + currentUserData.name
    );
    
    if (result) {
        console.log('[deals.js] Заявки сохранены успешно');
    } else {
        console.error('[deals.js] Ошибка сохранения заявок');
    }
    
    return result;
}

// ========== КОНТРАГЕНТЫ (быстрое создание) ==========

function openCounterpartyModal(type) {
    console.log('[deals.js] Открытие модального окна контрагента, тип:', type);
    document.getElementById('counterpartyType').value = type;
    document.getElementById('counterpartyModalTitle').innerHTML = '<i class="fas fa-user-plus"></i> Новый ' + (type === 'seller' ? 'продавец' : 'покупатель');
    document.getElementById('counterpartyModal').classList.add('active');
}

function closeCounterpartyModal() {
    console.log('[deals.js] Закрытие модального окна контрагента');
    document.getElementById('counterpartyModal').classList.remove('active');
    document.getElementById('counterpartyName').value = '';
    document.getElementById('counterpartyPhone').value = '';
    document.getElementById('counterpartyEmail').value = '';
    document.getElementById('counterpartyNotes').value = '';
}

async function saveCounterparty() {
    console.log('[deals.js] Сохранение контрагента...');
    const type = document.getElementById('counterpartyType').value;
    const name = document.getElementById('counterpartyName').value.trim();
    const phone = document.getElementById('counterpartyPhone').value.trim();
    const email = document.getElementById('counterpartyEmail').value.trim();
    const personType = document.getElementById('counterpartyPersonType').value;
    const notes = document.getElementById('counterpartyNotes').value.trim();
    
    if (!name) {
        alert('Введите имя/название');
        return;
    }
    
    let maxId = 0;
    for (let i = 0; i < counterpartiesData.length; i++) {
        if (counterpartiesData[i].id > maxId) maxId = counterpartiesData[i].id;
    }
    const newId = maxId + 1;
    
    const newCounterparty = {
        id: newId,
        type: type,
        person_type: personType,
        name: name,
        phone: phone,
        email: email,
        notes: notes,
        created_at: new Date().toISOString().split('T')[0]
    };
    
    counterpartiesData.push(newCounterparty);
    await saveCounterpartiesToGitHub();
    updateCounterpartySelects();
    closeCounterpartyModal();
    showToast('success', 'Контрагент добавлен');
    console.log('[deals.js] Контрагент сохранён:', newId);
}

async function saveCounterpartiesToGitHub() {
    console.log('[deals.js] Сохранение контрагентов в GitHub...');
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
            notes: c.notes,
            created_at: c.created_at
        });
    }
    
    return await window.utils.saveCSVToGitHub(
        'data/counterparties.csv',
        dataToSave,
        'Update counterparties by ' + (currentUserData ? currentUserData.name : 'system')
    );
}

// ========== ФИЛЬТРЫ ==========

function updateAgentFilter() {
    const agentSelect = document.getElementById('agentFilter');
    if (!agentSelect) return;
    
    agentSelect.innerHTML = '<option value="all">Все агенты</option>';
    for (let i = 0; i < usersData.length; i++) {
        const u = usersData[i];
        if (u.role === 'agent' || u.role === 'manager' || u.role === 'admin') {
            const option = document.createElement('option');
            option.value = u.github_username;
            option.textContent = u.name;
            agentSelect.appendChild(option);
        }
    }
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ==========

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(type, message) {
    console.log('[deals.js] Показ уведомления:', type, message);
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle') + '"></i><span>' + escapeHtml(message) + '</span>';
    document.body.appendChild(toast);
    setTimeout(function() {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========

async function init() {
    console.log('[deals.js] === ИНИЦИАЛИЗАЦИЯ ===');
    
    await auth.initAuth();
    currentUserData = auth.getCurrentUser();
    console.log('[deals.js] Пользователь:', currentUserData ? currentUserData.name + ' (' + currentUserData.role + ')' : 'не авторизован');
    
    if (!currentUserData) {
        window.location.href = 'auth.html';
        return;
    }
    
    await loadComplexesForDeals();
    await loadCounterpartiesForDeals();
    await loadUsersForDeals();
    await loadDeals();
    renderKanban();
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', renderKanban);
    
    const typeFilter = document.getElementById('typeFilter');
    if (typeFilter) typeFilter.addEventListener('change', renderKanban);
    
    const agentFilter = document.getElementById('agentFilter');
    if (agentFilter) agentFilter.addEventListener('change', renderKanban);
    
    const addDealBtn = document.getElementById('addDealBtn');
    if (addDealBtn) addDealBtn.addEventListener('click', function() { openDealModal(); });
    
    if (window.theme) window.theme.initTheme();
    if (window.sidebar) window.sidebar.initSidebar();
    
    console.log('[deals.js] === ИНИЦИАЛИЗАЦИЯ ЗАВЕРШЕНА ===');
}

document.addEventListener('DOMContentLoaded', init);
