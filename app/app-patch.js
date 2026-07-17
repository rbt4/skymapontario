document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-open="about"]')?.addEventListener('click', () => {
    document.getElementById('menu-button')?.click();
  });
});
