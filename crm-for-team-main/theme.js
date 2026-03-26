// theme.js - управление темой

const THEMES = {
    dark: {
        name: 'Тёмная',
        icon: 'fa-moon',
        bodyClass: 'theme-dark'
    },
    light: {
        name: 'Светлая',
        icon: 'fa-sun',
        bodyClass: 'theme-light'
    }
};

let currentTheme = 'dark';

function initTheme() {
    // Загружаем сохранённую тему
    const savedTheme = localStorage.getItem('crm_theme');
    if (savedTheme && THEMES[savedTheme]) {
        setTheme(savedTheme);
    } else {
        // По умолчанию тёмная (или определяем системные настройки)
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark ? 'dark' : 'light');
    }
    
    // Добавляем кнопку переключения в интерфейс
    addThemeToggle();
}

function setTheme(theme) {
    currentTheme = theme;
    // Удаляем старые классы и добавляем новый
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(THEMES[theme].bodyClass);
    localStorage.setItem('crm_theme', theme);
    
    // Обновляем иконку кнопки, если она уже есть
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
        toggleBtn.innerHTML = `<i class="fas ${THEMES[theme].icon}"></i>`;
        toggleBtn.title = `${THEMES[theme].name} тема`;
    }
}

function toggleTheme() {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

function addThemeToggle() {
    // Ищем контейнер для кнопки (рядом с user-info)
    const headerTop = document.querySelector('.header-top');
    if (headerTop && !document.getElementById('themeToggle')) {
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'themeToggle';
        toggleBtn.className = 'theme-toggle';
        toggleBtn.innerHTML = `<i class="fas ${THEMES[currentTheme].icon}"></i>`;
        toggleBtn.title = `${THEMES[currentTheme].name} тема`;
        toggleBtn.onclick = toggleTheme;
        
        // Добавляем в header-top после user-info
        const userInfo = document.querySelector('.user-info');
        if (userInfo) {
            userInfo.after(toggleBtn);
        } else {
            headerTop.appendChild(toggleBtn);
        }
    }
}

// Экспорт
window.theme = {
    initTheme,
    setTheme,
    toggleTheme
};

// ========== АВТОЗАПУСК ==========
// Инициализируем тему сразу после загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
    });
} else {
    // DOM уже загружен
    initTheme();
}
