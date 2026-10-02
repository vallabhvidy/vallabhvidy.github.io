// Theme and Palette Manager: persists in localStorage, defaults to dark & catppuccin.
(function () {
  const mode = localStorage.getItem('theme') || 'dark';
  const palette = localStorage.getItem('theme-palette') || 'catppuccin';

  if (mode === 'light') {
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
  }
  document.documentElement.setAttribute('data-theme', palette);
  document.documentElement.setAttribute('data-mode', mode);
})();

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');
  const newMode = isDark ? 'light' : 'dark';

  if (isDark) {
    html.classList.remove('dark');
  } else {
    html.classList.add('dark');
  }
  html.setAttribute('data-mode', newMode);
  localStorage.setItem('theme', newMode);

  syncThemeUI();
}

function changeThemePalette(palette) {
  document.documentElement.setAttribute('data-theme', palette);
  localStorage.setItem('theme-palette', palette);
}

function syncThemeUI() {
  const isDark = document.documentElement.classList.contains('dark');
  const sunIcon = document.getElementById('icon-sun');
  const moonIcon = document.getElementById('icon-moon');
  if (sunIcon && moonIcon) {
    if (isDark) {
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
    } else {
      sunIcon.classList.remove('hidden');
      moonIcon.classList.add('hidden');
    }
  }

  const selector = document.getElementById('theme-selector');
  if (selector) {
    const currentPalette = document.documentElement.getAttribute('data-theme') || 'catppuccin';
    selector.value = currentPalette;
  }
}

document.addEventListener('DOMContentLoaded', syncThemeUI);

// Mobile Navigation Toggle
function toggleMobileNav() {
  var navLinks = document.querySelector('.nav-links');
  if (navLinks) {
    navLinks.classList.toggle('open');
  }
}

document.addEventListener('DOMContentLoaded', function () {
  // Close mobile nav when a link is clicked
  var navLinks = document.querySelector('.nav-links');
  if (navLinks) {
    var links = navLinks.querySelectorAll('.nav-link');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function () {
        navLinks.classList.remove('open');
      });
    }
  }

  // Close mobile nav when clicking outside
  document.addEventListener('click', function (e) {
    var navLinks = document.querySelector('.nav-links');
    var hamburger = document.querySelector('.nav-hamburger');
    if (navLinks && hamburger && navLinks.classList.contains('open')) {
      if (!navLinks.contains(e.target) && !hamburger.contains(e.target)) {
        navLinks.classList.remove('open');
      }
    }
  });
});
