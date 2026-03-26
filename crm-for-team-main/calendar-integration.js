/**
 * ============================================
 * ФАЙЛ: calendar-integration.js
 * РОЛЬ: Логика интеграции с внешними календарями (Google, Apple, Outlook)
 * СВЯЗИ:
 *   - core.js: loadCSV(), window.utils.saveCSVToGitHub()
 *   - auth.js: auth.getCurrentUser()
 *   - Данные: data/tasks.csv, data/user_settings.csv
 * МЕХАНИКА:
 *   1. Генерация iCal-ссылки для подписки на задачи (требует бэкенд)
 *   2. Экспорт задач в .ics файл (для импорта в календарь)
 *   3. Прямое добавление событий в Google Календарь
 *   4. Сохранение настроек уведомлений
 *   5. Генерация тестового события
 * ============================================
 */

let currentUserTasks = [];
let allTasks = [];

// Генерация iCal-ссылки (требует бэкенд, пока демо)
function generateIcalUrl() {
    const user = auth.getCurrentUser();
    if (!user) return '';
    
    // Для полноценной работы нужен бэкенд, который будет отдавать .ics файл
    // Временно показываем инструкцию по импорту через файл
    return 'Для подписки на календарь используйте экспорт .ics файла и импорт в календарь. Полноценная iCal-подписка будет доступна в следующей версии.';
}

// Копирование iCal-ссылки
function copyIcalUrl() {
    const url = generateIcalUrl();
    navigator.clipboard.writeText(url).then(() => {
        showToast('success', 'Ссылка скопирована!');
    }).catch(() => {
        showToast('info', 'Скопируйте ссылку вручную: ' + url);
    });
}

// Генерация .ics файла для экспорта
function generateIcsFile(tasks, title) {
    let ics = 'BEGIN:VCALENDAR\n';
    ics += 'VERSION:2.0\n';
    ics += 'PRODID:-//CRM Team//Task Calendar//RU\n';
    ics += 'CALSCALE:GREGORIAN\n';
    
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (!task.due_date) continue;
        
        const dueDate = new Date(task.due_date);
        const dueDateStr = dueDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        
        ics += 'BEGIN:VEVENT\n';
        ics += 'UID:' + task.id + '-' + Date.now() + '@crm-team\n';
        ics += 'DTSTAMP:' + dueDateStr + '\n';
        ics += 'DTSTART:' + dueDateStr + '\n';
        ics += 'DTEND:' + dueDateStr + '\n';
        ics += 'SUMMARY:' + escapeIcs(task.title) + '\n';
        if (task.description) {
            ics += 'DESCRIPTION:' + escapeIcs(task.description) + '\n';
        }
        if (task.complex_id) {
            ics += 'LOCATION:' + escapeIcs('Объект: ' + (task.complex_title || 'ID ' + task.complex_id)) + '\n';
        }
        ics += 'PRIORITY:' + (task.priority === 'high' ? 1 : task.priority === 'medium' ? 3 : 5) + '\n';
        ics += 'END:VEVENT\n';
    }
    
    ics += 'END:VCALENDAR';
    return ics;
}

function escapeIcs(text) {
    if (!text) return '';
    return text.replace(/[\\,;]/g, '\\$&').replace(/\n/g, '\\n');
}

// Экспорт задач в файл
function downloadIcsFile(tasks, filename) {
    if (!tasks || tasks.length === 0) {
        showToast('info', 'Нет задач с дедлайнами для экспорта');
        return;
    }
    
    const ics = generateIcsFile(tasks, filename);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename + '.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', 'Файл ' + filename + '.ics скачан. Импортируйте его в календарь');
}

// Прямое добавление в Google Календарь
function addToGoogleCalendar(task) {
    const title = encodeURIComponent(task.title);
    const description = encodeURIComponent(task.description || '');
    const date = task.due_date || new Date().toISOString().split('T')[0];
    
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${description}&dates=${date}/${date}`;
    window.open(url, '_blank');
}

// Экспорт всех задач в Google Календарь (по одному)
async function exportAllToGoogleCalendar() {
    const tasks = await loadCSV('data/tasks.csv');
    const tasksWithDueDate = tasks.filter(t => t.due_date);
    
    if (tasksWithDueDate.length === 0) {
        showToast('info', 'Нет задач с дедлайнами');
        return;
    }
    
    // Открываем первую задачу, пользователь может добавить остальные вручную
    addToGoogleCalendar(tasksWithDueDate[0]);
    showToast('info', `Открыта задача "${tasksWithDueDate[0].title}". После добавления вернитесь и нажмите ещё раз для следующей задачи.`);
}

// Экспорт моих задач в Google Календарь
async function exportMyToGoogleCalendar() {
    const user = auth.getCurrentUser();
    if (!user) return;
    
    const tasks = await loadCSV('data/tasks.csv');
    const myTasks = tasks.filter(t => t.assigned_to === user.github_username && t.due_date);
    
    if (myTasks.length === 0) {
        showToast('info', 'Нет ваших задач с дедлайнами');
        return;
    }
    
    addToGoogleCalendar(myTasks[0]);
    showToast('info', `Открыта задача "${myTasks[0].title}". После добавления вернитесь и нажмите ещё раз для следующей.`);
}

// Экспорт всех задач (файл)
async function exportAllTasks() {
    const tasks = await loadCSV('data/tasks.csv');
    const tasksWithDueDate = tasks.filter(t => t.due_date);
    downloadIcsFile(tasksWithDueDate, 'crm_all_tasks');
}

// Экспорт моих задач (файл)
async function exportMyTasks() {
    const user = auth.getCurrentUser();
    if (!user) return;
    
    const tasks = await loadCSV('data/tasks.csv');
    const myTasks = tasks.filter(t => t.assigned_to === user.github_username && t.due_date);
    downloadIcsFile(myTasks, 'crm_my_tasks');
}

// Экспорт задач на текущий месяц (файл)
async function exportCurrentMonth() {
    const tasks = await loadCSV('data/tasks.csv');
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const monthTasks = tasks.filter(t => {
        if (!t.due_date) return false;
        const dueDate = new Date(t.due_date);
        return dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear;
    });
    
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    downloadIcsFile(monthTasks, 'crm_' + monthNames[currentMonth] + '_' + currentYear);
}

// Загрузка задач для быстрого экспорта
async function loadTasksForExport() {
    const container = document.getElementById('recentTasksExport');
    if (!container) return;
    
    const user = auth.getCurrentUser();
    if (!user) return;
    
    const tasks = await loadCSV('data/tasks.csv');
    const myTasks = tasks.filter(t => t.assigned_to === user.github_username && t.due_date);
    myTasks.sort((a, b) => (a.due_date > b.due_date) ? 1 : -1);
    const recentTasks = myTasks.slice(0, 5);
    
    if (recentTasks.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Нет задач с дедлайнами</div>';
        return;
    }
    
    let html = '';
    for (let i = 0; i < recentTasks.length; i++) {
        const task = recentTasks[i];
        const dueDate = task.due_date.split('-').reverse().join('.');
        html += '<div class="calendar-item">' +
            '<div class="calendar-item-info">' +
                '<i class="fas fa-tasks"></i>' +
                '<div>' +
                    '<div><strong>' + escapeHtml(task.title) + '</strong></div>' +
                    '<div style="font-size: 0.7rem; color: var(--text-muted);">Дедлайн: ' + dueDate + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="calendar-item-actions">' +
                '<button onclick="exportSingleTask(' + task.id + ')"><i class="fas fa-download"></i></button>' +
                '<button onclick="addSingleTaskToGoogle(' + task.id + ')"><i class="fab fa-google"></i></button>' +
            '</div>' +
        '</div>';
    }
    
    container.innerHTML = html;
}

// Экспорт одной задачи (файл)
async function exportSingleTask(taskId) {
    const tasks = await loadCSV('data/tasks.csv');
    const task = tasks.find(t => parseInt(t.id) === taskId);
    if (task && task.due_date) {
        downloadIcsFile([task], 'task_' + task.id);
    }
}

// Добавить одну задачу в Google Календарь
async function addSingleTaskToGoogle(taskId) {
    const tasks = await loadCSV('data/tasks.csv');
    const task = tasks.find(t => parseInt(t.id) === taskId);
    if (task && task.due_date) {
        addToGoogleCalendar(task);
        showToast('success', 'Открыт Google Календарь для задачи "' + task.title + '"');
    } else {
        showToast('info', 'У задачи нет дедлайна');
    }
}

// Тестовое событие (файл)
async function testGoogleCalendar() {
    const user = auth.getCurrentUser();
    if (!user) return;
    
    const testEvent = [{
        id: 999999,
        title: 'Тестовое событие CRM',
        description: 'Проверка интеграции с календарём. Если вы видите это событие — интеграция работает!',
        due_date: new Date().toISOString().split('T')[0],
        priority: 'medium',
        complex_id: null
    }];
    
    downloadIcsFile(testEvent, 'crm_test_event');
    showToast('success', 'Тестовое событие создано. Импортируйте .ics файл в календарь');
}

// Тестовое событие (прямая ссылка в Google)
function testGoogleCalendarDirect() {
    const title = encodeURIComponent('Тестовое событие CRM');
    const description = encodeURIComponent('Проверка интеграции с календарём. Если вы видите это событие — интеграция работает!');
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${description}&dates=${dateStr}/${dateStr}`;
    window.open(url, '_blank');
    showToast('success', 'Google Календарь открыт. Нажмите "Сохранить" для добавления события');
}

// Сохранение настроек уведомлений
function saveNotificationSettings() {
    const settings = {
        remind1day: document.getElementById('remind1day')?.checked || false,
        remind3days: document.getElementById('remind3days')?.checked || false,
        remindToday: document.getElementById('remindToday')?.checked || false,
        emailReminders: document.getElementById('emailReminders')?.checked || false
    };
    
    localStorage.setItem('crm_calendar_settings', JSON.stringify(settings));
    showToast('success', 'Настройки сохранены');
}

// Загрузка настроек уведомлений
function loadNotificationSettings() {
    const saved = localStorage.getItem('crm_calendar_settings');
    if (saved) {
        try {
            const settings = JSON.parse(saved);
            if (document.getElementById('remind1day')) document.getElementById('remind1day').checked = settings.remind1day || false;
            if (document.getElementById('remind3days')) document.getElementById('remind3days').checked = settings.remind3days || false;
            if (document.getElementById('remindToday')) document.getElementById('remindToday').checked = settings.remindToday || false;
            if (document.getElementById('emailReminders')) document.getElementById('emailReminders').checked = settings.emailReminders || false;
        } catch(e) {}
    }
}

function showToast(type, message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-check-circle' : 'fa-info-circle') + '"></i><span>' + escapeHtml(message) + '</span>';
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function init() {
    await auth.initAuth();
    
    const user = auth.getCurrentUser();
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }
    
    const userNameSpan = document.getElementById('userName');
    if (userNameSpan) {
        const roleLabel = user.role === 'admin' ? 'Администратор' : user.role === 'manager' ? 'Менеджер' : user.role === 'agent' ? 'Агент' : 'Наблюдатель';
        userNameSpan.innerHTML = '<i class="fas fa-user-circle"></i> ' + escapeHtml(user.name) + ' (' + roleLabel + ')';
    }
    
    // Обновляем iCal-ссылку на странице
    const icalUrlSpan = document.getElementById('icalUrl');
    if (icalUrlSpan) {
        icalUrlSpan.textContent = generateIcalUrl();
    }
    
    await loadTasksForExport();
    loadNotificationSettings();
    
    if (window.theme) window.theme.initTheme();
}

// Экспорт функций для HTML
window.copyIcalUrl = copyIcalUrl;
window.exportAllTasks = exportAllTasks;
window.exportMyTasks = exportMyTasks;
window.exportCurrentMonth = exportCurrentMonth;
window.exportAllToGoogleCalendar = exportAllToGoogleCalendar;
window.exportMyToGoogleCalendar = exportMyToGoogleCalendar;
window.exportSingleTask = exportSingleTask;
window.addSingleTaskToGoogle = addSingleTaskToGoogle;
window.testGoogleCalendar = testGoogleCalendar;
window.testGoogleCalendarDirect = testGoogleCalendarDirect;
window.saveNotificationSettings = saveNotificationSettings;

document.addEventListener('DOMContentLoaded', init);
