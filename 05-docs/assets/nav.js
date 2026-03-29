/**
 * ECP Pay — Documentation Site
 * Navigation: marks the active nav item based on the current URL.
 */
(function () {
  'use strict';

  var links = document.querySelectorAll('.sidebar-nav a');
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';

  // Normalize: if URL ends with "/" or is empty, treat as index.html
  if (currentPage === '' || currentPage === 'docs' || currentPage === 'docs/') {
    currentPage = 'index.html';
  }

  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href');
    if (!href) continue;

    var linkPage = href.split('/').pop();

    // Remove any active class first
    links[i].classList.remove('active');

    // Match based on filename
    if (linkPage === currentPage) {
      links[i].classList.add('active');
    }
  }
})();
