/**
 * ============================================
 * ФАЙЛ: profile.js
 * РОЛЬ: Логика личного кабинета
 * СВЯЗИ:
 *   - core.js: loadCSV(), utils.saveCSVToGitHub()
 *   - auth.js: auth.initAuth(), auth.getCurrentUser(), auth.logout()
 *   - theme.js: window.theme.initTheme(), window.theme.setTheme()
 *   - Данные: data/users.csv, data/tasks.csv
 * МЕХАНИКА:
 *   1. Загружает данные текущего пользователя и его задачи
 *   2. Отображает профиль (аватар, имя, роль, email, дата регистрации)
 *   3. Рассчитывает личную статистику:
 *      - Завершённые задачи
 *      - Активные задачи
 *      - Просроченные задачи
 *      - Среднее время выполнения
 *   4. Строит график личной активности за последние 7 дней
 *   5. Показывает последние 5 завершённых задач
 *   6. Управляет настройками интерфейса (сохраняет в localStorage)
 *   7. Позволяет редактировать имя и email (сохраняет в users.csv)
 *   8. Администратор видит дополнительную информацию
 * ============================================
 */

var profileUser = null;
var profileTasks = [];

async function loadProfileData() {
    try {
        // Загружаем данные
        var users = await loadCSV('data/users.csv');
        var tasks = await loadCSV('data/tasks.csv');
        
        // Получаем текущего пользователя
        var currentUserAuth = auth.getCurrentUser();
        if (!currentUserAuth) return;
        
        // Находим полные данные пользователя
        profileUser = null;
        for (var i = 0; i < users.length; i++) {
            if (users[i].github_username === currentUserAuth.github_username) {
                profileUser = users[i];
                break;
            }
        }
        
        if (!profileUser) return;
        
        // Фильтруем задачи пользователя
        profileTasks = [];
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].assigned_to === profileUser.github_username) {
                profileTasks.push(tasks[i]);
            }
        }
        
        // Отображаем профиль
        renderProfile();
        
        // Отображаем статистику
        renderProfileStats();
        
        // Отображаем график активности
        renderPersonalChart();
        
        // Отображаем последние задачи
        renderRecentTasks();
        
        // Загружаем настройки
        loadSettings();
        
    } catch (error) {
        console.error('Ошибка загрузки данных профиля:', error);
    }
}

function renderProfile() {
    // Аватар (инициалы)
    var nameParts = profileUser.name.split(' ');
    var initials = '';
    for (var i = 0; i < nameParts.length && i < 2; i++) {
        initials += nameParts[i][0];
    }
    var avatarEl = document.getElementById('profileAvatar');
    if (avatarEl) {
        avatarEl.innerHTML = '<i class="fas fa-user"></i>';
        avatarEl.style.background = 'linear-gradient(135deg, var(--accent), var(--accent-hover))';
    }
    
    var nameEl = document.getElementById('profileName');
    if (nameEl) nameEl.textContent = profileUser.name;
    
    var roleEl = document.getElementById('profileRole');
    if (roleEl) {
        var roleLabels = {
            admin: 'Администратор',
            manager: 'Менеджер',
            agent: 'Агент',
            viewer: 'Наблюдатель'
        };
        roleEl.textContent = roleLabels[profileUser.role] || profileUser.role;
    }
    
    var emailEl = document.getElementById('profileEmail');
    if (emailEl) emailEl.textContent = profileUser.email || 'Не указан';
    
    var githubEl = document.getElementById('profileGithub');
    if (githubEl) githubEl.textContent = profileUser.github_username;
    
    var joinedEl = document.getElementById('profileJoined');
    if (joinedEl) joinedEl.textContent = profileUser.created_at || '—';
    
    // Заполняем форму редактирования
    var editName = document.getElementById('editName');
    var editEmail = document.getElementById('editEmail');
    if (editName) editName.value = profileUser.name;
    if (editEmail) editEmail.value = profileUser.email || '';
}

function renderProfileStats() {
    var today = new Date().toISOString().split('T')[0];
    
    var completed = 0;
    var active = 0;
    var overdue = 0;
    var totalTimeSum = 0;
    var tasksWithTime = 0;
    
    for (var i = 0; i < profileTasks.length; i++) {
        var task = profileTasks[i];
        
        if (task.status === 'done') {
            completed++;
            if (task.created_at && task.updated_at) {
                var created = new Date(task.created_at);
                var updated = new Date(task.updated_at);
                var daysDiff = (updated - created) / (1000 * 60 * 60 * 24);
                if (daysDiff >= 0) {
                    totalTimeSum += daysDiff;
                    tasksWithTime++;
                }
            }
        } else {
            active++;
            if (task.due_date && task.due_date < today) {
                overdue++;
            }
        }
    }
    
    var avgTime = tasksWithTime > 0 ? (totalTimeSum / tasksWithTime).toFixed(1) : 0;
    
    var completedEl = document.getElementById('statCompleted');
    var activeEl = document.getElementById('statActive');
    var overdueEl = document.getElementById('statOverdue');
    var avgTimeEl = document.getElementById('statAvgTime');
    
    if (completedEl) completedEl.textContent = completed;
    if (activeEl) activeEl.textContent = active;
    if (overdueEl) overdueEl.textContent = overdue;
    if (avgTimeEl) avgTimeEl.textContent = avgTime;
}

function renderPersonalChart() {
    var weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var dailyCompleted = [0, 0, 0, 0, 0, 0, 0];
    
    var todayDate = new Date();
    
    for (var i = 0; i < profileTasks.length; i++) {
        var task = profileTasks[i];
        if (task.status === 'done' && task.updated_at) {
            var taskDate = new Date(task.updated_at);
            var dayDiff = Math.floor((todayDate - taskDate) / (1000 * 60 * 60 * 24));
            if (dayDiff < 7) {
                var dayOfWeek = taskDate.getDay();
                var index = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                if (index >= 0 && index < 7) dailyCompleted[index]++;
            }
        }
    }
    
    var maxCompleted = Math.max.apply(null, dailyCompleted);
    if (maxCompleted === 0) maxCompleted = 1;
    
    var barsHtml = '';
    for (var i = 0; i < dailyCompleted.length; i++) {
        var height = (dailyCompleted[i] / maxCompleted) * 80;
        barsHtml += '<div class="chart-bar-profile" style="height: ' + Math.max(4, height) + 'px;"></div>';
    }
    
    var chartEl = document.getElementById('personalChart');
    if (chartEl) chartEl.innerHTML = barsHtml;
}

function renderRecentTasks() {
    var completedTasks = [];
    for (var i = 0; i < profileTasks.length; i++) {
        if (profileTasks[i].status === 'done') {
            completedTasks.push(profileTasks[i]);
        }
    }
    
    completedTasks.sort(function(a, b) {
        return (b.updated_at || '') > (a.updated_at || '') ? 1 : -1;
    });
    
    var recent = completedTasks.slice(0, 5);
    
    var container = document.getElementById('recentTasks');
    if (!container) return;
    
    if (recent.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Нет завершённых задач</div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < recent.length; i++) {
        var task = recent[i];
        var date = task.updated_at ? task.updated_at.split('-').reverse().join('.') : '—';
        html += '<div class="recent-task-item">' +
            '<div class="recent-task-title">' + escapeHtml(task.title) + '</div>' +
            '<div class="recent-task-date">' + date + '</div>' +
        '</div>';
    }
    
    container.innerHTML = html;
}

function loadSettings() {
    var notifications = localStorage.getItem('crm_notifications') === 'true';
    var confirmActions = localStorage.getItem('crm_confirm_actions') !== 'false';
    var compactMode = localStorage.getItem('crm_compact_mode') === 'true';
    var autoSave = localStorage.getItem('crm_auto_save') !== 'false';
    
    var notificationsToggle = document.getElementById('notificationsToggle');
    var confirmActionsToggle = document.getElementById('confirmActionsToggle');
    var compactModeToggle = document.getElementById('compactModeToggle');
    var autoSaveToggle = document.getElementById('autoSaveToggle');
    
    if (notificationsToggle) notificationsToggle.checked = notifications;
    if (confirmActionsToggle) confirmActionsToggle.checked = confirmActions;
    if (compactModeToggle) compactModeToggle.checked = compactMode;
    if (autoSaveToggle) autoSaveToggle.checked = autoSave;
    
    // Применяем компактный режим
    if (compactMode && !document.body.classList.contains('compact-mode')) {
        document.body.classList.add('compact-mode');
    } else if (!compactMode && document.body.classList.contains('compact-mode')) {
        document.body.classList.remove('compact-mode');
    }
}

function saveSettings() {
    var notificationsToggle = document.getElementById('notificationsToggle');
    var confirmActionsToggle = document.getElementById('confirmActionsToggle');
    var compactModeToggle = document.getElementById('compactModeToggle');
    var autoSaveToggle = document.getElementById('autoSaveToggle');
    
    localStorage.setItem('crm_notifications', notificationsToggle ? notificationsToggle.checked : false);
    localStorage.setItem('crm_confirm_actions', confirmActionsToggle ? confirmActionsToggle.checked : true);
    localStorage.setItem('crm_compact_mode', compactModeToggle ? compactModeToggle.checked : false);
    localStorage.setItem('crm_auto_save', autoSaveToggle ? autoSaveToggle.checked : true);
    
    // Применяем компактный режим
    if (compactModeToggle && compactModeToggle.checked) {
        document.body.classList.add('compact-mode');
    } else {
        document.body.classList.remove('compact-mode');
    }
    
    showToast('success', 'Настройки сохранены');
}

function openEditModal() {
    document.getElementById('editProfileModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editProfileModal').classList.remove('active');
}

async function saveProfileChanges() {
    var newName = document.getElementById('editName').value;
    var newEmail = document.getElementById('editEmail').value;
    
    if (!newName) {
        alert('Введите имя');
        return;
    }
    
    // Загружаем всех пользователей
    var users = await loadCSV('data/users.csv');
    
    // Обновляем текущего пользователя
    var updated = false;
    for (var i = 0; i < users.length; i++) {
        if (users[i].github_username === profileUser.github_username) {
            users[i].name = newName;
            users[i].email = newEmail;
            updated = true;
            break;
        }
    }
    
    if (!updated) return;
    
    // Сохраняем
    var saved = await window.utils.saveCSVToGitHub('data/users.csv', users, 'Update profile by ' + profileUser.github_username);
    
    if (saved) {
        // Обновляем локальные данные
        profileUser.name = newName;
        profileUser.email = newEmail;
        
        // Обновляем сессию
        var session = localStorage.getItem('crm_session');
        if (session) {
            var sessionUser = JSON.parse(session);
            sessionUser.name = newName;
            localStorage.setItem('crm_session', JSON.stringify(sessionUser));
        }
        
        renderProfile();
        closeEditModal();
        showToast('success', 'Профиль обновлён');
    } else {
        alert('Ошибка сохранения');
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
    toast.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-check-circle' : 'fa-info-circle') + '"></i><span>' + escapeHtml(message) + '</span>';
    document.body.appendChild(toast);
    setTimeout(function() {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}

async function init() {
    await auth.initAuth();
    
    var currentUser = auth.getCurrentUser();
    if (!currentUser) {
        window.location.href = 'auth.html';
        return;
    }
    
    // Обновляем имя в шапке
    var userNameSpan = document.getElementById('userName');
    if (userNameSpan) {
        var roleLabel = '';
        if (currentUser.role === 'admin') roleLabel = 'Администратор';
        else if (currentUser.role === 'manager') roleLabel = 'Менеджер';
        else if (currentUser.role === 'agent') roleLabel = 'Агент';
        else roleLabel = 'Наблюдатель';
        userNameSpan.innerHTML = '<i class="fab fa-github"></i> ' + escapeHtml(currentUser.name) + ' (' + roleLabel + ')';
    }
    
    await loadProfileData();
    
    if (window.theme) window.theme.initTheme();
    
    // Навешиваем обработчики
    var editBtn = document.getElementById('editProfileBtn');
    if (editBtn) editBtn.addEventListener('click', openEditModal);
    
    var notificationsToggle = document.getElementById('notificationsToggle');
    var confirmActionsToggle = document.getElementById('confirmActionsToggle');
    var compactModeToggle = document.getElementById('compactModeToggle');
    var autoSaveToggle = document.getElementById('autoSaveToggle');
    
    if (notificationsToggle) notificationsToggle.addEventListener('change', saveSettings);
    if (confirmActionsToggle) confirmActionsToggle.addEventListener('change', saveSettings);
    if (compactModeToggle) compactModeToggle.addEventListener('change', saveSettings);
    if (autoSaveToggle) autoSaveToggle.addEventListener('change', saveSettings);
}

document.addEventListener('DOMContentLoaded', init);
