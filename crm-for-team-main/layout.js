/**
 * ============================================
 * ФАЙЛ: layout.js
 * РОЛЬ: Управление боковой навигационной панелью
 * СВЯЗИ:
 *   - auth.js: auth.getCurrentUser(), auth.logout()
 *   - theme.js: window.theme
 *   - localStorage: сохранение состояния панели
 * МЕХАНИКА:
 *   1. Управление состоянием боковой панели (развёрнута/свёрнута)
 *   2. Сохранение состояния в localStorage
 *   3. Адаптация для мобильных устройств
 *   4. Обработка клика по профилю (переход в профиль)
 *   5. Централизованная генерация навигации из единого массива
 *   6. Фильтрация пунктов меню по роли пользователя
 *   7. Подсветка активного пункта меню
 *   8. Кнопка выхода и кнопка темы в нижней части панели
 * ============================================
 */

// Состояние боковой панели
let sidebarCollapsed = false;

// ========== ЦЕНТРАЛИЗОВАННАЯ НАВИГАЦИЯ ==========

/**
 * Единый источник истины для всех пунктов меню
 * 
 * Структура пункта:
 * {
 *   href: string,        // ссылка на страницу
 *   icon: string,        // класс иконки Font Awesome (без "fas ")
 *   label: string,       // текст пункта
 *   roles: array|null    // массив ролей, которые видят пункт (null = все)
 * }
 */
const NAVIGATION_ITEMS = [
    // Базовые пункты (видят все)
    { href: "index.html", icon: "fa-home", label: "Дашборд", roles: null },
    { href: "tasks.html", icon: "fa-tasks", label: "Доска задач", roles: null },
    { href: "complexes.html", icon: "fa-building", label: "Объекты", roles: null },
    { href: "deals.html", icon: "fa-handshake", label: "Заявки", roles: null },
    { href: "counterparties.html", icon: "fa-users", label: "Контрагенты", roles: null },
    { href: "calendar.html", icon: "fa-calendar-alt", label: "Календарь", roles: null },
    { href: "calendar-integration.html", icon: "fa-plug", label: "Подключить календарь", roles: null },
    
    // Пункты для админов и менеджеров
    { href: "manager.html", icon: "fa-chart-simple", label: "Панель менеджера", roles: ["admin", "manager"] },
    
    // Пункты только для админов
    { href: "admin.html", icon: "fa-users-cog", label: "Управление", roles: ["admin"] }
];

/**
 * Рендеринг навигации на основе роли пользователя
 */
function renderNavigation() {
    const user = auth.getCurrentUser();
    const container = document.getElementById('sidebar-nav');
    
    if (!container) {
        console.warn('[layout.js] Контейнер #sidebar-nav не найден');
        return;
    }
    
    // Фильтруем пункты по роли
    const visibleItems = NAVIGATION_ITEMS.filter(item => {
        if (!item.roles) return true;
        if (!user) return false;
        return item.roles.includes(user.role);
    });
    
    // Определяем текущий путь для подсветки активного пункта
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    
    // Генерируем HTML
    let html = '';
    for (const item of visibleItems) {
        const isActive = (item.href === currentPath) || 
                         (currentPath === 'index.html' && item.href === 'index.html');
        
        html += `<a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}">
            <i class="fas ${item.icon}"></i>
            <span>${escapeHtml(item.label)}</span>
        </a>`;
    }
    
    container.innerHTML = html;
    console.log('[layout.js] Навигация отрендерена, пунктов:', visibleItems.length);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== ОСТАЛЬНОЙ ФУНКЦИОНАЛ ==========

// Инициализация боковой панели
function initSidebar() {
    // Загружаем сохранённое состояние
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved === 'true') {
        sidebarCollapsed = true;
        document.getElementById('sidebar')?.classList.add('collapsed');
    }
    
    // Рендерим навигацию (централизованно)
    renderNavigation();
    
    // Добавляем обработчики для мобильного меню
    initMobileMenu();
    
    // Добавляем кнопку выхода и кнопку темы
    addSidebarButtons();
}

// Сворачивание/разворачивание панели
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    sidebarCollapsed = !sidebarCollapsed;
    
    if (sidebarCollapsed) {
        sidebar.classList.add('collapsed');
        localStorage.setItem('sidebar_collapsed', 'true');
    } else {
        sidebar.classList.remove('collapsed');
        localStorage.setItem('sidebar_collapsed', 'false');
    }
}

// Инициализация мобильного меню
function initMobileMenu() {
    // Создаём кнопку для мобильного меню
    const toggleBtn = document.createElement('div');
    toggleBtn.className = 'mobile-menu-toggle';
    toggleBtn.innerHTML = '<i class="fas fa-bars"></i>';
    toggleBtn.onclick = () => {
        const sidebar = document.getElementById('sidebar');
        sidebar?.classList.toggle('mobile-open');
    };
    document.body.appendChild(toggleBtn);
    
    // Закрываем меню при клике вне его
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.querySelector('.mobile-menu-toggle');
        if (window.innerWidth <= 768 && sidebar?.classList.contains('mobile-open')) {
            if (!sidebar.contains(e.target) && !toggle?.contains(e.target)) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });
}

// Добавление кнопок в нижнюю часть боковой панели
function addSidebarButtons() {
    const sidebarFooter = document.querySelector('.sidebar-footer');
    if (!sidebarFooter) return;
    
    // Очищаем футер от существующих кнопок (кроме collapse-btn)
    const existingBtns = sidebarFooter.querySelectorAll('button:not(.collapse-btn)');
    existingBtns.forEach(btn => btn.remove());
    
    // Кнопка переключения темы
    const themeBtn = document.createElement('button');
    themeBtn.className = 'theme-btn';
    const currentTheme = localStorage.getItem('crm_theme') || 'dark';
    themeBtn.innerHTML = currentTheme === 'dark' 
        ? '<i class="fas fa-sun"></i> <span>Светлая тема</span>' 
        : '<i class="fas fa-moon"></i> <span>Тёмная тема</span>';
    themeBtn.onclick = (e) => {
        e.stopPropagation();
        toggleTheme();
    };
    
    // Кнопка выхода
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'logout-btn';
    logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> <span>Выйти</span>';
    logoutBtn.onclick = (e) => {
        e.stopPropagation();
        logout();
    };
    
    sidebarFooter.appendChild(themeBtn);
    sidebarFooter.appendChild(logoutBtn);
}

// Переключение темы
function toggleTheme() {
    if (window.theme && window.theme.toggleTheme) {
        window.theme.toggleTheme();
    } else {
        // Fallback
        const isDark = document.documentElement.classList.contains('theme-dark');
        if (isDark) {
            document.documentElement.classList.remove('theme-dark');
            document.documentElement.classList.add('theme-light');
            document.body.classList.remove('theme-dark');
            document.body.classList.add('theme-light');
            localStorage.setItem('crm_theme', 'light');
        } else {
            document.documentElement.classList.remove('theme-light');
            document.documentElement.classList.add('theme-dark');
            document.body.classList.remove('theme-light');
            document.body.classList.add('theme-dark');
            localStorage.setItem('crm_theme', 'dark');
        }
    }
    
    // Обновляем текст кнопки
    const themeBtn = document.querySelector('.theme-btn');
    if (themeBtn) {
        const isDarkNow = document.documentElement.classList.contains('theme-dark');
        themeBtn.innerHTML = isDarkNow 
            ? '<i class="fas fa-sun"></i> <span>Светлая тема</span>' 
            : '<i class="fas fa-moon"></i> <span>Тёмная тема</span>';
    }
}

// Переход в профиль
function goToProfile() {
    window.location.href = 'profile.html';
}

// Выход из системы
function logout() {
    if (confirm('Вы уверены, что хотите выйти из системы?')) {
        if (window.auth && window.auth.logout) {
            window.auth.logout();
        } else {
            localStorage.removeItem('crm_session');
            localStorage.removeItem('crm_remember_me');
            window.location.href = 'auth.html';
        }
    }
}

// Экспорт
window.sidebar = {
    initSidebar,
    toggleSidebar,
    goToProfile,
    logout,
    renderNavigation
};

// Автоматическая инициализация
document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
});
