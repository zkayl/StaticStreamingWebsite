import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc,
  getDocs,
  collection,
  query,
  limit,
  deleteDoc,
  serverTimestamp,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db } from "./config.js";

const MAIN_CATEGORIES = [
  "Anime",
  "Drama Korea",
  "Drama China",
  "Donghua",
  "Indonesia",
  "Thailand",
  "Movie",
  "Family",
  "Tokusatsu",
];

let allMovies = [];
let filteredMovies = [];
let currentPage = 1;
let itemsPerPage = 25;
let activeMainCategory = null;
let activeSubGenre = null;
let currentUser = null;

const grid = document.getElementById("movie-grid");
const recList = document.getElementById("recommendation-list");
const recSection = document.getElementById("recommendation-section");
const tabsContainer = document.getElementById("category-tabs");
const searchInput = document.getElementById("search-input");
const paginationContainer = document.getElementById("pagination-container");
const recTitle = document.getElementById("rec-title");
const mainListTitle = document.getElementById("main-list-title");

const authModal = document.getElementById("auth-modal");
const profileTrigger = document.getElementById("profile-trigger");
const navbarAvatar = document.getElementById("navbar-avatar");
const navbarLoginText = document.getElementById("navbar-login-text");
const loginIndicator = document.getElementById("login-indicator");
const userDropdown = document.getElementById("user-dropdown");
const dropdownName = document.getElementById("dropdown-name");
const dropdownEmail = document.getElementById("dropdown-email");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const formLogin = document.getElementById("form-login");
const formRegister = document.getElementById("form-register");

document.addEventListener("DOMContentLoaded", () => {
  calculateItemsPerPage();
  showLoadingSkeleton();
  fetchMovies();
  setupSearch();
  setupNavbarEffects();

  enableDragScroll("recommendation-list");
  const tabsInner = document.getElementById("category-tabs");
  if (tabsInner) enableDragScroll(tabsInner.parentElement);

  document.addEventListener("click", (e) => {
    if (
      userDropdown &&
      !userDropdown.contains(e.target) &&
      !profileTrigger.contains(e.target)
    ) {
      userDropdown.classList.remove("show");
    }
  });

  window.addEventListener("resize", calculateItemsPerPage);
});

function createSlug(text) {
  if (!text) return "";
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

window.openPlayer = function (movie) {
  if (!movie || !movie.id) return;
  const titleSlug = createSlug(movie.judul);

  window.location.href = `/watch/${movie.id}/${titleSlug}`;
};

window.goHome = function () {
  window.location.href = "/";
};

async function fetchMovies() {
  try {
    const q = query(collection(db, "movies"));
    const querySnapshot = await getDocs(q);
    const data = [];
    querySnapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() });
    });
    data.sort((a, b) => parseInt(b.id) - parseInt(a.id));
    allMovies = data;
    renderTabsContent();
    applyFilters();
  } catch (error) {
    console.error("Error Fetching Firestore:", error);
    grid.innerHTML = `<div class="col-span-full text-center text-red-500 py-10">Gagal memuat data.<br>Error: ${error.message}</div>`;
  }
}

function calculateItemsPerPage() {
  const width = window.innerWidth;
  let columns = 2;
  if (width >= 1280) columns = 5;
  else if (width >= 1024) columns = 4;
  else if (width >= 768) columns = 3;
  const rows = 5;
  itemsPerPage = columns * rows;
  if (allMovies.length > 0) renderPagination(filteredMovies);
}

function renderPagination(movies) {
  grid.innerHTML = "";
  paginationContainer.innerHTML = "";

  if (movies.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-10">Tidak ada film ditemukan.</div>`;
    return;
  }

  const totalPages = Math.ceil(movies.length / itemsPerPage);
  if (currentPage > totalPages) currentPage = 1;

  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const moviesToShow = movies.slice(start, end);

  moviesToShow.forEach((movie) => {
    const displayType = movie.type ? movie.type.toUpperCase() : "MOVIE";
    const optimizedPoster = getOptimizedImage(movie.poster);

    const card = document.createElement("div");
    card.className =
      "movie-card relative bg-streamDarkGray rounded-md overflow-hidden cursor-pointer group h-full flex flex-col";

    card.onclick = () => window.openPlayer(movie);

    const ratingBadge = `<div class="absolute top-2 right-2 bg-black/70 text-streamRed text-xs font-bold px-2 py-1 rounded border border-streamRed shadow-lg z-10">★ ${movie.rating}</div>`;
    const typeBadge = `<div class="absolute top-2 left-2 bg-streamRed text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg z-10">${displayType}</div>`;

    let episodeLabel = "";
    if (movie.episodes && movie.episodes.length > 0) {
      episodeLabel = `<div class="absolute top-8 left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg z-10">Eps: ${movie.episodes.length}</div>`;
    }

    card.innerHTML = `
        ${ratingBadge} ${typeBadge} ${episodeLabel}
        <div class="relative w-full aspect-[2/3] overflow-hidden">
            <img src="${optimizedPoster}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" loading="lazy" onerror="this.src='https://placehold.co/300x450/333/fff?text=No+Image'">
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <i class="fas fa-play text-2xl text-streamRed drop-shadow-xl transform scale-75 group-hover:scale-110 transition-transform duration-300"></i>
            </div>
        </div>
        <div class="p-3 flex-grow flex flex-col justify-between">
            <div>
                <h3 class="font-bold text-white text-sm md:text-base leading-tight mb-1 truncate">${movie.judul}</h3>
                <p class="text-xs text-gray-400 truncate">${(movie.genre || []).join(", ")}</p>
            </div>
        </div>`;
    grid.appendChild(card);
  });

  if (totalPages > 1) {
    const createBtn = (icon, disabled, onClick) => {
      const btn = document.createElement("button");
      btn.innerHTML = icon;
      btn.className = `w-10 h-10 rounded-full flex items-center justify-center border border-gray-700 ${disabled ? "text-gray-600 cursor-not-allowed" : "text-white hover:bg-gray-800 hover:border-white"}`;
      btn.disabled = disabled;
      btn.onclick = onClick;
      return btn;
    };

    paginationContainer.appendChild(
      createBtn(
        '<i class="fas fa-chevron-left"></i>',
        currentPage === 1,
        () => {
          if (currentPage > 1) {
            currentPage--;
            renderPagination(movies);
            window.scrollTo(0, 0);
          }
        },
      ),
    );

    let pagesToSow = [];
    if (totalPages <= 5) {
      pagesToSow = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
      pagesToSow = [1];
      if (currentPage > 3) pagesToSow.push("...");
      if (currentPage > 2) pagesToSow.push(currentPage - 1);
      if (currentPage !== 1 && currentPage !== totalPages)
        pagesToSow.push(currentPage);
      if (currentPage < totalPages - 1) pagesToSow.push(currentPage + 1);
      if (currentPage < totalPages - 2) pagesToSow.push("...");
      pagesToSow.push(totalPages);
      pagesToSow = [...new Set(pagesToSow)];
    }

    pagesToSow.forEach((p) => {
      const pageBtn = document.createElement("button");
      pageBtn.innerText = p;
      if (p === "...") {
        pageBtn.className = `w-10 h-10 flex items-center justify-center text-gray-500 cursor-default`;
        pageBtn.disabled = true;
      } else {
        pageBtn.className = `w-10 h-10 rounded-full flex items-center justify-center font-bold border transition-all ${currentPage === p ? "bg-streamRed border-streamRed text-white" : "border-gray-700 text-gray-400 hover:text-white hover:border-white"}`;
        pageBtn.onclick = () => {
          currentPage = p;
          renderPagination(movies);
          window.scrollTo(0, 0);
        };
      }
      paginationContainer.appendChild(pageBtn);
    });

    paginationContainer.appendChild(
      createBtn(
        '<i class="fas fa-chevron-right"></i>',
        currentPage === totalPages,
        () => {
          if (currentPage < totalPages) {
            currentPage++;
            renderPagination(movies);
            window.scrollTo(0, 0);
          }
        },
      ),
    );
  }
}

function renderRecommendations(movies) {
  const shuffled = [...movies].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 10);
  recList.innerHTML = "";
  selected.forEach((movie) => {
    const optimizedPoster = getOptimizedImage(movie.poster);
    const card = document.createElement("div");
    card.className =
      "w-[140px] md:w-[160px] flex-shrink-0 relative bg-streamDarkGray rounded-md overflow-hidden cursor-pointer group flex flex-col hover:scale-105 transition-transform duration-300";

    card.onclick = () => window.openPlayer(movie);

    const typeBadge = `<div class="absolute top-1 left-1 bg-streamRed text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow z-10">${movie.type ? movie.type.toUpperCase() : "MOV"}</div>`;
    card.innerHTML = `${typeBadge}<div class="relative w-full aspect-[2/3] overflow-hidden"><img src="${optimizedPoster}" class="w-full h-full object-cover pointer-events-none" loading="lazy" onerror="this.src='https://placehold.co/300x450/333/fff?text=No+Image'"><div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><i class="fas fa-play text-2xl text-streamRed"></i></div></div><div class="p-2"><h3 class="font-bold text-white text-xs leading-tight truncate pointer-events-none">${movie.judul}</h3></div>`;
    recList.appendChild(card);
  });
}

function getOptimizedImage(url) {
  if (!url) return "https://placehold.co/300x450/333/fff?text=No+Image";
  if (url.includes("tmdb.org/t/p/")) return url.replace("/w500/", "/w342/");
  return url;
}

function applyFilters(resetPage = true) {
  let results = allMovies;

  if (activeMainCategory) {
    if (activeMainCategory === "All") {
    } else {
      results = results.filter((m) => {
        const hasGenre = (m.genre || []).some(
          (g) => g.toLowerCase() === activeMainCategory.toLowerCase(),
        );
        const isMovieType =
          activeMainCategory === "Movie" &&
          m.type &&
          m.type.toLowerCase() === "movie";
        return hasGenre || isMovieType;
      });
    }
  }

  if (activeSubGenre) {
    results = results.filter((m) =>
      (m.genre || []).some(
        (g) => g.toLowerCase() === activeSubGenre.toLowerCase(),
      ),
    );
  }

  const keyword = searchInput.value.toLowerCase();
  if (keyword.length > 0) {
    results = results.filter((movie) =>
      movie.judul.toLowerCase().includes(keyword),
    );
    if (recSection) recSection.classList.add("hidden");
    mainListTitle.textContent = `Hasil Pencarian: "${searchInput.value}"`;
  } else {
    if (recSection) recSection.classList.remove("hidden");
    mainListTitle.textContent = activeMainCategory
      ? `Daftar ${activeMainCategory}`
      : "Daftar Film";

    if (activeMainCategory && activeMainCategory !== "All") {
      const recs = allMovies.filter((m) =>
        (m.genre || []).some(
          (g) => g.toLowerCase() === activeMainCategory.toLowerCase(),
        ),
      );
      renderRecommendations(recs);
    } else {
      renderRecommendations(allMovies);
    }
  }

  filteredMovies = results;
  if (resetPage) currentPage = 1;
  renderPagination(filteredMovies);
}

function renderTabsContent() {
  tabsContainer.innerHTML = "";

  const homeBtn = document.createElement("button");
  homeBtn.className = `tab-btn ${activeMainCategory === null ? "active border-streamRed text-streamRed" : ""}`;
  homeBtn.innerHTML = '<i class="fas fa-home"></i> Home';
  homeBtn.onclick = () => {
    activeMainCategory = null;
    activeSubGenre = null;
    searchInput.value = "";
    renderTabsContent();
    applyFilters();
  };
  tabsContainer.appendChild(homeBtn);

  if (activeMainCategory === null) {
    MAIN_CATEGORIES.forEach((cat) => {
      createTabButton(cat, false, () => {
        activeMainCategory = cat;
        renderTabsContent();
        applyFilters();
      });
    });
  } else {
    createTabButton("All", activeSubGenre === null, () => {
      activeSubGenre = null;
      updateTabActiveState();
      applyFilters();
    });

    const subGenres = extractSubGenres(activeMainCategory);
    subGenres.forEach((sub) => {
      createTabButton(sub, activeSubGenre === sub, () => {
        activeSubGenre = sub;
        updateTabActiveState();
        applyFilters();
      });
    });
  }
}

function createTabButton(text, isActive, onClick) {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.className = `tab-btn ${isActive ? "active" : ""}`;
  btn.onclick = onClick;
  tabsContainer.appendChild(btn);
}

function updateTabActiveState() {
  const btns = tabsContainer.querySelectorAll(".tab-btn");
  btns.forEach((btn) => {
    if (btn.innerHTML.includes("Home")) return;
    const text = btn.textContent;
    if ((text === "All" && activeSubGenre === null) || text === activeSubGenre)
      btn.classList.add("active");
    else btn.classList.remove("active");
  });
}

function extractSubGenres(mainCat) {
  const uniqueSubs = new Set();
  const moviesInCat = allMovies.filter((m) =>
    (m.genre || []).some((g) => g.toLowerCase() === mainCat.toLowerCase()),
  );
  moviesInCat.forEach((m) => {
    (m.genre || []).forEach((g) => {
      if (
        g.toLowerCase() !== mainCat.toLowerCase() &&
        !MAIN_CATEGORIES.includes(g)
      ) {
        uniqueSubs.add(g);
      }
    });
  });
  return Array.from(uniqueSubs).sort();
}

function setupNavbarEffects() {
  const navbar = document.getElementById("navbar");
  window.addEventListener("scroll", () => {
    if (window.scrollY > 50) {
      navbar.classList.add("bg-streamBlack", "shadow-lg");
      navbar.classList.remove(
        "bg-gradient-to-b",
        "from-black/90",
        "to-transparent",
        "py-4",
      );
      navbar.classList.add("py-2");
    } else {
      navbar.classList.remove("bg-streamBlack", "shadow-lg", "py-2");
      navbar.classList.add(
        "bg-gradient-to-b",
        "from-black/90",
        "to-transparent",
        "py-4",
      );
    }
  });
}

function showLoadingSkeleton() {
  grid.innerHTML = "";
  for (let i = 0; i < 10; i++) {
    const el = document.createElement("div");
    el.className =
      "animate-pulse bg-streamDarkGray rounded-md overflow-hidden h-full flex flex-col border border-gray-800";
    el.innerHTML = `<div class="w-full aspect-[2/3] bg-gray-800/50"></div><div class="p-3 flex-grow flex flex-col gap-2"><div class="h-4 bg-gray-800 rounded w-3/4"></div><div class="h-3 bg-gray-800 rounded w-1/2"></div></div>`;
    grid.appendChild(el);
  }
}

function setupSearch() {
  searchInput.addEventListener("input", () => applyFilters());
}

function enableDragScroll(elementId) {
  const slider =
    typeof elementId === "string"
      ? document.getElementById(elementId)
      : elementId;
  if (!slider) return;
  let isDown = false;
  let startX;
  let scrollLeft;

  slider.addEventListener("mousedown", (e) => {
    isDown = true;
    slider.classList.add("active");
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });
  slider.addEventListener("mouseleave", () => {
    isDown = false;
  });
  slider.addEventListener("mouseup", () => {
    isDown = false;
  });
  slider.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 2;
    slider.scrollLeft = scrollLeft - walk;
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    navbarAvatar.src =
      user.photoURL ||
      `https://ui-avatars.com/api/?name=${user.displayName}&background=random`;
    navbarLoginText.textContent = "";
    loginIndicator.classList.replace("bg-gray-500", "bg-green-500");
    dropdownName.textContent = user.displayName;
    dropdownEmail.textContent = user.email;
    authModal.classList.add("hidden");
  } else {
    currentUser = null;
    navbarAvatar.src = "https://placehold.co/100x100/333/fff?text=Guest";
    navbarLoginText.textContent = "LOGIN";
    loginIndicator.classList.replace("bg-green-500", "bg-gray-500");
  }
});

window.handleProfileClick = () => {
  currentUser
    ? userDropdown.classList.toggle("show")
    : authModal.classList.remove("hidden");
};
window.closeAuthModal = () => authModal.classList.add("hidden");
window.switchAuthTab = (tab) => {
  if (tab === "login") {
    formLogin.classList.remove("hidden");
    formRegister.classList.add("hidden");
    tabLogin.classList.add("text-streamRed", "border-streamRed");
    tabRegister.classList.remove("text-streamRed", "border-streamRed");
  } else {
    formLogin.classList.add("hidden");
    formRegister.classList.remove("hidden");
    tabRegister.classList.add("text-streamRed", "border-streamRed");
    tabLogin.classList.remove("text-streamRed", "border-streamRed");
  }
};
window.loginWithGoogle = async () => {
  const p = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, p);
  } catch (e) {
    alert(e.message);
  }
};
window.logout = async () => {
  await signOut(auth);
  window.location.reload();
};
window.handleEmailLogin = async (e) => {
  e.preventDefault();
  try {
    await signInWithEmailAndPassword(
      auth,
      e.target.email.value,
      e.target.password.value,
    );
  } catch (err) {
    alert(err.message);
  }
};

(function () {
  const blockEvent = (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  document.addEventListener("contextmenu", blockEvent);
  document.addEventListener("selectstart", blockEvent);
  document.addEventListener("dragstart", blockEvent);

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "F12" ||
      (e.ctrlKey &&
        e.shiftKey &&
        ["I", "J", "C"].includes(e.key.toUpperCase())) ||
      (e.ctrlKey &&
        ["U", "S", "A", "C", "V", "X", "P", "I"].includes(e.key.toUpperCase()))
    ) {
      blockEvent(e);
    }
  });

  ["copy", "cut", "paste"].forEach((ev) => {
    document.addEventListener(ev, blockEvent);
  });
})();
