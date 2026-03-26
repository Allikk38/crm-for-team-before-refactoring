/**
 * ============================================
 * ФАЙЛ: notifications.js
 * РОЛЬ: Управление push-уведомлениями в браузере
 * СВЯЗИ:
 *   - core.js: loadCSV()
 *   - auth.js: auth.getCurrentUser()
 *   - localStorage: хранение уведомлений и настроек
 * МЕХАНИКА:
 *   1. Запрос разрешения на уведомления
 *   2. Отправка уведомлений при событиях:
 *      - Назначение новой задачи
 *      - Изменение статуса задачи
 *      - Приближение дедлайна (за 1 день)
 *      - Просрочка задачи
 *      - @упоминание в комментарии
 *   3. Центр уведомлений (история)
 *   4. Маркировка прочитанных/непрочитанных
 * ============================================
 */

var notificationsCenter = [];

// Запрос разрешения на уведомления
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('Браузер не поддерживает уведомления');
        return;
    }
    
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(function(permission) {
            if (permission === 'granted') {
                console.log('Уведомления разрешены');
                localStorage.setItem('notifications_enabled', 'true');
            }
        });
    }
}

// Отправка уведомления
function sendNotification(title, body, tag, onClickUrl) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    
    var enabled = localStorage.getItem('notifications_enabled') !== 'false';
    if (!enabled) return;
    
    var notification = new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        tag: tag,
        requireInteraction: false
    });
    
    notification.onclick = function() {
        window.focus();
        if (onClickUrl) {
            window.location.href = onClickUrl;
        }
        notification.close();
    };
    
    setTimeout(function() {
        notification.close();
    }, 10000);
}

// Добавление уведомления в центр
function addToNotificationCenter(type, title, message, taskId, complexId) {
    var notification = {
        id: Date.now(),
        type: type,
        title: title,
        message: message,
        task_id: taskId || null,
        complex_id: complexId || null,
        read: false,
        created_at: new Date().toISOString()
    };
    
    var notifications = JSON.parse(localStorage.getItem('crm_notifications_center') || '[]');
    notifications.unshift(notification);
    
    // Оставляем только последние 100
    if (notifications.length > 100) notifications.pop();
    localStorage.setItem('crm_notifications_center', JSON.stringify(notifications));
    
    // Обновляем счётчик в UI
    updateNotificationBadge();
}

// Обновление счётчика непрочитанных
function updateNotificationBadge() {
    var notifications = JSON.parse(localStorage.getItem('crm_notifications_center') || '[]');
    var unread = 0;
    for (var i = 0; i < notifications.length; i++) {
        if (!notifications[i].read) unread++;
    }
    
    var badge = document.getElementById('notificationBadge');
    if (badge) {
        if (unread > 0) {
            badge.textContent = unread > 99 ? '99+' : unread;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
    
    // Обновляем favicon счётчиком (опционально)
    updateFaviconBadge(unread);
}

// Обновление favicon (простой вариант)
function updateFaviconBadge(count) {
    var canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    var ctx = canvas.getContext('2d');
    
    var img = new Image();
    img.src = '/favicon.ico';
    img.onload = function() {
        ctx.drawImage(img, 0, 0, 32, 32);
        if (count > 0) {
            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            ctx.arc(24, 8, 8, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(count > 99 ? '99+' : count, 24, 8);
        }
        var link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = canvas.toDataURL();
        document.getElementsByTagName('head')[0].appendChild(link);
    };
}

// Проверка дедлайнов (вызывать при загрузке задач)
function checkDeadlines(tasks) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    
    var tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        if (task.status === 'done') continue;
        if (!task.due_date) continue;
        
        var dueDate = new Date(task.due_date);
        var diffDays = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));
        
        // Проверяем, не отправляли ли уже уведомление
        var notificationKey = 'deadline_notified_' + task.id;
        var alreadyNotified = localStorage.getItem(notificationKey);
        
        if (diffDays === 1 && !alreadyNotified) {
            sendNotification(
                'Задача завтра',
                'Дедлайн задачи "' + task.title + '" завтра',
                'deadline_' + task.id,
                'tasks.html?task=' + task.id
            );
            addToNotificationCenter(
                'deadline',
                'Дедлайн завтра',
                'Задача "' + task.title + '" должна быть выполнена завтра',
                task.id
            );
            localStorage.setItem(notificationKey, 'true');
        } else if (diffDays < 0 && !alreadyNotified) {
            sendNotification(
                'Задача просрочена',
                'Дедлайн задачи "' + task.title + '" просрочен',
                'overdue_' + task.id,
                'tasks.html?task=' + task.id
            );
            addToNotificationCenter(
                'overdue',
                'Задача просрочена',
                'Задача "' + task.title + '" просрочена на ' + Math.abs(diffDays) + ' дней',
                task.id
            );
            localStorage.setItem(notificationKey, 'true');
        } else if (diffDays > 1) {
            // Сбрасываем флаг, если дедлайн перенесли
            localStorage.removeItem(notificationKey);
        }
    }
}

// Экспорт
window.notifications = {
    requestPermission: requestNotificationPermission,
    send: sendNotification,
    addToCenter: addToNotificationCenter,
    checkDeadlines: checkDeadlines,
    updateBadge: updateNotificationBadge
};
