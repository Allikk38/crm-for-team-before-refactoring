/**
 * ============================================
 * ФАЙЛ: auth.js (ИСПРАВЛЕННАЯ ВЕРСИЯ)
 * РОЛЬ: Управление авторизацией и сессиями
 * СВЯЗИ:
 *   - core.js: loadCSV(), utils.saveCSVToGitHub()
 *   - Данные: data/users.csv
 * МЕХАНИКА:
 *   1. Проверка входа по имени + пин-коду
 *   2. Управление пользователями (админ)
 *   3. Управление сессией в localStorage
 *   4. Ролевая модель (admin, manager, agent, viewer)
 *   5. Сброс пин-кода при первом входе
 *   6. Автоматическое создание временного пин-кода для новых пользователей
 * ============================================
 */

let currentUser = null;

// Роли и их права
const ROLES = {
    admin: {
        name: 'Администратор',
        permissions: ['view_all', 'edit_all', 'delete_all', 'manage_users', 'view_manager_panel']
    },
    manager: {
        name: 'Менеджер',
        permissions: ['view_all_tasks', 'view_all_complexes', 'edit_assigned', 'view_manager_panel']
    },
    agent: {
        name: 'Агент',
        permissions: ['view_own_tasks', 'view_public_tasks', 'edit_own_tasks', 'view_own_complexes']
    },
    viewer: {
        name: 'Наблюдатель',
        permissions: ['view_public_tasks', 'view_public_complexes']
    }
};

// Загрузка пользователей
async function loadUsers() {
    try {
        const users = await loadCSV('data/users.csv');
        return users || [];
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        return [];
    }
}

// Сохранение пользователей
async function saveUsers(users) {
    const currentUserAuth = getCurrentUser();
    if (!currentUserAuth || !hasPermission('manage_users')) {
        console.error('Нет прав на сохранение пользователей');
        return false;
    }
    
    return await window.utils.saveCSVToGitHub(
        'data/users.csv',
        users,
        'Update users by ' + currentUserAuth.name
    );
}

// Создание нового пользователя (только для admin)
async function createUser(username, name, role, email) {
    const current = getCurrentUser();
    if (!current || !hasPermission('manage_users')) {
        return { success: false, error: 'Недостаточно прав' };
    }
    
    if (!username || !name || !role) {
        return { success: false, error: 'Заполните все обязательные поля' };
    }
    
    const users = await loadUsers();
    
    // Проверяем уникальность username
    if (users.find(u => u.github_username === username)) {
        return { success: false, error: 'Пользователь с таким логином уже существует' };
    }
    
    // Генерируем временный пин-код
    const tempPin = Math.floor(1000 + Math.random() * 9000).toString();
    
    const newUser = {
        github_username: username,
        name: name,
        role: role,
        email: email || '',
        pin: tempPin,
        created_at: new Date().toISOString().split('T')[0]
    };
    
    users.push(newUser);
    const saved = await saveUsers(users);
    
    if (saved) {
        return { 
            success: true, 
            user: newUser,
            tempPin: tempPin
        };
    }
    
    return { success: false, error: 'Ошибка сохранения' };
}

// Получить всех пользователей (с фильтром по роли)
async function getUsers() {
    const users = await loadUsers();
    const current = getCurrentUser();
    
    if (!current) return [];
    
    // Админ видит всех
    if (current.role === 'admin') {
        return users;
    }
    
    // Менеджер видит всех агентов и себя
    if (current.role === 'manager') {
        return users.filter(u => u.role === 'agent' || u.github_username === current.github_username);
    }
    
    // Агент видит только себя
    return users.filter(u => u.github_username === current.github_username);
}

// Вход по имени и пин-коду
async function loginWithPin(username, pin) {
    const users = await loadUsers();
    const user = users.find(u => u.github_username === username);
    
    if (!user) {
        return { success: false, error: 'Пользователь не найден' };
    }
    
    // Проверка пин-кода (сравниваем как строки)
    const storedPin = String(user.pin || '1234');
    const inputPin = String(pin);
    
    if (inputPin !== storedPin) {
        return { success: false, error: 'Неверный пин-код' };
    }
    
    // Если это первый вход (временный пин-код), требуем сменить
    if (storedPin === '1234' && (!user.pin_changed || user.pin_changed !== 'true')) {
        return { 
            success: false, 
            error: 'Это ваш первый вход. Пожалуйста, смените пин-код',
            needChange: true,
            user: {
                github_username: user.github_username,
                name: user.name,
                role: user.role,
                email: user.email || ''
            }
        };
    }
    
    return {
        success: true,
        user: {
            github_username: user.github_username,
            name: user.name,
            role: user.role,
            email: user.email || '',
            pin: user.pin
        }
    };
}

// Смена пин-кода
async function changePin(username, oldPin, newPin) {
    if (!newPin || newPin.length !== 4 || !/^\d+$/.test(newPin)) {
        return { success: false, error: 'Пин-код должен быть 4 цифры' };
    }
    
    const users = await loadUsers();
    const userIndex = users.findIndex(u => u.github_username === username);
    
    if (userIndex === -1) {
        return { success: false, error: 'Пользователь не найден' };
    }
    
    const user = users[userIndex];
    const storedPin = String(user.pin || '1234');
    
    if (String(oldPin) !== storedPin) {
        return { success: false, error: 'Неверный текущий пин-код' };
    }
    
    users[userIndex].pin = newPin;
    users[userIndex].pin_changed = 'true';
    const saved = await saveUsers(users);
    
    if (saved) {
        return { success: true };
    } else {
        return { success: false, error: 'Ошибка сохранения' };
    }
}

// Сброс пин-кода (только для админа)
async function resetPin(username) {
    const current = getCurrentUser();
    if (!current || !hasPermission('manage_users')) {
        return { success: false, error: 'Недостаточно прав' };
    }
    
    const users = await loadUsers();
    const userIndex = users.findIndex(u => u.github_username === username);
    
    if (userIndex === -1) {
        return { success: false, error: 'Пользователь не найден' };
    }
    
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    users[userIndex].pin = newPin;
    delete users[userIndex].pin_changed;
    
    const saved = await saveUsers(users);
    
    if (saved) {
        return { success: true, newPin: newPin };
    }
    
    return { success: false, error: 'Ошибка сохранения' };
}

// Отправка magic link (заглушка — требует бэкенд)
async function sendMagicLink(email) {
    const users = await loadUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) {
        return { success: false, error: 'Пользователь с таким email не найден' };
    }
    
    const token = btoa(user.github_username + ':' + Date.now());
    const link = window.location.origin + '/crm-for-team/callback.html?token=' + token;
    
    console.log('Magic link:', link);
    alert('Для демонстрации: ссылка для входа\n' + link);
    
    localStorage.setItem('magic_token_' + token, user.github_username);
    setTimeout(() => {
        localStorage.removeItem('magic_token_' + token);
    }, 30 * 60 * 1000);
    
    return { success: true };
}

// Проверка magic link токена
async function verifyMagicToken(token) {
    const username = localStorage.getItem('magic_token_' + token);
    if (!username) return null;
    
    const users = await loadUsers();
    const user = users.find(u => u.github_username === username);
    
    if (!user) return null;
    
    localStorage.removeItem('magic_token_' + token);
    
    return {
        github_username: user.github_username,
        name: user.name,
        role: user.role,
        email: user.email || ''
    };
}

// Сохранение сессии
function saveSession(user, days = 7) {
    const session = {
        user: user,
        expires: Date.now() + (days * 24 * 60 * 60 * 1000)
    };
    localStorage.setItem('crm_session', JSON.stringify(session));
    currentUser = user;
}

// Проверка сессии
function checkSession() {
    const sessionData = localStorage.getItem('crm_session');
    if (!sessionData) return null;
    
    try {
        const session = JSON.parse(sessionData);
        if (session.expires && session.expires > Date.now()) {
            currentUser = session.user;
            return currentUser;
        } else {
            localStorage.removeItem('crm_session');
            return null;
        }
    } catch(e) {
        localStorage.removeItem('crm_session');
        return null;
    }
}

// Выход из системы
function logout() {
    localStorage.removeItem('crm_session');
    currentUser = null;
    window.location.href = 'auth.html';
}

// Получить текущего пользователя
function getCurrentUser() {
    if (currentUser) return currentUser;
    return checkSession();
}

// Проверка прав пользователя
function hasPermission(permission) {
    const user = getCurrentUser();
    if (!user) return false;
    const userRole = user.role;
    const rolePermissions = ROLES[userRole];
    return rolePermissions && rolePermissions.permissions.includes(permission);
}

// Проверка роли
function hasRole(role) {
    const user = getCurrentUser();
    return user && user.role === role;
}

// Фильтрация задач по правам пользователя
function filterTasksByPermissions(tasks) {
    const user = getCurrentUser();
    if (!user) return [];
    
    // Админ и менеджер видят всё
    if (user.role === 'admin' || user.role === 'manager') {
        return tasks;
    }
    
    // Агент: свои задачи + публичные
    if (user.role === 'agent') {
        return tasks.filter(task => {
            return task.assigned_to === user.github_username || 
                   task.is_private !== 'true';
        });
    }
    
    // Наблюдатель: только публичные
    return tasks.filter(task => task.is_private !== 'true');
}

// Фильтрация объектов по правам пользователя
function filterComplexesByPermissions(complexes) {
    const user = getCurrentUser();
    if (!user) return [];
    
    // Админ и менеджер видят всё
    if (user.role === 'admin' || user.role === 'manager') {
        return complexes;
    }
    
    // Агент: свои объекты + публичные
    if (user.role === 'agent') {
        return complexes.filter(complex => {
            return complex.assignee === user.github_username || 
                   complex.is_public === 'true';
        });
    }
    
    // Наблюдатель: только публичные
    return complexes.filter(complex => complex.is_public === 'true');
}

// Обновление интерфейса (вызывается после входа)
function updateUserInterface() {
    const user = getCurrentUser();
    if (!user) return;
    
    const userNameSpan = document.getElementById('userName');
    const welcomeMessage = document.getElementById('welcomeMessage');
    
    if (userNameSpan) {
        const roleLabel = getRoleLabel(user.role);
        userNameSpan.innerHTML = '<i class="fas fa-user-circle"></i> ' + escapeHtml(user.name) + ' (' + roleLabel + ')';
    }
    
    if (welcomeMessage) {
        welcomeMessage.textContent = 'Добро пожаловать, ' + user.name + '! Ваша роль: ' + getRoleLabel(user.role);
    }
    
    // Скрываем/показываем элементы в зависимости от роли
    document.querySelectorAll('[data-role]').forEach(el => {
        const requiredRoles = el.dataset.role.split(',');
        const hasAccess = requiredRoles.includes(user.role);
        el.style.display = hasAccess ? '' : 'none';
    });
    
    // Показываем кнопку "Панель менеджера" только для admin и manager
    const managerBtn = document.querySelector('a[href="manager.html"]');
    if (managerBtn) {
        managerBtn.style.display = (user.role === 'admin' || user.role === 'manager') ? '' : 'none';
    }
    
    // Показываем кнопку "Управление пользователями" только для admin
    const adminBtn = document.querySelector('a[href="admin.html"]');
    if (adminBtn) {
        adminBtn.style.display = user.role === 'admin' ? '' : 'none';
    }
}

function getRoleLabel(role) {
    const labels = {
        admin: 'Администратор',
        manager: 'Менеджер',
        agent: 'Агент',
        viewer: 'Наблюдатель'
    };
    return labels[role] || role;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Инициализация авторизации
async function initAuth() {
    const user = checkSession();
    if (user) {
        currentUser = user;
        updateUserInterface();
        return user;
    }
    
    // Если нет сессии и мы не на странице входа — перенаправляем
    const isAuthPage = window.location.pathname.includes('auth.html') || 
                       window.location.pathname.includes('callback.html');
    if (!isAuthPage) {
        window.location.href = 'auth.html';
    }
    
    return null;
}

// Экспорт
window.auth = {
    initAuth,
    loginWithPin,
    changePin,
    resetPin,
    createUser,
    getUsers,
    sendMagicLink,
    verifyMagicToken,
    saveSession,
    checkSession,
    logout,
    getCurrentUser,
    hasPermission,
    hasRole,
    filterTasksByPermissions,
    filterComplexesByPermissions,
    updateUserInterface
};
