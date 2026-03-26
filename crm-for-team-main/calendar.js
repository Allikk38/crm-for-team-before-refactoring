// calendar.js - календарь с drag-and-drop

let tasks = [];
let users = [];
let currentDate = new Date();
let draggedTask = null;

async function loadCalendarData() {
    try {
        const tasksData = await loadCSV('data/tasks.csv');
        tasks = tasksData.map(task => ({
            ...task,
            id: parseInt(task.id),
            due_date: task.due_date || null,
            title: task.title || 'Без названия',
            description: task.description || '',
            assigned_to: task.assigned_to || '',
            priority: task.priority || 'medium',
            status: task.status || 'todo'
        }));
        
        users = await loadCSV('data/users.csv');
        
        console.log('Загружено задач:', tasks.length);
        console.log('Загружено пользователей:', users.length);
        
        renderCalendar();
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        const calendarDays = document.getElementById('calendarDays');
        if (calendarDays) {
            calendarDays.innerHTML = '<div style="text-align: center; padding: 40px;">Ошибка загрузки данных. Проверьте подключение.</div>';
        }
    }
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    let startDayOfWeek = firstDayOfMonth.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 7 : startDayOfWeek;
    
    const daysInMonth = lastDayOfMonth.getDate();
    const daysFromPrevMonth = startDayOfWeek - 1;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    
    const currentMonthEl = document.getElementById('currentMonth');
    if (currentMonthEl) currentMonthEl.textContent = monthNames[month] + ' ' + year;
    
    const calendarDays = document.getElementById('calendarDays');
    if (!calendarDays) return;
    calendarDays.innerHTML = '';
    
    const tasksByDate = {};
    tasks.forEach(task => {
        if (task.due_date && task.due_date !== '') {
            if (!tasksByDate[task.due_date]) tasksByDate[task.due_date] = [];
            tasksByDate[task.due_date].push(task);
        }
    });
    
    for (let i = daysFromPrevMonth; i > 0; i--) {
        const date = new Date(year, month, -i + 1);
        addCalendarDay(calendarDays, date, tasksByDate, true);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month, i);
        addCalendarDay(calendarDays, date, tasksByDate, false);
    }
    
    const totalCells = 42;
    const remainingDays = totalCells - (daysFromPrevMonth + daysInMonth);
    for (let i = 1; i <= remainingDays; i++) {
        const date = new Date(year, month + 1, i);
        addCalendarDay(calendarDays, date, tasksByDate, true);
    }
}

function addCalendarDay(container, date, tasksByDate, isEmpty) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (date.toDateString() === today.toDateString()) {
        dayDiv.classList.add('today');
    }
    
    if (isEmpty) {
        dayDiv.classList.add('empty');
    }
    
    const dateStr = date.toISOString().split('T')[0];
    const dayTasks = tasksByDate[dateStr] || [];
    
    let tasksHtml = '';
    for (let i = 0; i < dayTasks.length; i++) {
        const task = dayTasks[i];
        const assignee = users.find(function(u) { return u.github_username === task.assigned_to; });
        const assigneeName = assignee ? assignee.name.split(' ')[0] : '?';
        let shortTitle = task.title;
        if (task.title.length > 18) {
            shortTitle = task.title.slice(0, 15) + '…';
        }
        
        tasksHtml += '<div class="day-task ' + task.priority + '" draggable="true" data-task-id="' + task.id + '" data-task-title="' + escapeHtml(task.title) + '">' +
            '<span class="task-title-small" title="' + escapeHtml(task.title) + ' (' + assigneeName + ')">' +
                escapeHtml(shortTitle) +
            '</span>' +
            '<i class="fas fa-times remove-date" data-task-id="' + task.id + '" data-date="' + dateStr + '" title="Удалить дедлайн"></i>' +
        '</div>';
    }
    
    let countHtml = '';
    if (dayTasks.length > 0) {
        countHtml = '<span class="task-count">' + dayTasks.length + '</span>';
    }
    
    dayDiv.innerHTML = '<div class="day-number">' +
        '<span>' + date.getDate() + '</span>' +
        countHtml +
    '</div>' +
    '<div class="day-tasks">' + tasksHtml + '</div>';
    
    if (!isEmpty) {
        dayDiv.addEventListener('dragover', function(e) {
            e.preventDefault();
            dayDiv.classList.add('drag-over');
        });
        
        dayDiv.addEventListener('dragleave', function() {
            dayDiv.classList.remove('drag-over');
        });
        
        dayDiv.addEventListener('drop', async function(e) {
            e.preventDefault();
            dayDiv.classList.remove('drag-over');
            
            const taskId = e.dataTransfer.getData('text/plain');
            if (taskId) {
                await updateTaskDueDate(parseInt(taskId), dateStr);
            }
        });
    }
    
    container.appendChild(dayDiv);
    
    const taskElements = dayDiv.querySelectorAll('.day-task');
    for (let i = 0; i < taskElements.length; i++) {
        const taskEl = taskElements[i];
        taskEl.addEventListener('dragstart', handleTaskDragStart);
        taskEl.addEventListener('dragend', handleTaskDragEnd);
        
        const removeBtn = taskEl.querySelector('.remove-date');
        if (removeBtn) {
            removeBtn.addEventListener('click', async function(e) {
                e.stopPropagation();
                const taskId = parseInt(removeBtn.getAttribute('data-task-id'));
                await updateTaskDueDate(taskId, null);
            });
        }
    }
}

function handleTaskDragStart(e) {
    draggedTask = e.target.closest('.day-task');
    if (draggedTask) {
        draggedTask.classList.add('dragging');
        const taskId = draggedTask.getAttribute('data-task-id');
        e.dataTransfer.setData('text/plain', taskId);
        e.dataTransfer.effectAllowed = 'move';
    }
}

function handleTaskDragEnd(e) {
    if (draggedTask) {
        draggedTask.classList.remove('dragging');
        draggedTask = null;
    }
}

async function updateTaskDueDate(taskId, newDueDate) {
    const task = tasks.find(function(t) { return t.id === taskId; });
    if (!task) return;
    
    const oldDate = task.due_date;
    task.due_date = newDueDate;
    task.updated_at = new Date().toISOString().split('T')[0];
    
    const saved = await saveTasksToGitHub();
    
    if (saved) {
        renderCalendar();
        if (newDueDate) {
            showToast('success', 'Дедлайн задачи "' + task.title + '" изменён на ' + formatDate(newDueDate));
        } else {
            showToast('info', 'Дедлайн задачи "' + task.title + '" удалён');
        }
    } else {
        task.due_date = oldDate;
        alert('Ошибка сохранения. Попробуйте ещё раз.');
    }
}

async function saveTasksToGitHub() {
    const currentUser = auth.getCurrentUser();
    if (!currentUser || !auth.hasPermission('edit')) {
        alert('У вас нет прав на редактирование задач');
        return false;
    }
    
    const tasksToSave = [];
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
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
            due_date: task.due_date || ''
        });
    }
    
    return await window.utils.saveCSVToGitHub(
        'data/tasks.csv',
        tasksToSave,
        'Update task due date by ' + currentUser.name
    );
}

function showToast(type, message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    const iconClass = type === 'success' ? 'fa-check-circle' : 'fa-info-circle';
    toast.innerHTML = '<i class="fas ' + iconClass + '"></i>' +
        '<span>' + escapeHtml(message) + '</span>';
    
    document.body.appendChild(toast);
    
    setTimeout(function() {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return parts[2] + '.' + parts[1] + '.' + parts[0];
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function prevMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
}

function goToToday() {
    currentDate = new Date();
    renderCalendar();
}

async function init() {
    await auth.initAuth();
    await loadCalendarData();
    if (window.theme) window.theme.initTheme();
    
    const style = document.createElement('style');
    style.textContent = '.task-count { background: var(--accent); padding: 2px 6px; border-radius: 20px; font-size: 0.7rem; font-weight: 600; }';
    document.head.appendChild(style);
    
    const prevBtn = document.getElementById('prevMonth');
    const nextBtn = document.getElementById('nextMonth');
    const todayBtn = document.getElementById('todayBtn');
    
    if (prevBtn) prevBtn.addEventListener('click', prevMonth);
    if (nextBtn) nextBtn.addEventListener('click', nextMonth);
    if (todayBtn) todayBtn.addEventListener('click', goToToday);
}

document.addEventListener('DOMContentLoaded', init);
