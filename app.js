/* =============================================
   Muestra de Fotografía · FDA — app.js
   SPA Router, Carousels, Search, Lightbox
   ============================================= */

;(function () {
  'use strict';

  /* ---- State ---- */
  let data = null;
  let carouselTimers = {};     // { projectSlug: intervalId }
  let carouselIndexes = {};    // { projectSlug: currentIndex }
  let currentProject = null;
  let currentPhotoIndex = 0;
  let isZoomed = false;
  let isSearchOpen = false;

  /* ---- DOM refs ---- */
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

  const homeGrid = $('#homeGrid');
  const projectContent = $('#projectContent');
  const searchOverlay = $('#searchOverlay');
  const searchInput = $('#searchInput');
  const searchResults = $('#searchResults');
  const menuBtn = $('#menuBtn');
  const photoViewer = $('#photoViewer');
  const pvImg = $('#pvImg');
  const pvIndex = $('#pvIndex');
  const pvCaption = $('#pvCaption');
  const pvClose = $('#pvClose');
  const pvPrev = $('#pvPrev');
  const pvNext = $('#pvNext');
  const pvImageContainer = $('#pvImageContainer');

  /* ---- Init ---- */
  fetch('data.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(d => { data = d; init(); })
    .catch(e => { homeGrid.innerHTML = `<p style="padding:40px;color:#999;">Error cargando datos: ${e.message}</p>`; });

  function init() {
    renderHome();
    setupRouter();
    setupSearch();
    setupPhotoViewer();
    handleHash();
  }

  /* =============================================
     ROUTER (hash-based)
     ============================================= */
  function setupRouter() {
    window.addEventListener('hashchange', handleHash);
  }

  function handleHash() {
    const hash = window.location.hash.slice(1) || 'home';

    // Parse #photo/slug/n
    const photoMatch = hash.match(/^photo\/([^/]+)\/(\d+)$/);
    if (photoMatch) {
      const slug = photoMatch[1];
      const idx = parseInt(photoMatch[2], 10);
      showPhotoViewer(slug, idx);
      return;
    }

    // Parse #project/slug
    const projectMatch = hash.match(/^project\/(.+)$/);
    if (projectMatch) {
      showProject(projectMatch[1]);
      return;
    }

    // Default: home
    showHome();
  }

  function navigate(hash) {
    if (window.location.hash.slice(1) !== hash) {
      window.location.hash = hash;
    } else {
      handleHash();
    }
  }

  /* ---- View switching ---- */
  function showView(viewId) {
    $$('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(viewId);
    if (el) el.classList.add('active');
    closeSearch();
    closePhotoViewer();
  }

  /* =============================================
     HOME
     ============================================= */
  function showHome() {
    showView('view-home');
    stopAllCarousels();
    renderHome();
  }

  function renderHome() {
    if (!data) return;
    homeGrid.innerHTML = '';

    data.photographers.forEach((p, i) => {
      const item = document.createElement('div');
      item.className = 'carousel-item';
      item.dataset.slug = p.projectSlug;

      // Fixed non-uniform heights for masonry
      const heights = [240, 320, 400, 480, 560];
      const h = heights[i % heights.length];
      item.style.height = h + 'px';

      // First photo or placeholder
      const img = document.createElement('img');
      img.src = p.photos.length > 0 ? p.photos[0].file : '';
      img.alt = p.projectName;
      img.dataset.index = 0;
      img.loading = 'lazy';
      img.addEventListener('error', function () {
        this.style.background = '#eee';
        this.style.minHeight = '200px';
      });
      item.appendChild(img);

      // Overlay
      const overlay = document.createElement('div');
      overlay.className = 'carousel-overlay';
      overlay.innerHTML = `
        <div class="dark-bg">
        <div class="photographer-name">${escapeHtml(p.name)}</div>
        <div class="project-name">${escapeHtml(p.projectName)}</div>
        <div class="photo-count">${p.photos.length} fotografías</div>
        </div>
      `;
      item.appendChild(overlay);

      // Click → project
      item.addEventListener('click', () => {
        navigate('project/' + p.projectSlug);
      });

      // Hover (desktop)
      item.addEventListener('mouseenter', () => {
        const grid = homeGrid;
        grid.classList.add('dimmed');
        $$('.carousel-item', grid).forEach(el => el.classList.remove('hovered'));
        item.classList.add('hovered');
      });

      item.addEventListener('mouseleave', () => {
        const grid = homeGrid;
        grid.classList.remove('dimmed');
        $$('.carousel-item', grid).forEach(el => el.classList.remove('hovered'));
      });

      // Touch: tap overlay → navigate, tap image → no action (carousel)
      item.addEventListener('touchend', (e) => {
        // Let click handle it
      });

      homeGrid.appendChild(item);
    });

    // Start carousels after render
    setTimeout(startAllCarousels, 100);
  }

  /* ---- Carousels ---- */
  function startAllCarousels() {
    // No carousel on mobile
    if (window.innerWidth < 768) return;
    stopAllCarousels();
    const items = $$('.carousel-item');
    items.forEach((item, i) => {
      const slug = item.dataset.slug;
      const p = data.photographers.find(x => x.projectSlug === slug);
      if (!p || p.photos.length <= 1) return;

      carouselIndexes[slug] = 0;
      // Random interval between 3-8 seconds
      const interval = 3000 + Math.random() * 5000;
      carouselTimers[slug] = setInterval(() => {
        advanceCarousel(slug);
      }, interval);
    });
  }

  function stopAllCarousels() {
    Object.keys(carouselTimers).forEach(slug => {
      clearInterval(carouselTimers[slug]);
    });
    carouselTimers = {};
    carouselIndexes = {};
  }

  function advanceCarousel(slug) {
    const p = data.photographers.find(x => x.projectSlug === slug);
    if (!p || p.photos.length <= 1) return;

    const items = $$('.carousel-item');
    const item = items.find(el => el.dataset.slug === slug);
    if (!item) return;

    const idx = (carouselIndexes[slug] + 1) % p.photos.length;
    carouselIndexes[slug] = idx;

    const img = item.querySelector('img');
    img.style.opacity = '0';
    setTimeout(() => {
      img.src = p.photos[idx].file;
      img.dataset.index = idx;
      img.style.opacity = '1';
    }, 300);
    img.style.transition = 'opacity 0.3s ease';
  }

  /* =============================================
     SEARCH OVERLAY
     ============================================= */
  function setupSearch() {
    menuBtn.addEventListener('click', toggleSearch);

    // Debounced search
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderSearchResults, 150);
    });

    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) closeSearch();
    });
    // Keyboard: Escape to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchOverlay.classList.contains('open')) closeSearch();
    });
  }

  function toggleSearch() {
    if (searchOverlay.classList.contains('open')) { closeSearch(); }
    else { openSearch(); }
  }

  function openSearch() {
    isSearchOpen = true;
    searchOverlay.classList.add('open');
    searchInput.value = '';
    renderSearchResults();
    setTimeout(() => searchInput.focus(), 100);
  }

  function closeSearch() {
    isSearchOpen = false;
    searchOverlay.classList.remove('open');
  }

  function renderSearchResults() {
    if (!data) return;
    const q = searchInput.value.toLowerCase().trim();
    const filtered = q
      ? data.photographers.filter(p =>
          p.name.toLowerCase().includes(q) ||
          p.projectName.toLowerCase().includes(q)
        )
      : data.photographers;

    searchResults.innerHTML = '';

    filtered.forEach(p => {
      const item = document.createElement('div');
      item.className = 'search-item';

      const coverSrc = p.photos.length > 0 ? p.photos[0].file : '';

      // Preview image (shown on hover)
      if (coverSrc) {
        const preview = document.createElement('img');
        preview.className = 'search-preview';
        preview.src = coverSrc;
        preview.alt = '';
        item.appendChild(preview);
      }

      // Avatar / placeholder
      const avatar = document.createElement('img');
      avatar.className = 'search-avatar';
      avatar.src = coverSrc;
      avatar.alt = '';
      avatar.loading = 'lazy';
      item.appendChild(avatar);

      // Info
      const info = document.createElement('div');
      info.className = 'search-info';
      info.innerHTML = `
        <div class="sn">${escapeHtml(p.name)}</div>
        <div class="sp">${escapeHtml(p.projectName)}</div>
      `;
      item.appendChild(info);

      item.addEventListener('click', () => {
        closeSearch();
        navigate('project/' + p.projectSlug);
      });

      searchResults.appendChild(item);
    });

    if (filtered.length === 0) {
      searchResults.innerHTML = '<div style="padding:24px 16px;color:#999;">Sin resultados</div>';
    }
  }

  /* =============================================
     PROJECT PAGE
     ============================================= */
  function showProject(slug) {
    closePhotoViewer();
    window.scrollTo(0, 0);
    const p = data.photographers.find(x => x.projectSlug === slug);
    if (!p) { navigate('home'); return; }

    currentProject = p;
    showView('view-project');

    projectContent.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'project-header';
    header.innerHTML = `
      <h1>${escapeHtml(p.projectName)}</h1>
      <div class="byline">${escapeHtml(p.name)}</div>
    `;
    projectContent.appendChild(header);

    // Section 1: Photos
    if (p.photos.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'project-section';
      sec.innerHTML = '<h2>Fotografías</h2>';
      const grid = document.createElement('div');
      grid.className = 'project-photos';
      p.photos.forEach((photo, i) => {
        const thumb = document.createElement('div');
        thumb.className = 'photo-thumb';
        const img = document.createElement('img');
        img.src = photo.file;
        img.alt = photo.caption || '';
        img.loading = 'lazy';
        img.addEventListener('error', function () {
          this.style.background = '#eee';
          this.style.minHeight = '120px';
        });
        thumb.appendChild(img);
        thumb.addEventListener('click', () => {
          navigate('photo/' + slug + '/' + i);
        });
        grid.appendChild(thumb);
      });
      sec.appendChild(grid);
      projectContent.appendChild(sec);
    }

    // Section 2: Text
    if (p.description) {
      const sec = document.createElement('div');
      sec.className = 'project-section';
      sec.innerHTML = '<h2>Texto</h2>';
      const textDiv = document.createElement('div');
      textDiv.className = 'project-text';
      textDiv.innerHTML = p.description;
      sec.appendChild(textDiv);
      projectContent.appendChild(sec);
    }

    // Section 3: Contact
    const sec = document.createElement('div');
    sec.className = 'project-section';
    sec.innerHTML = '<h2>Contacto</h2>';
    const card = document.createElement('div');
    card.className = 'contact-card';

    const avatarImg = document.createElement('img');
    if (p.avatar) {
      avatarImg.className = 'contact-avatar';
      avatarImg.src = p.avatar;
    } else {
      avatarImg.className = 'contact-avatar placeholder';
      avatarImg.textContent = p.name.charAt(0);
      avatarImg.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:32px;color:#ccc;background:#f0f0f0;';
    }
    card.appendChild(avatarImg);

    const info = document.createElement('div');
    info.className = 'contact-info';
    let infoHtml = `<h3>${escapeHtml(p.name)}</h3>`;
    if (p.email) infoHtml += `<a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>`;
    if (p.instagram) infoHtml += `<a href="${escapeHtml(p.instagram)}" target="_blank" rel="noopener">Instagram</a>`;
    info.innerHTML = infoHtml;
    card.appendChild(info);

    sec.appendChild(card);
    projectContent.appendChild(sec);
  }

  /* =============================================
     PHOTO VIEWER
     ============================================= */
  function setupPhotoViewer() {
    pvClose.addEventListener('click', closePhotoViewer);
    pvPrev.addEventListener('click', prevPhoto);
    pvNext.addEventListener('click', nextPhoto);

    // Zoom toggle
    pvImageContainer.addEventListener('click', toggleZoom);

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (!photoViewer.classList.contains('open')) return;
      switch (e.key) {
        case 'Escape': closePhotoViewer(); e.preventDefault(); break;
        case 'ArrowUp': case 'ArrowLeft': prevPhoto(); e.preventDefault(); break;
        case 'ArrowDown': case 'ArrowRight': nextPhoto(); e.preventDefault(); break;
        case '+': case '=': toggleZoom(); e.preventDefault(); break;
      }
    });
  }

  function showPhotoViewer(slug, idx) {
    const p = data.photographers.find(x => x.projectSlug === slug);
    if (!p || !p.photos[idx]) { navigate('project/' + slug); return; }

    currentProject = p;
    currentPhotoIndex = idx;
    isZoomed = false;

    updatePhotoViewer();
    photoViewer.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closePhotoViewer() {
    photoViewer.classList.remove('open');
    isZoomed = false;
    pvImageContainer.classList.remove('zoomed');
    document.body.style.overflow = '';
  }

  function updatePhotoViewer() {
    if (!currentProject) return;
    const photos = currentProject.photos;
    const photo = photos[currentPhotoIndex];

    pvImg.src = photo.file;
    pvImg.alt = photo.caption || '';
    pvImg.onerror = function () {
      this.style.background = '#333';
      this.style.minHeight = '300px';
      this.style.minWidth = '300px';
    };
    pvIndex.textContent = (currentPhotoIndex + 1) + ' / ' + photos.length;
    pvCaption.textContent = photo.caption || '';

    pvPrev.disabled = currentPhotoIndex === 0;
    pvNext.disabled = currentPhotoIndex === photos.length - 1;

    // Reset zoom
    isZoomed = false;
    pvImageContainer.classList.remove('zoomed');
    pvImg.style.transform = '';
  }

  function prevPhoto() {
    if (!currentProject || currentPhotoIndex <= 0) return;
    currentPhotoIndex--;
    updatePhotoViewer();
    window.location.hash = 'photo/' + currentProject.projectSlug + '/' + currentPhotoIndex;
  }

  function nextPhoto() {
    if (!currentProject || currentPhotoIndex >= currentProject.photos.length - 1) return;
    currentPhotoIndex++;
    updatePhotoViewer();
    window.location.hash = 'photo/' + currentProject.projectSlug + '/' + currentPhotoIndex;
  }

  function toggleZoom() {
    isZoomed = !isZoomed;
    pvImageContainer.classList.toggle('zoomed', isZoomed);
  }

  /* =============================================
     UTILITIES
     ============================================= */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
