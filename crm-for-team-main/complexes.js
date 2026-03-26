/**
 * ============================================
 * ФАЙЛ: complexes.js (ИСПРАВЛЕННАЯ ВЕРСИЯ)
 * РОЛЬ: Управление объектами недвижимости с поддержкой ролевой модели
 * СВЯЗИ:
 *   - core.js: loadCSV(), utils.saveCSVToGitHub()
 *   - auth.js: auth.getCurrentUser(), auth.filterComplexesByPermissions()
 *   - Данные: data/complexes.csv, data/tasks.csv, data/users.csv
 * МЕХАНИКА:
 *   1. Загрузка объектов, задач, пользователей
 *   2. Фильтрация объектов по ролям (админ/менеджер видят всё, агент — свои)
 *   3. CRUD операции с объектами (с учётом прав)
 *   4. Поиск, фильтрация, сортировка
 *   5. Привязка задач к объектам
 *   6. Галерея фотографий
 * ============================================
 */

var complexesList = [];
var allUsersList = [];
var allTasksList = [];
var currentUserData = null;
var currentSort = 'name';
var sortDirection = 'asc';
var showMyObjectsOnly = false;

console.log('complexes.js loaded');

// Фильтрация объектов по правам пользователя
function filterComplexesByRole(complexes) {
    if (!currentUserData) return [];
    
    // Админ и менеджер видят всё
    if (currentUserData.role === 'admin' || currentUserData.role === 'manager') {
        return complexes;
    }
    
    // Агент видит свои объекты + публичные
    if (currentUserData.role === 'agent') {
        return complexes.filter(function(complex) {
            return complex.assigned_to === currentUserData.github_username || complex.is_public === 'true';
        });
    }
    
    // Наблюдатель видит только публичные
    return complexes.filter(function(complex) {
        return complex.is_public === 'true';
    });
}

// Проверка, может ли пользователь редактировать объект
function canEditComplex(complex) {
    if (!currentUserData) return false;
    
    // Админ может всё
    if (currentUserData.role === 'admin') return true;
    
    // Менеджер может редактировать всё
    if (currentUserData.role === 'manager') return true;
    
    // Агент может редактировать только свои объекты
    if (currentUserData.role === 'agent') {
        return complex.assigned_to === currentUserData.github_username;
    }
    
    return false;
}

// Загрузка данных
async function loadComplexesData() {
    console.log('loadComplexesData started');
    
    try {
        var tasksData = await loadCSV('data/tasks.csv');
        allTasksList = tasksData || [];
        console.log('Tasks loaded:', allTasksList.length);
        
        var complexesData = await loadCSV('data/complexes.csv');
        console.log('Complexes CSV loaded:', complexesData ? complexesData.length : 0);
        
        complexesList = [];
        if (complexesData && complexesData.length > 0) {
            for (var i = 0; i < complexesData.length; i++) {
                var c = complexesData[i];
                complexesList.push({
                    id: parseInt(c.id),
                    title: c.title || '',
                    address: c.address || '',
                    developer: c.developer || '',
                    price_from: c.price_from || '0',
                    price_to: c.price_to || '0',
                    status: c.status || 'active',
                    assigned_to: c.assigned_to || '',
                    coordinates: c.coordinates || '',
                    description: c.description || '',
                    documents: c.documents || '[]',
                    photos: c.photos || '[]',
                    is_public: c.is_public || 'true',
                    created_at: c.created_at || '',
                    updated_at: c.updated_at || ''
                });
            }
        }
        console.log('Complexes parsed:', complexesList.length);
        
        allUsersList = await loadCSV('data/users.csv');
        console.log('Users loaded:', allUsersList ? allUsersList.length : 0);
        
        renderComplexes();
        updateFilters();
        
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        var grid = document.getElementById('complexesGrid');
        if (grid) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Ошибка загрузки данных: ' + error.message + '</p></div>';
        }
    }
}

// Получение задач объекта
function getComplexTasks(complexId) {
    var result = [];
    for (var t = 0; t < allTasksList.length; t++) {
        if (allTasksList[t].complex_id && parseInt(allTasksList[t].complex_id) === complexId) {
            result.push(allTasksList[t]);
        }
    }
    return result;
}

// Получение фото объекта
function getComplexPhotos(complex) {
    try {
        if (complex.photos && complex.photos !== '[]') {
            return JSON.parse(complex.photos);
        }
    } catch(e) {}
    return [];
}

// Рендер списка объектов
function renderComplexes() {
    var grid = document.getElementById('complexesGrid');
    if (!grid) {
        console.error('complexesGrid not found');
        return;
    }
    
    console.log('renderComplexes called, complexes count:', complexesList.length);
    
    // Применяем фильтрацию по ролям
    var roleFiltered = filterComplexesByRole(complexesList);
    
    if (!roleFiltered || roleFiltered.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-building"></i><p>Нет доступных объектов</p><p style="font-size: 0.8rem;">' + 
            (currentUserData && currentUserData.role === 'agent' ? 'Вам доступны только ваши объекты' : 'Добавьте первый объект') + 
            '</p></div>';
        return;
    }
    
    var searchInput = document.getElementById('searchInput');
    var searchText = searchInput ? searchInput.value.toLowerCase() : '';
    var statusFilter = document.getElementById('statusFilter');
    var statusValue = statusFilter ? statusFilter.value : 'all';
    var agentFilter = document.getElementById('agentFilter');
    var agentValue = agentFilter ? agentFilter.value : 'all';
    
    var filtered = [];
    for (var i = 0; i < roleFiltered.length; i++) {
        var complex = roleFiltered[i];
        
        var matchSearch = searchText === '' || 
            complex.title.toLowerCase().indexOf(searchText) !== -1 || 
            complex.address.toLowerCase().indexOf(searchText) !== -1;
        var matchStatus = statusValue === 'all' || complex.status === statusValue;
        var matchAgent = agentValue === 'all' || complex.assigned_to === agentValue;
        var matchMyObjects = !showMyObjectsOnly || (currentUserData && complex.assigned_to === currentUserData.github_username);
        
        if (matchSearch && matchStatus && matchAgent && matchMyObjects) {
            filtered.push(complex);
        }
    }
    
    // Сортировка
    filtered.sort(function(a, b) {
        var valA, valB;
        switch(currentSort) {
            case 'name':
                valA = a.title.toLowerCase();
                valB = b.title.toLowerCase();
                break;
            case 'price':
                valA = parseInt(a.price_from);
                valB = parseInt(b.price_from);
                break;
            case 'date':
                valA = a.created_at || '';
                valB = b.created_at || '';
                break;
            case 'tasks':
                valA = getComplexTasks(a.id).length;
                valB = getComplexTasks(b.id).length;
                break;
            default:
                valA = a.title;
                valB = b.title;
        }
        
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    console.log('Filtered complexes:', filtered.length);
    
    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-building"></i><p>Нет объектов по выбранным фильтрам</p></div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < filtered.length; i++) {
        var complex = filtered[i];
        var statusClass = '';
        var statusText = '';
        
        if (complex.status === 'active') {
            statusClass = 'status-active';
            statusText = 'Активен';
        } else if (complex.status === 'in_progress') {
            statusClass = 'status-in_progress';
            statusText = 'В работе';
        } else {
            statusClass = 'status-archived';
            statusText = 'Архив';
        }
        
        var agent = null;
        for (var u = 0; u < allUsersList.length; u++) {
            if (allUsersList[u].github_username === complex.assigned_to) {
                agent = allUsersList[u];
                break;
            }
        }
        var agentName = agent ? agent.name : 'Не назначен';
        
        var priceFrom = parseInt(complex.price_from).toLocaleString();
        var priceTo = parseInt(complex.price_to).toLocaleString();
        
        var complexTasks = getComplexTasks(complex.id);
        var tasksCount = complexTasks.length;
        var tasksDone = 0;
        for (var d = 0; d < complexTasks.length; d++) {
            if (complexTasks[d].status === 'done') tasksDone++;
        }
        var tasksPercent = tasksCount > 0 ? Math.round((tasksDone / tasksCount) * 100) : 0;
        
        var photos = getComplexPhotos(complex);
        var photosHtml = '';
        if (photos.length > 0) {
            photosHtml = '<div class="complex-stat"><i class="fas fa-camera"></i> ' + photos.length + ' фото</div>';
        }
        
        var canEdit = canEditComplex(complex);
        
        html += '<div class="complex-card" onclick="openComplexModal(' + complex.id + ')">' +
            '<div class="complex-card-header">' +
                '<div class="complex-card-image">' +
                    (photos.length > 0 ? '<img src="' + escapeHtml(photos[0].url) + '" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<i class=\\\'fas fa-building\\\'></i>\'">' : '<i class="fas fa-building"></i>') +
                '</div>' +
                '<div class="complex-card-info">' +
                    '<h3>' + escapeHtml(complex.title) + '</h3>' +
                    '<div class="complex-address"><i class="fas fa-location-dot"></i> ' + escapeHtml(complex.address) + '</div>' +
                    '<span class="complex-status ' + statusClass + '">' + statusText + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="complex-card-body">' +
                '<div class="complex-stats">' +
                    '<div class="complex-stat"><i class="fas fa-industry"></i> ' + escapeHtml(complex.developer || '—') + '</div>' +
                    '<div class="complex-stat"><i class="fas fa-ruble-sign"></i> ' + priceFrom + ' - ' + priceTo + '</div>' +
                    '<div class="complex-stat"><i class="fas fa-user"></i> ' + escapeHtml(agentName) + '</div>' +
                    photosHtml +
                '</div>' +
                '<div class="complex-progress">' +
                    '<div style="display: flex; justify-content: space-between; font-size: 0.7rem;">' +
                        '<span><i class="fas fa-tasks"></i> Задач: ' + tasksCount + '</span>' +
                        '<span>' + tasksDone + ' выполнено (' + tasksPercent + '%)</span>' +
                    '</div>' +
                    '<div class="progress-bar-small">' +
                        '<div class="progress-fill-small" style="width: ' + tasksPercent + '%;"></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="complex-card-footer">' +
                '<button class="complex-btn" onclick="event.stopPropagation(); createTaskForComplex(' + complex.id + ')"><i class="fas fa-plus"></i> Задача</button>' +
                '<button class="complex-btn" onclick="event.stopPropagation(); copyComplexLink(' + complex.id + ')"><i class="fas fa-link"></i> Ссылка</button>' +
                '<button class="complex-btn" onclick="event.stopPropagation(); openMapForComplex(' + complex.id + ')"><i class="fas fa-map"></i> Карта</button>' +
                '<button class="complex-btn" onclick="event.stopPropagation(); duplicateComplex(' + complex.id + ')"><i class="fas fa-copy"></i> Копировать</button>';
        
        if (canEdit) {
            html += '<button class="complex-btn" onclick="event.stopPropagation(); editComplex(' + complex.id + ')"><i class="fas fa-edit"></i> Ред.</button>';
        }
        
        html += '</div></div>';
    }
    
    grid.innerHTML = html;
    
    // Обновляем активное состояние кнопки сортировки
    var sortBtns = document.querySelectorAll('.sort-btn');
    for (var s = 0; s < sortBtns.length; s++) {
        var btn = sortBtns[s];
        if (btn.getAttribute('data-sort') === currentSort) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }
    
    // Обновляем кнопку "Мои объекты"
    var myObjectsBtn = document.getElementById('myObjectsToggle');
    if (myObjectsBtn) {
        if (showMyObjectsOnly) {
            myObjectsBtn.classList.add('active');
        } else {
            myObjectsBtn.classList.remove('active');
        }
    }
    
    // Показываем/скрываем кнопку добавления объекта
    var addComplexBtn = document.getElementById('addComplexBtn');
    if (addComplexBtn) {
        addComplexBtn.style.display = (currentUserData && (currentUserData.role === 'admin' || currentUserData.role === 'manager')) ? 'inline-flex' : 'none';
    }
}

// Обновление фильтров
function updateFilters() {
    var agentSelect = document.getElementById('agentFilter');
    if (!agentSelect) return;
    
    agentSelect.innerHTML = '<option value="all">Все агенты</option>';
    for (var i = 0; i < allUsersList.length; i++) {
        var user = allUsersList[i];
        if (user.role === 'agent' || user.role === 'manager' || user.role === 'admin') {
            var option = document.createElement('option');
            option.value = user.github_username;
            option.textContent = user.name;
            agentSelect.appendChild(option);
        }
    }
    
    // Заполняем выпадающий список для быстрого ввода
    var quickAssignee = document.getElementById('quickAssignee');
    if (quickAssignee) {
        quickAssignee.innerHTML = '<option value="">Ответственный агент</option>';
        for (var i = 0; i < allUsersList.length; i++) {
            var user = allUsersList[i];
            if (user.role === 'agent' || user.role === 'manager' || user.role === 'admin') {
                var option = document.createElement('option');
                option.value = user.github_username;
                option.textContent = user.name;
                quickAssignee.appendChild(option);
            }
        }
    }
    
    // Заполняем выпадающий список для формы
    var assigneeSelect = document.getElementById('complexAssignee');
    if (assigneeSelect) {
        assigneeSelect.innerHTML = '<option value="">Ответственный агент</option>';
        for (var i = 0; i < allUsersList.length; i++) {
            var user = allUsersList[i];
            if (user.role === 'agent' || user.role === 'manager' || user.role === 'admin') {
                var option = document.createElement('option');
                option.value = user.github_username;
                option.textContent = user.name;
                assigneeSelect.appendChild(option);
            }
        }
    }
}

// Быстрое создание задачи для объекта
function createTaskForComplex(complexId) {
    window.location.href = 'tasks.html?complex=' + complexId;
}

// Копирование ссылки на объект
function copyComplexLink(complexId) {
    var url = window.location.origin + window.location.pathname.replace('complexes.html', '') + 'complexes.html?complex=' + complexId;
    navigator.clipboard.writeText(url).then(function() {
        showToast('success', 'Ссылка на объект скопирована');
    }).catch(function() {
        showToast('info', 'Нажмите Ctrl+C чтобы скопировать: ' + url);
    });
}

// Дублирование объекта
async function duplicateComplex(complexId) {
    var original = null;
    for (var i = 0; i < complexesList.length; i++) {
        if (complexesList[i].id === complexId) {
            original = complexesList[i];
            break;
        }
    }
    if (!original) return;
    
    if (!canEditComplex(original)) {
        showToast('error', 'У вас нет прав на копирование этого объекта');
        return;
    }
    
    var newTitle = original.title + ' (копия)';
    var newId = 1;
    for (var i = 0; i < complexesList.length; i++) {
        if (complexesList[i].id >= newId) newId = complexesList[i].id + 1;
    }
    
    var newComplex = {
        id: newId,
        title: newTitle,
        address: original.address,
        developer: original.developer,
        price_from: original.price_from,
        price_to: original.price_to,
        status: 'active',
        assigned_to: original.assigned_to,
        coordinates: original.coordinates,
        description: original.description,
        documents: '[]',
        photos: original.photos,
        is_public: original.is_public,
        created_at: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString().split('T')[0]
    };
    
    complexesList.push(newComplex);
    var saved = await saveComplexesToGitHub();
    
    if (saved) {
        renderComplexes();
        showToast('success', 'Объект скопирован');
    } else {
        complexesList.pop();
        alert('Ошибка копирования');
    }
}

// Открыть карточку объекта
async function openComplexModal(complexId) {
    var complex = null;
    for (var i = 0; i < complexesList.length; i++) {
        if (complexesList[i].id === complexId) {
            complex = complexesList[i];
            break;
        }
    }
    if (!complex) return;
    
    // Проверка доступа к объекту
    var filteredComplexes = filterComplexesByRole([complex]);
    if (filteredComplexes.length === 0) {
        alert('У вас нет доступа к этому объекту');
        return;
    }
    
    var modal = document.getElementById('complexModal');
    var modalBody = document.getElementById('complexModalBody');
    var editBtn = document.getElementById('editComplexBtn');
    
    var agent = null;
    for (var u = 0; u < allUsersList.length; u++) {
        if (allUsersList[u].github_username === complex.assigned_to) {
            agent = allUsersList[u];
            break;
        }
    }
    var agentName = agent ? agent.name : 'Не назначен';
    
    var statusText = '';
    if (complex.status === 'active') statusText = 'Активен';
    else if (complex.status === 'in_progress') statusText = 'В работе';
    else statusText = 'Архив';
    
    var complexTasks = getComplexTasks(complex.id);
    
    var tasksHtml = '';
    for (var i = 0; i < complexTasks.length; i++) {
        var task = complexTasks[i];
        tasksHtml += '<div class="task-item">' +
            '<span>' + escapeHtml(task.title) + '</span>' +
            '<span class="task-priority priority-' + task.priority + '">' + getPriorityText(task.priority) + '</span>' +
        '</div>';
    }
    
    var photos = getComplexPhotos(complex);
    var photosHtml = '';
    if (photos.length > 0) {
        photosHtml = '<div class="complex-detail-row">' +
            '<div class="complex-detail-label">Фотографии:</div>' +
            '<div class="complex-detail-value">' +
                '<div class="photo-gallery">';
        for (var p = 0; p < Math.min(photos.length, 6); p++) {
            photosHtml += '<div class="photo-item" onclick="window.open(\'' + escapeHtml(photos[p].url) + '\', \'_blank\')">' +
                '<img src="' + escapeHtml(photos[p].url) + '" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<i class=\\\'fas fa-image\\\'></i>\'">' +
            '</div>';
        }
        if (photos.length > 6) {
            photosHtml += '<div class="photo-item" onclick="alert(\'Всего фото: ' + photos.length + '\')"><i class="fas fa-ellipsis-h"></i></div>';
        }
        photosHtml += '</div></div></div>';
    }
    
    var publicBadge = complex.is_public === 'true' ? '<span class="public-badge"><i class="fas fa-globe"></i> Публичный</span>' : '<span class="private-badge"><i class="fas fa-lock"></i> Приватный</span>';
    
    modalBody.innerHTML = 
        '<div class="complex-detail-row">' +
            '<div class="complex-detail-label">Название:</div>' +
            '<div class="complex-detail-value">' + escapeHtml(complex.title) + ' ' + publicBadge + '</div>' +
        '</div>' +
        '<div class="complex-detail-row">' +
            '<div class="complex-detail-label">Адрес:</div>' +
            '<div class="complex-detail-value">' + escapeHtml(complex.address) + '</div>' +
        '</div>' +
        '<div class="complex-detail-row">' +
            '<div class="complex-detail-label">Застройщик:</div>' +
            '<div class="complex-detail-value">' + escapeHtml(complex.developer || '—') + '</div>' +
        '</div>' +
        '<div class="complex-detail-row">' +
            '<div class="complex-detail-label">Цена:</div>' +
            '<div class="complex-detail-value">' + parseInt(complex.price_from).toLocaleString() + ' - ' + parseInt(complex.price_to).toLocaleString() + ' ₽</div>' +
        '</div>' +
        '<div class="complex-detail-row">' +
            '<div class="complex-detail-label">Статус:</div>' +
            '<div class="complex-detail-value">' + statusText + '</div>' +
        '</div>' +
        '<div class="complex-detail-row">' +
            '<div class="complex-detail-label">Ответственный:</div>' +
            '<div class="complex-detail-value">' + escapeHtml(agentName) + '</div>' +
        '</div>' +
        (complex.coordinates ? '<div class="complex-detail-row">' +
            '<div class="complex-detail-label">Координаты:</div>' +
            '<div class="complex-detail-value">' + escapeHtml(complex.coordinates) + '</div>' +
        '</div>' : '') +
        '<div class="complex-detail-row">' +
            '<div class="complex-detail-label">Описание:</div>' +
            '<div class="complex-detail-value">' + (complex.description || '—') + '</div>' +
        '</div>' +
        photosHtml +
        '<div class="complex-detail-row">' +
            '<div class="complex-detail-label">Связанные задачи:</div>' +
            '<div class="complex-detail-value tasks-list">' + (tasksHtml || '<p>Нет задач</p>') + '</div>' +
        '</div>';
    
    modal.classList.add('active');
    
    var canEdit = canEditComplex(complex);
    editBtn.onclick = function() { 
        closeComplexModal();
        editComplex(complexId);
    };
    
    editBtn.style.display = canEdit ? 'block' : 'none';
}

function getPriorityText(priority) {
    var priorities = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
    return priorities[priority] || priority;
}

function editComplex(complexId) {
    var complex = null;
    for (var i = 0; i < complexesList.length; i++) {
        if (complexesList[i].id === complexId) {
            complex = complexesList[i];
            break;
        }
    }
    if (!complex) return;
    
    if (!canEditComplex(complex)) {
        showToast('error', 'У вас нет прав на редактирование этого объекта');
        return;
    }
    
    document.getElementById('complexFormTitle').innerHTML = '<i class="fas fa-edit"></i> Редактировать объект';
    document.getElementById('complexId').value = complex.id;
    document.getElementById('complexTitle').value = complex.title;
    document.getElementById('complexAddress').value = complex.address;
    document.getElementById('complexDeveloper').value = complex.developer;
    document.getElementById('complexPriceFrom').value = complex.price_from;
    document.getElementById('complexPriceTo').value = complex.price_to;
    document.getElementById('complexStatus').value = complex.status;
    document.getElementById('complexAssignee').value = complex.assigned_to;
    document.getElementById('complexCoordinates').value = complex.coordinates;
    document.getElementById('complexDescription').value = complex.description;
    var publicCheckbox = document.getElementById('complexPublic');
    if (publicCheckbox) publicCheckbox.checked = complex.is_public === 'true';
    
    document.getElementById('complexFormModal').classList.add('active');
}

function openAddComplexModal() {
    if (!currentUserData || (currentUserData.role !== 'admin' && currentUserData.role !== 'manager')) {
        showToast('error', 'У вас нет прав на создание объектов');
        return;
    }
    
    document.getElementById('complexFormTitle').innerHTML = '<i class="fas fa-plus"></i> Новый объект';
    document.getElementById('complexId').value = '';
    document.getElementById('complexTitle').value = '';
    document.getElementById('complexAddress').value = '';
    document.getElementById('complexDeveloper').value = '';
    document.getElementById('complexPriceFrom').value = '';
    document.getElementById('complexPriceTo').value = '';
    document.getElementById('complexStatus').value = 'active';
    document.getElementById('complexAssignee').value = '';
    document.getElementById('complexCoordinates').value = '';
    document.getElementById('complexDescription').value = '';
    var publicCheckbox = document.getElementById('complexPublic');
    if (publicCheckbox) publicCheckbox.checked = true;
    
    document.getElementById('complexFormModal').classList.add('active');
}

async function saveComplex() {
    var id = document.getElementById('complexId').value;
    var publicCheckbox = document.getElementById('complexPublic');
    var complexData = {
        id: id ? parseInt(id) : null,
        title: document.getElementById('complexTitle').value,
        address: document.getElementById('complexAddress').value,
        developer: document.getElementById('complexDeveloper').value,
        price_from: document.getElementById('complexPriceFrom').value || '0',
        price_to: document.getElementById('complexPriceTo').value || '0',
        status: document.getElementById('complexStatus').value,
        assigned_to: document.getElementById('complexAssignee').value,
        coordinates: document.getElementById('complexCoordinates').value,
        description: document.getElementById('complexDescription').value,
        is_public: publicCheckbox ? (publicCheckbox.checked ? 'true' : 'false') : 'true',
        documents: '[]',
        photos: '[]',
        created_at: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString().split('T')[0]
    };
    
    if (!complexData.title || !complexData.address) {
        alert('Заполните название и адрес');
        return;
    }
    
    if (id) {
        var index = -1;
        for (var i = 0; i < complexesList.length; i++) {
            if (complexesList[i].id === parseInt(id)) {
                index = i;
                break;
            }
        }
        if (index !== -1) {
            if (!canEditComplex(complexesList[index])) {
                showToast('error', 'У вас нет прав на редактирование этого объекта');
                return;
            }
            complexData.id = parseInt(id);
            complexData.created_at = complexesList[index].created_at;
            complexData.photos = complexesList[index].photos;
            complexesList[index] = complexData;
        }
    } else {
        var newId = 1;
        for (var i = 0; i < complexesList.length; i++) {
            if (complexesList[i].id >= newId) newId = complexesList[i].id + 1;
        }
        complexData.id = newId;
        complexesList.push(complexData);
    }
    
    var saved = await saveComplexesToGitHub();
    
    if (saved) {
        closeComplexFormModal();
        renderComplexes();
        showToast('success', id ? 'Объект обновлён' : 'Объект создан');
    } else {
        if (!id) complexesList.pop();
        alert('Ошибка сохранения');
    }
}

async function saveComplexesToGitHub() {
    if (!currentUserData || (currentUserData.role !== 'admin' && currentUserData.role !== 'manager')) {
        alert('У вас нет прав на редактирование');
        return false;
    }
    
    var complexesToSave = [];
    for (var i = 0; i < complexesList.length; i++) {
        var c = complexesList[i];
        complexesToSave.push({
            id: c.id,
            title: c.title,
            address: c.address,
            developer: c.developer,
            price_from: c.price_from,
            price_to: c.price_to,
            status: c.status,
            assigned_to: c.assigned_to,
            coordinates: c.coordinates,
            description: c.description,
            documents: c.documents,
            photos: c.photos,
            is_public: c.is_public || 'true',
            created_at: c.created_at,
            updated_at: c.updated_at
        });
    }
    
    return await window.utils.saveCSVToGitHub(
        'data/complexes.csv',
        complexesToSave,
        'Update complexes by ' + currentUserData.name
    );
}

function openComplexTasks(complexId) {
    window.location.href = 'tasks.html?complex=' + complexId;
}

function openMapForComplex(complexId) {
    var complex = null;
    for (var i = 0; i < complexesList.length; i++) {
        if (complexesList[i].id === complexId) {
            complex = complexesList[i];
            break;
        }
    }
    if (complex && complex.coordinates) {
        var coords = complex.coordinates.split(',');
        window.open('https://maps.google.com/?q=' + coords[0] + ',' + coords[1], '_blank');
    } else {
        alert('Координаты не заданы');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(type, message) {
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle') + '"></i><span>' + escapeHtml(message) + '</span>';
    document.body.appendChild(toast);
    setTimeout(function() {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}

function closeComplexModal() {
    document.getElementById('complexModal').classList.remove('active');
}

function closeComplexFormModal() {
    document.getElementById('complexFormModal').classList.remove('active');
}

// Инициализация
async function init() {
    console.log('complexes.js init started');
    
    await auth.initAuth();
    currentUserData = auth.getCurrentUser();
    console.log('Current user:', currentUserData);
    
    if (!currentUserData) {
        window.location.href = 'auth.html';
        return;
    }
    
    // Обновляем профиль в шапке
    var userNameSpan = document.getElementById('userName');
    var userRoleSpan = document.getElementById('userRole');
    var userAvatar = document.getElementById('userAvatar');
    
    if (userNameSpan) userNameSpan.textContent = currentUserData.name;
    if (userRoleSpan) {
        var roleLabel = '';
        if (currentUserData.role === 'admin') roleLabel = 'Администратор';
        else if (currentUserData.role === 'manager') roleLabel = 'Менеджер';
        else if (currentUserData.role === 'agent') roleLabel = 'Агент';
        else roleLabel = 'Наблюдатель';
        userRoleSpan.textContent = roleLabel;
    }
    if (userAvatar) {
        var initials = currentUserData.name.split(' ').map(function(n) { return n[0]; }).join('').toUpperCase();
        userAvatar.innerHTML = initials || '<i class="fas fa-user"></i>';
    }
    
    await loadComplexesData();
    
    if (window.theme) window.theme.initTheme();
    if (window.sidebar) window.sidebar.initSidebar();
    
    // Кнопки
    var addBtn = document.getElementById('addComplexBtn');
    if (addBtn) addBtn.addEventListener('click', openAddComplexModal);
    
    var quickAddBtn = document.getElementById('quickAddBtn');
    var quickAddPanel = document.getElementById('quickAddPanel');
    if (quickAddBtn && quickAddPanel) {
        quickAddBtn.addEventListener('click', function() {
            quickAddPanel.classList.toggle('active');
        });
    }
    
    var quickSaveBtn = document.getElementById('quickSaveBtn');
    if (quickSaveBtn) {
        quickSaveBtn.addEventListener('click', async function() {
            if (currentUserData.role !== 'admin' && currentUserData.role !== 'manager') {
                showToast('error', 'У вас нет прав на создание объектов');
                return;
            }
            
            var newComplex = {
                title: document.getElementById('quickTitle').value,
                address: document.getElementById('quickAddress').value,
                assigned_to: document.getElementById('quickAssignee').value,
                price_from: document.getElementById('quickPriceFrom').value || '0',
                price_to: document.getElementById('quickPriceTo').value || '0',
                developer: '',
                status: 'active',
                coordinates: '',
                description: '',
                is_public: 'true',
                documents: '[]',
                photos: '[]'
            };
            
            if (!newComplex.title || !newComplex.address) {
                alert('Заполните название и адрес');
                return;
            }
            
            var newId = 1;
            for (var i = 0; i < complexesList.length; i++) {
                if (complexesList[i].id >= newId) newId = complexesList[i].id + 1;
            }
            newComplex.id = newId;
            newComplex.created_at = new Date().toISOString().split('T')[0];
            newComplex.updated_at = new Date().toISOString().split('T')[0];
            
            complexesList.push(newComplex);
            var saved = await saveComplexesToGitHub();
            
            if (saved) {
                document.getElementById('quickTitle').value = '';
                document.getElementById('quickAddress').value = '';
                document.getElementById('quickPriceFrom').value = '';
                document.getElementById('quickPriceTo').value = '';
                quickAddPanel.classList.remove('active');
                renderComplexes();
                showToast('success', 'Объект создан');
            } else {
                complexesList.pop();
                alert('Ошибка сохранения');
            }
        });
    }
    
    // Поиск и фильтры
    var searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', renderComplexes);
    
    var statusFilter = document.getElementById('statusFilter');
    if (statusFilter) statusFilter.addEventListener('change', renderComplexes);
    
    var agentFilter = document.getElementById('agentFilter');
    if (agentFilter) agentFilter.addEventListener('change', renderComplexes);
    
    // Мои объекты
    var myObjectsBtn = document.getElementById('myObjectsToggle');
    if (myObjectsBtn) {
        myObjectsBtn.addEventListener('click', function() {
            showMyObjectsOnly = !showMyObjectsOnly;
            renderComplexes();
        });
    }
    
    // Сортировка
    var sortBtns = document.querySelectorAll('.sort-btn');
    for (var i = 0; i < sortBtns.length; i++) {
        var btn = sortBtns[i];
        btn.addEventListener('click', function() {
            var sort = this.getAttribute('data-sort');
            if (currentSort === sort) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort = sort;
                sortDirection = 'asc';
            }
            renderComplexes();
        });
    }
    
    console.log('complexes.js init completed');
}

document.addEventListener('DOMContentLoaded', init);
