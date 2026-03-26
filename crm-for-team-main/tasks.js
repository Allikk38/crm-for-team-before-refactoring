/**
 * ============================================
 * ФАЙЛ: tasks.js
 * РОЛЬ: Логика доски задач (Kanban) с поддержкой приватных задач и ролевой модели
 * СВЯЗИ:
 *   - core.js: loadCSV(), utils.saveCSVToGitHub()
 *   - auth.js: auth.getCurrentUser(), auth.hasPermission()
 *   - theme.js: window.theme.initTheme()
 *   - notifications.js: window.notifications.send(), window.notifications.addToCenter()
 *   - Данные: data/tasks.csv, data/users.csv, data/complexes.csv, data/comments.csv
 * МЕХАНИКА:
 *   1. Загрузка задач, пользователей, объектов, комментариев
 *   2. Отображение Kanban-доски с тремя статусами
 *   3. Фильтрация задач по ролям (приватные/публичные)
 *   4. Drag-and-drop для изменения статуса
 *   5. CRUD операции с задачами (с учётом прав)
 *   6. Система комментариев с @упоминаниями
 *   7. Push-уведомления
 *   8. Сохранение всех изменений в GitHub
 * ============================================
 */

// Используем глобальную переменную из auth.js, не объявляем свою
// var currentUser = null; // УДАЛЕНО - используем auth.getCurrentUser()

var tasks = [];
var users = [];
var complexes = [];
var comments = [];
var draggedTask = null;

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ЛОГИРОВАНИЯ ==========

function log(message, data) {
    console.log('[tasks.js] ' + message, data || '');
}

function logError(message, error) {
    console.error('[tasks.js] ERROR: ' + message, error || '');
}

// ========== ЗАГРУЗКА ДАННЫХ ==========

async function loadComments() {
    log('Загрузка комментариев...');
    try {
        var commentsData = await loadCSV('data/comments.csv');
        comments = [];
        if (commentsData && commentsData.length > 0) {
            for (var i = 0; i < commentsData.length; i++) {
                var c = commentsData[i];
                comments.push({
                    id: parseInt(c.id),
                    task_id: parseInt(c.task_id),
                    author: c.author,
                    text: c.text,
                    mentions: c.mentions ? c.mentions.split(';') : [],
                    created_at: c.created_at
                });
            }
        }
        log('Загружено комментариев:', comments.length);
    } catch (e) {
        logError('Ошибка загрузки комментариев:', e);
        comments = [];
    }
}

async function saveCommentsToGitHub() {
    var currentUserAuth = auth.getCurrentUser();
    if (!currentUserAuth || !auth.hasPermission('edit_all')) {
        logError('Нет прав на сохранение комментариев');
        return false;
    }
    
    var commentsToSave = [];
    for (var i = 0; i < comments.length; i++) {
        var c = comments[i];
        commentsToSave.push({
            id: c.id,
            task_id: c.task_id,
            author: c.author,
            text: c.text,
            mentions: c.mentions.join(';'),
            created_at: c.created_at
        });
    }
    
    return await window.utils.saveCSVToGitHub(
        'data/comments.csv',
        commentsToSave,
        'Update comments by ' + currentUserAuth.name
    );
}

async function loadComplexesForSelect() {
    log('Загрузка объектов для выпадающего списка...');
    try {
        complexes = await loadCSV('data/complexes.csv');
        var complexSelect = document.getElementById('taskComplex');
        if (complexSelect) {
            complexSelect.innerHTML = '<option value="">Привязать к объекту</option>';
            for (var i = 0; i < complexes.length; i++) {
                var complex = complexes[i];
                var option = document.createElement('option');
                option.value = complex.id;
                option.textContent = complex.title + ' (' + complex.address + ')';
                complexSelect.appendChild(option);
            }
        }
        log('Загружено объектов:', complexes.length);
    } catch (error) {
        logError('Ошибка загрузки объектов:', error);
    }
}

async function loadTasks() {
    log('Загрузка задач...');
    var tasksData = await loadCSV('data/tasks.csv');
    tasks = [];
    for (var i = 0; i < tasksData.length; i++) {
        var task = tasksData[i];
        tasks.push({
            id: parseInt(task.id),
            title: task.title || '',
            description: task.description || '',
            assigned_to: task.assigned_to || '',
            created_by: task.created_by || '',
            status: task.status || 'todo',
            priority: task.priority || 'medium',
            created_at: task.created_at || '',
            updated_at: task.updated_at || '',
            due_date: task.due_date || '',
            complex_id: task.complex_id || '',
            is_private: task.is_private === 'true'
        });
    }
    log('Загружено задач:', tasks.length);
    
    // Проверяем дедлайны для уведомлений
    if (window.notifications && window.notifications.checkDeadlines) {
        window.notifications.checkDeadlines(tasks);
    }
    
    renderKanban();
}

async function loadUsersForSelect() {
    log('Загрузка пользователей для выпадающего списка...');
    users = await loadCSV('data/users.csv');
    var assigneeSelect = document.getElementById('taskAssignee');
    if (assigneeSelect) {
        assigneeSelect.innerHTML = '<option value="">Назначить исполнителя</option>';
        for (var i = 0; i < users.length; i++) {
            var user = users[i];
            var option = document.createElement('option');
            option.value = user.github_username;
            option.textContent = user.name + ' (' + user.role + ')';
            assigneeSelect.appendChild(option);
        }
    }
    log('Загружено пользователей:', users.length);
}

// Получение текущего пользователя (обёртка для единообразия)
function getCurrentUser() {
    var user = auth.getCurrentUser();
    if (!user) {
        log('Пользователь не авторизован');
    }
    return user;
}

// Фильтрация задач по правам пользователя
function filterTasksByRole() {
    var currentUser = getCurrentUser();
    if (!currentUser) return [];
    
    // Админ и менеджер видят всё
    if (currentUser.role === 'admin' || currentUser.role === 'manager') {
        log('Роль ' + currentUser.role + ': показывает все задачи');
        return tasks;
    }
    
    // Агент: свои задачи + публичные
    if (currentUser.role === 'agent') {
        var filtered = tasks.filter(function(task) {
            return task.assigned_to === currentUser.github_username || !task.is_private;
        });
        log('Роль agent: показывает ' + filtered.length + ' из ' + tasks.length + ' задач');
        return filtered;
    }
    
    // Наблюдатель: только публичные
    var filtered = tasks.filter(function(task) {
        return !task.is_private;
    });
    log('Роль viewer: показывает ' + filtered.length + ' из ' + tasks.length + ' задач');
    return filtered;
}

// Проверка, может ли пользователь редактировать задачу
function canEditTask(task) {
    var currentUser = getCurrentUser();
    if (!currentUser) {
        log('canEditTask: пользователь не найден');
        return false;
    }
    
    // Админ может всё
    if (currentUser.role === 'admin') {
        log('canEditTask: admin может редактировать задачу ' + task.id);
        return true;
    }
    
    // Менеджер может редактировать всё
    if (currentUser.role === 'manager') {
        log('canEditTask: manager может редактировать задачу ' + task.id);
        return true;
    }
    
    // Агент может редактировать только свои задачи
    if (currentUser.role === 'agent') {
        var canEdit = task.assigned_to === currentUser.github_username;
        log('canEditTask: agent ' + (canEdit ? 'может' : 'не может') + ' редактировать задачу ' + task.id);
        return canEdit;
    }
    
    log('canEditTask: роль ' + currentUser.role + ' не имеет прав на редактирование');
    return false;
}

// Проверка, может ли пользователь видеть задачу
function canViewTask(task) {
    var currentUser = getCurrentUser();
    if (!currentUser) return false;
    
    // Админ и менеджер видят всё
    if (currentUser.role === 'admin' || currentUser.role === 'manager') return true;
    
    // Агент видит свои и публичные
    if (currentUser.role === 'agent') {
        return task.assigned_to === currentUser.github_username || !task.is_private;
    }
    
    // Наблюдатель видит только публичные
    return !task.is_private;
}

// ========== RENDER KANBAN ==========

function renderKanban() {
    log('Рендеринг Kanban-доски...');
    var todoContainer = document.getElementById('todoTasks');
    var progressContainer = document.getElementById('progressTasks');
    var doneContainer = document.getElementById('doneTasks');
    
    if (!todoContainer) {
        logError('Контейнер todoTasks не найден');
        return;
    }
    
    todoContainer.innerHTML = '';
    progressContainer.innerHTML = '';
    doneContainer.innerHTML = '';
    
    var filteredTasks = filterTasksByRole();
    var todoCount = 0, progressCount = 0, doneCount = 0;
    
    for (var i = 0; i < filteredTasks.length; i++) {
        var task = filteredTasks[i];
        var taskCard = createTaskCard(task);
        
        if (task.status === 'todo') {
            todoContainer.appendChild(taskCard);
            todoCount++;
        } else if (task.status === 'in_progress') {
            progressContainer.appendChild(taskCard);
            progressCount++;
        } else if (task.status === 'done') {
            doneContainer.appendChild(taskCard);
            doneCount++;
        }
    }
    
    document.getElementById('todoCount').textContent = todoCount;
    document.getElementById('progressCount').textContent = progressCount;
    document.getElementById('doneCount').textContent = doneCount;
    
    log('Рендеринг завершён: todo=' + todoCount + ', progress=' + progressCount + ', done=' + doneCount);
    
    // Показываем/скрываем кнопку добавления задачи
    var addTaskBtn = document.getElementById('addTaskBtn');
    var currentUser = getCurrentUser();
    if (addTaskBtn) {
        var canAdd = currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'agent');
        addTaskBtn.style.display = canAdd ? 'inline-flex' : 'none';
        log('Кнопка добавления задачи ' + (canAdd ? 'показана' : 'скрыта'));
    }
}

function createTaskCard(task) {
    var card = document.createElement('div');
    card.className = 'task-card';
    var canEdit = canEditTask(task);
    card.draggable = canEdit;
    card.setAttribute('data-task-id', task.id);
    
    var priorityColors = {
        high: '#ff6b6b',
        medium: '#ffc107',
        low: '#4caf50'
    };
    card.style.borderLeftColor = priorityColors[task.priority];
    
    var assignee = null;
    for (var u = 0; u < users.length; u++) {
        if (users[u].github_username === task.assigned_to) {
            assignee = users[u];
            break;
        }
    }
    var assigneeName = assignee ? assignee.name : 'Не назначен';
    
    var complexName = '';
    if (task.complex_id) {
        for (var c = 0; c < complexes.length; c++) {
            if (complexes[c].id == task.complex_id) {
                complexName = '<i class="fas fa-building"></i> ' + escapeHtml(complexes[c].title);
                break;
            }
        }
    }
    
    var privateBadge = task.is_private ? '<span class="private-badge"><i class="fas fa-lock"></i> Приватная</span>' : '';
    
    card.innerHTML = 
        '<div class="task-title">' + escapeHtml(task.title) + privateBadge + '</div>' +
        '<div class="task-description">' + escapeHtml(task.description || '') + '</div>' +
        '<div class="task-meta">' +
            '<span class="task-priority priority-' + task.priority + '">' +
                getPriorityText(task.priority) +
            '</span>' +
            '<span class="task-assignee">' +
                '<i class="fas fa-user"></i> ' + assigneeName +
            '</span>' +
        '</div>' +
        '<div class="task-meta">' +
            '<span><i class="fas fa-calendar"></i> ' + (task.due_date || 'без срока') + '</span>' +
            (canEdit ? '<button class="delete-task" onclick="deleteTask(' + task.id + ')"><i class="fas fa-trash"></i></button>' : '') +
        '</div>' +
        (complexName ? '<div class="task-meta"><span>' + complexName + '</span></div>' : '');
    
    if (canEdit) {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
    }
    
    card.addEventListener('click', function(e) {
        if (!e.target.classList.contains('delete-task') && !e.target.closest('.delete-task')) {
            if (canViewTask(task)) {
                editTask(task.id);
            }
        }
    });
    
    return card;
}

// ========== DRAG AND DROP ==========

function handleDragStart(e) {
    log('Drag start');
    draggedTask = e.target.closest('.task-card');
    if (draggedTask) {
        draggedTask.classList.add('dragging');
        e.dataTransfer.setData('text/plain', draggedTask.getAttribute('data-task-id'));
    }
}

function handleDragEnd(e) {
    log('Drag end');
    if (draggedTask) {
        draggedTask.classList.remove('dragging');
        draggedTask = null;
    }
}

function setupDropZones() {
    log('Настройка зон для drop...');
    var columns = document.querySelectorAll('.tasks-container');
    for (var i = 0; i < columns.length; i++) {
        var column = columns[i];
        column.addEventListener('dragover', function(e) {
            e.preventDefault();
        });
        
        column.addEventListener('drop', async function(e) {
            e.preventDefault();
            var taskId = e.dataTransfer.getData('text/plain');
            var newStatus = this.parentElement.getAttribute('data-status');
            log('Drop: taskId=' + taskId + ', newStatus=' + newStatus);
            
            if (taskId && newStatus) {
                await updateTaskStatus(parseInt(taskId), newStatus);
            }
        });
    }
    log('Зоны для drop настроены');
}

async function updateTaskStatus(taskId, newStatus) {
    log('Обновление статуса задачи ' + taskId + ' -> ' + newStatus);
    var task = null;
    for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === taskId) {
            task = tasks[i];
            break;
        }
    }
    
    if (!task) {
        logError('Задача не найдена: ' + taskId);
        return;
    }
    
    // Проверка прав на изменение
    if (!canEditTask(task)) {
        showToast('error', 'У вас нет прав на изменение этой задачи');
        log('Нет прав на изменение задачи ' + taskId);
        return;
    }
    
    if (task.status !== newStatus) {
        var oldStatus = task.status;
        task.status = newStatus;
        task.updated_at = new Date().toISOString().split('T')[0];
        await saveTasksToGitHub();
        renderKanban();
        log('Статус задачи ' + taskId + ' изменён с ' + oldStatus + ' на ' + newStatus);
        
        // Уведомление о смене статуса
        var currentUser = getCurrentUser();
        if (window.notifications && task.assigned_to && task.assigned_to !== currentUser.github_username) {
            window.notifications.send(
                'Статус задачи изменён',
                'Задача "' + task.title + '" перешла из "' + getStatusText(oldStatus) + '" в "' + getStatusText(newStatus) + '"',
                'task_status_' + task.id,
                'tasks.html?task=' + task.id
            );
            window.notifications.addToCenter(
                'status_change',
                'Изменение статуса',
                'Задача "' + task.title + '" теперь в статусе "' + getStatusText(newStatus) + '"',
                task.id
            );
        }
    } else {
        log('Статус задачи ' + taskId + ' не изменился');
    }
}

function getStatusText(status) {
    var statuses = { todo: 'To Do', in_progress: 'В работе', done: 'Готово' };
    return statuses[status] || status;
}

// ========== CRUD ЗАДАЧ ==========

async function createTask(taskData) {
    var currentUser = getCurrentUser();
    log('Создание задачи:', taskData.title);
    
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager' && currentUser.role !== 'agent')) {
        showToast('error', 'У вас нет прав на создание задач');
        log('Нет прав на создание задачи');
        return;
    }
    
    var maxId = 0;
    for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id > maxId) maxId = tasks[i].id;
    }
    var newId = maxId + 1;
    
    var newTask = {
        id: newId,
        title: taskData.title,
        description: taskData.description,
        assigned_to: taskData.assigned_to,
        created_by: currentUser.github_username,
        status: taskData.status,
        priority: taskData.priority,
        created_at: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString().split('T')[0],
        due_date: taskData.due_date,
        complex_id: taskData.complex_id || '',
        is_private: taskData.is_private === true
    };
    
    tasks.push(newTask);
    log('Задача создана с ID ' + newId);
    await saveTasksToGitHub();
    renderKanban();
    showToast('success', 'Задача создана');
    
    // Уведомление назначенному исполнителю
    if (taskData.assigned_to && taskData.assigned_to !== currentUser.github_username) {
        var assignedUserName = '';
        for (var u = 0; u < users.length; u++) {
            if (users[u].github_username === taskData.assigned_to) {
                assignedUserName = users[u].name;
                break;
            }
        }
        
        if (window.notifications) {
            window.notifications.send(
                'Новая задача',
                'Вам назначена задача: ' + taskData.title,
                'task_' + newId,
                'tasks.html?task=' + newId
            );
            window.notifications.addToCenter(
                'task_assigned',
                'Новая задача',
                'Вам назначена задача: ' + taskData.title,
                newId
            );
        }
    }
}

async function updateTask(taskId, taskData) {
    log('Обновление задачи ' + taskId);
    var taskIndex = -1;
    for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === taskId) {
            taskIndex = i;
            break;
        }
    }
    
    if (taskIndex !== -1) {
        var task = tasks[taskIndex];
        
        // Проверка прав на редактирование
        if (!canEditTask(task)) {
            showToast('error', 'У вас нет прав на редактирование этой задачи');
            log('Нет прав на редактирование задачи ' + taskId);
            return;
        }
        
        var oldAssignee = task.assigned_to;
        tasks[taskIndex] = {
            ...task,
            title: taskData.title,
            description: taskData.description,
            assigned_to: taskData.assigned_to,
            priority: taskData.priority,
            due_date: taskData.due_date,
            status: taskData.status,
            complex_id: taskData.complex_id || '',
            is_private: taskData.is_private === true,
            updated_at: new Date().toISOString().split('T')[0]
        };
        log('Задача обновлена');
        await saveTasksToGitHub();
        renderKanban();
        showToast('success', 'Задача обновлена');
        
        // Уведомление при смене исполнителя
        var currentUser = getCurrentUser();
        if (taskData.assigned_to && taskData.assigned_to !== oldAssignee && taskData.assigned_to !== currentUser.github_username) {
            if (window.notifications) {
                window.notifications.send(
                    'Задача переназначена',
                    'Вам назначена задача: ' + taskData.title,
                    'task_' + taskId,
                    'tasks.html?task=' + taskId
                );
                window.notifications.addToCenter(
                    'task_assigned',
                    'Задача переназначена',
                    'Вам назначена задача: ' + taskData.title,
                    taskId
                );
            }
        }
    } else {
        logError('Задача для обновления не найдена: ' + taskId);
    }
}

async function deleteTask(taskId) {
    log('Удаление задачи ' + taskId);
    var task = null;
    for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === taskId) {
            task = tasks[i];
            break;
        }
    }
    
    if (!task) {
        logError('Задача для удаления не найдена: ' + taskId);
        return;
    }
    
    if (!canEditTask(task)) {
        showToast('error', 'У вас нет прав на удаление этой задачи');
        log('Нет прав на удаление задачи ' + taskId);
        return;
    }
    
    if (confirm('Вы уверены, что хотите удалить эту задачу?')) {
        var newTasks = [];
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].id !== taskId) newTasks.push(tasks[i]);
        }
        tasks = newTasks;
        await saveTasksToGitHub();
        renderKanban();
        showToast('success', 'Задача удалена');
        log('Задача ' + taskId + ' удалена');
    }
}

async function saveTasksToGitHub() {
    var currentUser = getCurrentUser();
    log('Сохранение задач в GitHub...');
    
    if (!currentUser) {
        logError('Пользователь не авторизован для сохранения');
        return false;
    }
    
    var tasksToSave = [];
    for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        tasksToSave.push({
            id: task.id,
            title: task.title,
            description: task.description || '',
            assigned_to: task.assigned_to || '',
            created_by: task.created_by,
            status: task.status,
            priority: task.priority,
            created_at: task.created_at,
            updated_at: task.updated_at,
            due_date: task.due_date || '',
            complex_id: task.complex_id || '',
            is_private: task.is_private ? 'true' : 'false'
        });
    }
    
    var result = await window.utils.saveCSVToGitHub(
        'data/tasks.csv',
        tasksToSave,
        'Update tasks by ' + currentUser.name
    );
    
    log('Сохранение ' + (result ? 'успешно' : 'не удалось'));
    return result;
}

// ========== КОММЕНТАРИИ ==========

async function addComment() {
    var taskId = parseInt(document.getElementById('taskId').value);
    log('Добавление комментария к задаче ' + taskId);
    
    if (!taskId) return;
    
    // Проверка, может ли пользователь видеть задачу
    var task = null;
    for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === taskId) {
            task = tasks[i];
            break;
        }
    }
    
    if (!task || !canViewTask(task)) {
        alert('У вас нет доступа к этой задаче');
        log('Нет доступа к задаче ' + taskId);
        return;
    }
    
    var commentText = document.getElementById('newComment').value.trim();
    if (!commentText) {
        alert('Введите комментарий');
        return;
    }
    
    var currentUser = getCurrentUser();
    if (!currentUser) return;
    
    // Поиск @упоминаний
    var mentions = [];
    var mentionRegex = /@(\w+)/g;
    var match;
    while ((match = mentionRegex.exec(commentText)) !== null) {
        if (mentions.indexOf(match[1]) === -1) {
            mentions.push(match[1]);
        }
    }
    
    var newId = 1;
    for (var i = 0; i < comments.length; i++) {
        if (comments[i].id >= newId) newId = comments[i].id + 1;
    }
    
    var newComment = {
        id: newId,
        task_id: taskId,
        author: currentUser.github_username,
        text: commentText,
        mentions: mentions,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    
    comments.push(newComment);
    var saved = await saveCommentsToGitHub();
    
    if (saved) {
        document.getElementById('newComment').value = '';
        renderComments(taskId);
        showToast('success', 'Комментарий добавлен');
        log('Комментарий добавлен к задаче ' + taskId);
        
        // Отправляем уведомления об упоминаниях
        for (var m = 0; m < mentions.length; m++) {
            sendMentionNotification(mentions[m], currentUser.name, commentText, taskId);
        }
    } else {
        comments.pop();
        alert('Ошибка сохранения');
        logError('Ошибка сохранения комментария');
    }
}

function sendMentionNotification(mentionedUsername, authorName, commentText, taskId) {
    var task = null;
    for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === taskId) {
            task = tasks[i];
            break;
        }
    }
    if (!task) return;
    
    if (window.notifications) {
        window.notifications.send(
            'Упоминание в комментарии',
            authorName + ' упомянул вас в задаче "' + task.title + '"',
            'mention_' + task.id,
            'tasks.html?task=' + task.id
        );
        window.notifications.addToCenter(
            'mention',
            'Упоминание в комментарии',
            authorName + ' упомянул вас в задаче "' + task.title + '"',
            task.id
        );
    }
    
    showToast('info', authorName + ' упомянул вас в комментарии');
}

function renderComments(taskId) {
    var taskComments = [];
    for (var i = 0; i < comments.length; i++) {
        if (comments[i].task_id === taskId) {
            taskComments.push(comments[i]);
        }
    }
    
    taskComments.sort(function(a, b) {
        return a.created_at > b.created_at ? 1 : -1;
    });
    
    var container = document.getElementById('commentsList');
    var countSpan = document.getElementById('commentsCount');
    
    if (!container) return;
    
    if (countSpan) countSpan.textContent = taskComments.length;
    
    if (taskComments.length === 0) {
        container.innerHTML = '<div class="comment-empty">Нет комментариев</div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < taskComments.length; i++) {
        var c = taskComments[i];
        
        var authorName = c.author;
        for (var u = 0; u < users.length; u++) {
            if (users[u].github_username === c.author) {
                authorName = users[u].name;
                break;
            }
        }
        
        var formattedText = escapeHtml(c.text);
        formattedText = formattedText.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
        
        var date = c.created_at ? c.created_at.replace('T', ' ').slice(0, 16) : '';
        
        html += '<div class="comment-item">' +
            '<div class="comment-header">' +
                '<strong><i class="fas fa-user-circle"></i> ' + escapeHtml(authorName) + '</strong>' +
                '<span class="comment-date">' + date + '</span>' +
            '</div>' +
            '<div class="comment-text">' + formattedText + '</div>' +
        '</div>';
    }
    
    container.innerHTML = html;
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ==========

function getPriorityText(priority) {
    var priorities = {
        high: 'Высокий',
        medium: 'Средний',
        low: 'Низкий'
    };
    return priorities[priority] || priority;
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

// ========== МОДАЛЬНОЕ ОКНО ==========

function openModal(taskId) {
    var modal = document.getElementById('taskModal');
    var modalTitle = document.getElementById('modalTitle');
    var privateCheckbox = document.getElementById('taskPrivate');
    var currentUser = getCurrentUser();
    
    log('Открытие модального окна, taskId=' + taskId);
    
    if (taskId) {
        modalTitle.textContent = 'Редактировать задачу';
        var task = null;
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].id === taskId) {
                task = tasks[i];
                break;
            }
        }
        if (task && canViewTask(task)) {
            document.getElementById('taskId').value = task.id;
            document.getElementById('taskTitle').value = task.title;
            document.getElementById('taskDescription').value = task.description || '';
            document.getElementById('taskAssignee').value = task.assigned_to || '';
            document.getElementById('taskComplex').value = task.complex_id || '';
            document.getElementById('taskPriority').value = task.priority;
            document.getElementById('taskDueDate').value = task.due_date || '';
            document.getElementById('taskStatus').value = task.status;
            if (privateCheckbox) privateCheckbox.checked = task.is_private;
            
            // Загружаем комментарии
            renderComments(task.id);
            log('Загружена задача ' + taskId);
        } else {
            alert('У вас нет доступа к этой задаче');
            log('Нет доступа к задаче ' + taskId);
            return;
        }
    } else {
        modalTitle.textContent = 'Создать задачу';
        document.getElementById('taskId').value = '';
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDescription').value = '';
        document.getElementById('taskAssignee').value = '';
        document.getElementById('taskComplex').value = '';
        document.getElementById('taskPriority').value = 'medium';
        document.getElementById('taskDueDate').value = '';
        document.getElementById('taskStatus').value = 'todo';
        if (privateCheckbox) privateCheckbox.checked = false;
        
        // Очищаем комментарии
        var commentsContainer = document.getElementById('commentsList');
        if (commentsContainer) commentsContainer.innerHTML = '';
        var commentsCount = document.getElementById('commentsCount');
        if (commentsCount) commentsCount.textContent = '0';
        log('Открыто окно создания задачи');
    }
    
    // Показываем/скрываем чекбокс приватности в зависимости от роли
    if (privateCheckbox) {
        var showPrivate = currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager');
        privateCheckbox.parentElement.style.display = showPrivate ? 'block' : 'none';
        log('Чекбокс приватности ' + (showPrivate ? 'показан' : 'скрыт'));
    }
    
    modal.classList.add('active');
}

function closeModal() {
    log('Закрытие модального окна');
    document.getElementById('taskModal').classList.remove('active');
}

async function saveTask() {
    var taskId = document.getElementById('taskId').value;
    var privateCheckbox = document.getElementById('taskPrivate');
    var taskData = {
        title: document.getElementById('taskTitle').value,
        description: document.getElementById('taskDescription').value,
        assigned_to: document.getElementById('taskAssignee').value,
        complex_id: document.getElementById('taskComplex').value,
        priority: document.getElementById('taskPriority').value,
        due_date: document.getElementById('taskDueDate').value,
        status: document.getElementById('taskStatus').value,
        is_private: privateCheckbox ? privateCheckbox.checked : false
    };
    
    log('Сохранение задачи, taskId=' + (taskId || 'новая'));
    
    if (!taskData.title) {
        alert('Введите название задачи');
        return;
    }
    
    if (taskId) {
        await updateTask(parseInt(taskId), taskData);
    } else {
        await createTask(taskData);
    }
    
    closeModal();
}

function editTask(taskId) {
    log('Редактирование задачи ' + taskId);
    openModal(taskId);
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========

async function init() {
    log('=== ИНИЦИАЛИЗАЦИЯ tasks.js ===');
    
    await auth.initAuth();
    var currentUser = auth.getCurrentUser();
    log('Пользователь:', currentUser ? currentUser.name + ' (' + currentUser.role + ')' : 'не авторизован');
    
    if (!currentUser) {
        log('Перенаправление на страницу входа');
        window.location.href = 'auth.html';
        return;
    }
    
    await loadUsersForSelect();
    await loadComplexesForSelect();
    await loadComments();
    await loadTasks();
    setupDropZones();
    
    var userNameSpan = document.getElementById('userName');
    var userRoleSpan = document.getElementById('userRole');
    var userAvatar = document.getElementById('userAvatar');
    
    if (userNameSpan) userNameSpan.textContent = currentUser.name;
    if (userRoleSpan) {
        var roleLabel = '';
        if (currentUser.role === 'admin') roleLabel = 'Администратор';
        else if (currentUser.role === 'manager') roleLabel = 'Менеджер';
        else if (currentUser.role === 'agent') roleLabel = 'Агент';
        else roleLabel = 'Наблюдатель';
        userRoleSpan.textContent = roleLabel;
    }
    if (userAvatar) {
        var initials = currentUser.name.split(' ').map(function(n) { return n[0]; }).join('').toUpperCase();
        userAvatar.innerHTML = initials || '<i class="fas fa-user"></i>';
    }
    
    // Добавляем обработчики для кнопок "Добавить задачу"
    var addBtns = document.querySelectorAll('.add-task-btn');
    for (var i = 0; i < addBtns.length; i++) {
        var btn = addBtns[i];
        btn.addEventListener('click', function() {
            var status = this.getAttribute('data-status');
            document.getElementById('taskStatus').value = status;
            openModal();
        });
    }
    
    var addTaskBtn = document.getElementById('addTaskBtn');
    if (addTaskBtn) addTaskBtn.addEventListener('click', function() { openModal(); });
    
    if (window.theme) window.theme.initTheme();
    if (window.sidebar) window.sidebar.initSidebar();
    
    // Обновляем бейдж уведомлений
    if (window.notifications) window.notifications.updateBadge();
    
    log('=== ИНИЦИАЛИЗАЦИЯ tasks.js ЗАВЕРШЕНА ===');
}

document.addEventListener('DOMContentLoaded', init);
