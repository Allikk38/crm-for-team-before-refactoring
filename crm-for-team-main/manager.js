// manager.js - панель управления менеджера

var allTasks = [];
var allUsers = [];

console.log('=== manager.js загружен ===');

// Загрузка данных
async function loadData() {
    console.log('loadData() вызвана');
    
    try {
        var tasksData = await loadCSV('data/tasks.csv');
        console.log('tasksData загружено:', tasksData ? tasksData.length : 0);
        
        allTasks = [];
        if (tasksData && tasksData.length > 0) {
            for (var i = 0; i < tasksData.length; i++) {
                var task = tasksData[i];
                allTasks.push({
                    id: parseInt(task.id),
                    title: task.title || 'Без названия',
                    description: task.description || '',
                    assigned_to: task.assigned_to || '',
                    created_by: task.created_by || '',
                    status: task.status || 'todo',
                    priority: task.priority || 'medium',
                    created_at: task.created_at || '',
                    updated_at: task.updated_at || '',
                    due_date: task.due_date || ''
                });
            }
        }
        
        allUsers = await loadCSV('data/users.csv');
        console.log('allUsers загружено:', allUsers ? allUsers.length : 0);
        
        return allUsers ? allUsers.filter(function(u) { return u.role === 'agent'; }) : [];
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        return [];
    }
}

// Расчёт KPI
function calculateKPI() {
    var today = new Date().toISOString().split('T')[0];
    var weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    var weekAgoStr = weekAgo.toISOString().split('T')[0];
    
    var total = allTasks.length;
    var inProgressCount = 0;
    for (var i = 0; i < allTasks.length; i++) {
        if (allTasks[i].status === 'in_progress') inProgressCount++;
    }
    
    var overdue = [];
    for (var t = 0; t < allTasks.length; t++) {
        var task = allTasks[t];
        if (task.status !== 'done' && task.due_date && task.due_date < today) {
            overdue.push(task);
        }
    }
    
    var closedThisWeek = 0;
    for (var c = 0; c < allTasks.length; c++) {
        var taskClosed = allTasks[c];
        if (taskClosed.status === 'done' && taskClosed.updated_at && taskClosed.updated_at >= weekAgoStr) {
            closedThisWeek++;
        }
    }
    
    console.log('KPI рассчитан:', { total: total, overdue: overdue.length, closedWeek: closedThisWeek, inProgress: inProgressCount });
    
    return {
        total: total,
        overdue: overdue.length,
        closedWeek: closedThisWeek,
        inProgress: inProgressCount,
        overdueList: overdue
    };
}

// Расчёт нагрузки по агентам
function calculateAgentLoad() {
    if (!allUsers || allUsers.length === 0) return [];
    
    var agents = [];
    for (var u = 0; u < allUsers.length; u++) {
        if (allUsers[u].role === 'agent') agents.push(allUsers[u]);
    }
    
    var today = new Date().toISOString().split('T')[0];
    var result = [];
    
    for (var a = 0; a < agents.length; a++) {
        var agent = agents[a];
        var agentTasks = [];
        for (var tt = 0; tt < allTasks.length; tt++) {
            if (allTasks[tt].assigned_to === agent.github_username) agentTasks.push(allTasks[tt]);
        }
        
        var activeTasks = 0;
        for (var at = 0; at < agentTasks.length; at++) {
            if (agentTasks[at].status !== 'done') activeTasks++;
        }
        
        var overdueTasks = 0;
        for (var ot = 0; ot < agentTasks.length; ot++) {
            var t = agentTasks[ot];
            if (t.status !== 'done' && t.due_date && t.due_date < today) overdueTasks++;
        }
        
        var completedTasks = 0;
        for (var ct = 0; ct < agentTasks.length; ct++) {
            if (agentTasks[ct].status === 'done') completedTasks++;
        }
        
        var maxLoad = 5;
        var loadPercent = Math.min(100, (activeTasks / maxLoad) * 100);
        
        result.push({
            name: agent.name,
            github_username: agent.github_username,
            role: agent.role,
            activeTasks: activeTasks,
            overdueTasks: overdueTasks,
            completedTasks: completedTasks,
            loadPercent: loadPercent
        });
    }
    
    result.sort(function(a, b) { return b.activeTasks - a.activeTasks; });
    return result;
}

// Отображение нагрузки по агентам
function renderAgentLoad(agentLoad) {
    var container = document.getElementById('agentList');
    if (!container) {
        console.error('agentList не найден');
        return;
    }
    
    if (!agentLoad || agentLoad.length === 0) {
        container.innerHTML = '<p style="opacity: 0.6; text-align: center;">Нет агентов в системе</p>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < agentLoad.length; i++) {
        var agent = agentLoad[i];
        var nameParts = agent.name.split(' ');
        var initials = '';
        for (var p = 0; p < nameParts.length; p++) {
            initials += nameParts[p][0];
        }
        var loadColor = agent.loadPercent > 80 ? '#ff6b6b' : (agent.loadPercent > 50 ? '#ffc107' : '#4caf50');
        
        html += '<div class="agent-item">' +
            '<div class="agent-info">' +
                '<div class="agent-avatar">' + initials + '</div>' +
                '<div class="agent-name">' + escapeHtml(agent.name) + '</div>' +
            '</div>' +
            '<div class="agent-stats">' +
                '<span><i class="fas fa-tasks"></i> ' + agent.activeTasks + ' активных</span>';
        
        if (agent.overdueTasks > 0) {
            html += '<span class="overdue-badge"><i class="fas fa-exclamation-triangle"></i> ' + agent.overdueTasks + ' просрочено</span>';
        }
        
        html += '<div class="progress-bar-container">' +
                    '<div class="progress-bar" style="width: ' + agent.loadPercent + '%; background: ' + loadColor + ';"></div>' +
                '</div>' +
                '<span>' + Math.round(agent.loadPercent) + '%</span>' +
            '</div>' +
        '</div>';
    }
    
    container.innerHTML = html;
}

// Отображение просроченных задач
function renderOverdueTasks(overdueList) {
    var container = document.getElementById('overdueTasksList');
    if (!container) return;
    
    if (!overdueList || overdueList.length === 0) {
        container.innerHTML = '<p style="opacity: 0.6; text-align: center; padding: 20px;"><i class="fas fa-check-circle"></i> Нет просроченных задач</p>';
        return;
    }
    
    var today = new Date().toISOString().split('T')[0];
    var html = '';
    
    for (var i = 0; i < overdueList.length; i++) {
        var task = overdueList[i];
        var assignee = null;
        for (var u = 0; u < allUsers.length; u++) {
            if (allUsers[u].github_username === task.assigned_to) {
                assignee = allUsers[u];
                break;
            }
        }
        var assigneeName = assignee ? assignee.name : 'Не назначен';
        var daysOverdue = Math.floor((new Date(today) - new Date(task.due_date)) / (1000 * 60 * 60 * 24));
        
        html += '<div class="overdue-task">' +
            '<div>' +
                '<div class="overdue-title">' + escapeHtml(task.title) + '</div>' +
                '<div style="font-size: 0.75rem; opacity: 0.7; margin-top: 4px;">' +
                    '<i class="fas fa-user"></i> ' + assigneeName + ' | <i class="fas fa-calendar"></i> просрочено на ' + daysOverdue + ' дн.' +
                '</div>' +
            '</div>' +
            '<button class="action-btn" onclick="goToTask(' + task.id + ')">Перейти →</button>' +
        '</div>';
    }
    
    container.innerHTML = html;
}

// Отображение графика активности
function renderActivityChart() {
    var container = document.getElementById('activityChart');
    if (!container) return;
    
    var days = [];
    for (var i = 6; i >= 0; i--) {
        var date = new Date();
        date.setDate(date.getDate() - i);
        days.push(date.toISOString().split('T')[0]);
    }
    
    var closedByDay = [];
    for (var d = 0; d < days.length; d++) {
        var day = days[d];
        var count = 0;
        for (var t = 0; t < allTasks.length; t++) {
            var task = allTasks[t];
            if (task.status === 'done' && task.updated_at === day) {
                count++;
            }
        }
        closedByDay.push(count);
    }
    
    var maxCount = 0;
    for (var m = 0; m < closedByDay.length; m++) {
        if (closedByDay[m] > maxCount) maxCount = closedByDay[m];
    }
    if (maxCount === 0) maxCount = 1;
    
    var html = '';
    for (var x = 0; x < days.length; x++) {
        var height = (closedByDay[x] / maxCount) * 120;
        var dayLabel = days[x].slice(5);
        
        html += '<div class="chart-bar">' +
            '<div class="bar" style="height: ' + Math.max(4, height) + 'px;"></div>' +
            '<div class="bar-label">' + dayLabel + '</div>' +
            '<div style="font-size: 0.65rem; color: var(--accent);">' + closedByDay[x] + '</div>' +
        '</div>';
    }
    
    container.innerHTML = html;
}

// Обновление KPI
function updateKPI(kpi) {
    var totalEl = document.getElementById('totalTasks');
    var overdueEl = document.getElementById('overdueTasks');
    var closedEl = document.getElementById('closedWeek');
    var progressEl = document.getElementById('inProgress');
    
    if (totalEl) totalEl.textContent = kpi.total;
    if (overdueEl) overdueEl.textContent = kpi.overdue;
    if (closedEl) closedEl.textContent = kpi.closedWeek;
    if (progressEl) progressEl.textContent = kpi.inProgress;
    
    console.log('KPI обновлён:', kpi);
}

// Переход к задаче на доске
function goToTask(taskId) {
    window.location.href = 'tasks.html?task=' + taskId;
}

// Инициализация
async function init() {
    console.log('init() вызвана');
    
    if (!window.auth) {
        console.error('window.auth не определён! Проверь подключение auth.js');
        return;
    }
    
    console.log('Вызываем auth.initAuth()...');
    await auth.initAuth();
    var authUser = auth.getCurrentUser();
    console.log('auth.getCurrentUser():', authUser);
    
    // Обновляем интерфейс
    if (authUser) {
        var userNameSpan = document.getElementById('userName');
        if (userNameSpan) {
            var roleLabel = '';
            if (authUser.role === 'admin') roleLabel = 'Администратор';
            else if (authUser.role === 'manager') roleLabel = 'Менеджер';
            else if (authUser.role === 'agent') roleLabel = 'Агент';
            else roleLabel = 'Наблюдатель';
            userNameSpan.innerHTML = '<i class="fab fa-github"></i> ' + escapeHtml(authUser.name) + ' (' + roleLabel + ')';
            console.log('Имя пользователя обновлено:', authUser.name);
        }
    } else {
        console.error('authUser = null, пользователь не авторизован');
        // Перенаправляем на страницу входа
        window.location.href = 'auth.html';
        return;
    }
    
    // Проверка прав доступа
    if (authUser.role !== 'manager' && authUser.role !== 'admin') {
        var mainEl = document.querySelector('main');
        if (mainEl) {
            mainEl.innerHTML = '<div class="info-panel" style="text-align: center;">' +
                '<h2><i class="fas fa-lock"></i> Доступ ограничен</h2>' +
                '<p>Эта страница доступна только менеджерам и администраторам.</p>' +
                '<a href="index.html" class="nav-btn" style="margin-top: 20px; display: inline-block;">Вернуться на главную</a>' +
            '</div>';
        }
        return;
    }
    
    console.log('Загружаем данные...');
    await loadData();
    console.log('Данные загружены. allTasks:', allTasks.length, 'allUsers:', allUsers.length);
    
    var kpi = calculateKPI();
    updateKPI(kpi);
    
    var agentLoad = calculateAgentLoad();
    renderAgentLoad(agentLoad);
    
    renderOverdueTasks(kpi.overdueList);
    renderActivityChart();
    
    console.log('init() завершена');
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Запуск после загрузки страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
