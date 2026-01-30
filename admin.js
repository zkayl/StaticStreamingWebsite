import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDocs,
  getDoc,
  collection,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db } from "./config.js";

let allMoviesData = [];
let pendingDeleteId = null;
let rawSitemapXML = "";
let rawExportJSON = "";

let currentPage = 1;
const itemsPerPage = 10;

const DEFAULT_EMBED_URL =
  "https://lookerstudio.google.com/embed/reporting/bebe5464-a966-4f3e-8e6c-ac0d7f45ec60/page/VEvmF";

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const adminEmail = user.email.toLowerCase();
      const adminRef = doc(db, "admins", adminEmail);
      const adminSnap = await getDoc(adminRef);

      if (adminSnap.exists()) {
        document.getElementById("login-screen").classList.add("hidden");
        document.getElementById("dashboard").classList.remove("hidden");
        loadMovies();
        loadSavedGAEmbed();
        switchTab("list");
        showToast(`Login sebagai ${user.email}`, "green");
      } else {
        await signOut(auth);
        alert("AKSES DITOLAK: Email tidak terdaftar di whitelist.");
        window.location.reload();
      }
    } catch (error) {
      console.error(error);
      await signOut(auth);
      alert("Error verifikasi admin: " + error.message);
    }
  } else {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("dashboard").classList.add("hidden");
  }
});

window.handleAdminLogin = async (e) => {
  e.preventDefault();
  const email = document.getElementById("admin-email").value;
  const pass = document.getElementById("admin-pass").value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    showToast("Login Gagal: " + err.message, "red");
  }
};

window.logoutAdmin = async () => {
  await signOut(auth);
  window.location.reload();
};

function calculateAndRenderStats(movies) {
  document.getElementById("stat-total-movies").textContent = movies.length;
  let totalEps = 0;
  let totalViews = 0;
  movies.forEach((m) => {
    if (m.views) totalViews += parseInt(m.views);
    if (m.type === "series" && m.episodes) {
      totalEps += m.episodes.length;
    } else {
      totalEps += 1;
    }
  });
  document.getElementById("stat-total-eps").textContent = totalEps;
  document.getElementById("stat-total-views").textContent =
    totalViews.toLocaleString();

  const sortedByViews = [...movies].sort(
    (a, b) => (b.views || 0) - (a.views || 0),
  );
  const top5 = sortedByViews.slice(0, 5);
  const topListContainer = document.getElementById("top-movies-list");
  topListContainer.innerHTML = "";

  top5.forEach((m, idx) => {
    const views = m.views ? m.views.toLocaleString() : 0;
    const el = document.createElement("div");
    el.className =
      "flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-gray-700";
    el.innerHTML = `
            <div class="font-bold text-lg text-gray-500 w-6">#${idx + 1}</div>
            <div class="flex-1 truncate">
                <h4 class="font-bold text-sm text-white truncate">${m.judul}</h4>
                <p class="text-xs text-gray-400">${m.type}</p>
            </div>
            <div class="text-right">
                <div class="text-streamRed font-bold text-sm">${views}</div>
                <div class="text-[10px] text-gray-500">Views</div>
            </div>
        `;
    topListContainer.appendChild(el);
  });
}

window.setEmbedCode = () => {
  const currentUrl = localStorage.getItem("ga_embed_url") || DEFAULT_EMBED_URL;
  const url = prompt(
    "Masukkan Embed URL dari Looker Studio / Google Analytics:",
    currentUrl,
  );
  if (url) {
    localStorage.setItem("ga_embed_url", url);
    loadSavedGAEmbed();
  }
};

function loadSavedGAEmbed() {
  const url = localStorage.getItem("ga_embed_url") || DEFAULT_EMBED_URL;
  const container = document.getElementById("ga-container");
  if (url && container) {
    container.innerHTML = `
            <iframe src="${url}" frameborder="0" style="border:0" allowfullscreen class="w-full h-full absolute inset-0"></iframe>
            <button onclick="setEmbedCode()" class="absolute top-2 right-2 bg-gray-800 text-xs px-2 py-1 rounded opacity-50 hover:opacity-100 z-10">Ubah URL</button>
        `;
  }
}

window.openTutorialModal = () =>
  document.getElementById("tutorial-modal").classList.remove("hidden");
window.closeTutorialModal = () =>
  document.getElementById("tutorial-modal").classList.add("hidden");

async function loadMovies() {
  const tbody = document.getElementById("movie-table-body");
  tbody.innerHTML =
    '<tr><td colspan="6" class="text-center py-4 text-gray-500">Loading data...</td></tr>';
  try {
    const snap = await getDocs(collection(db, "movies"));
    allMoviesData = [];
    snap.forEach((doc) => allMoviesData.push({ id: doc.id, ...doc.data() }));
    allMoviesData.sort((a, b) => parseInt(b.id) - parseInt(a.id));
    const countSpan = document.getElementById("total-movies-count");
    if (countSpan) countSpan.textContent = allMoviesData.length;
    calculateAndRenderStats(allMoviesData);
    currentPage = 1;
    renderTable(allMoviesData);
  } catch (e) {
    showToast("Gagal load data: " + e.message, "red");
  }
}

function renderTable(data) {
  const tbody = document.getElementById("movie-table-body");
  tbody.innerHTML = "";

  if (data.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center py-4 text-gray-500">Belum ada data.</td></tr>';
    renderPagination(0, []);
    return;
  }

  const totalItems = data.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (currentPage > totalPages) currentPage = 1;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedItems = data.slice(start, end);

  paginatedItems.forEach((movie) => {
    const tr = document.createElement("tr");
    tr.className =
      "hover:bg-white/5 transition border-b border-gray-800 last:border-0";
    tr.innerHTML = `
            <td class="px-6 py-4 font-mono text-xs text-gray-500">#${movie.id}</td>
            <td class="px-6 py-4"><img src="${movie.poster}" class="w-8 h-12 object-cover rounded bg-gray-800" onerror="this.src='https://placehold.co/40x60?text=No+Img'"></td>
            <td class="px-6 py-4 font-bold truncate max-w-xs">${movie.judul}</td>
            <td class="px-6 py-4 uppercase text-xs font-bold text-blue-400">${movie.type || "Movie"}</td>
            <td class="px-6 py-4 text-xs text-gray-400">${movie.status || "-"}</td>
            <td class="px-6 py-4 text-right">
                <button onclick="editMovie('${movie.id}')" class="text-blue-400 hover:text-white mr-3"><i class="fas fa-edit"></i></button>
                <button onclick="openDeleteModal('${movie.id}')" class="text-red-500 hover:text-white"><i class="fas fa-trash"></i></button>
            </td>
        `;
    tbody.appendChild(tr);
  });

  renderPagination(totalItems, data);
}

function renderPagination(totalItems, currentDataList) {
  const container = document.getElementById("admin-pagination");
  container.innerHTML = "";
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return;

  const createBtn = (text, isDisabled, onClick, isActive = false) => {
    const btn = document.createElement("button");
    btn.innerHTML = text;
    let classes =
      "w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold border transition-all ";
    if (isActive) classes += "bg-streamRed border-streamRed text-white";
    else if (isDisabled)
      classes += "border-gray-800 text-gray-600 cursor-not-allowed";
    else
      classes +=
        "border-gray-700 text-gray-400 hover:border-white hover:text-white hover:bg-gray-800";
    btn.className = classes;
    btn.disabled = isDisabled;
    if (!isDisabled) btn.onclick = onClick;
    return btn;
  };

  container.appendChild(
    createBtn('<i class="fas fa-chevron-left"></i>', currentPage === 1, () => {
      currentPage--;
      renderTable(currentDataList);
    }),
  );

  let pages = [];
  if (totalPages <= 7) {
    pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else {
    pages = [1];
    if (currentPage > 3) pages.push("...");
    if (currentPage > 2) pages.push(currentPage - 1);
    if (currentPage !== 1 && currentPage !== totalPages)
      pages.push(currentPage);
    if (currentPage < totalPages - 1) pages.push(currentPage + 1);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    pages = [...new Set(pages)];
  }

  pages.forEach((p) => {
    if (p === "...") {
      const span = document.createElement("span");
      span.textContent = "...";
      span.className = "text-gray-600 px-1";
      container.appendChild(span);
    } else {
      container.appendChild(
        createBtn(
          p,
          false,
          () => {
            currentPage = p;
            renderTable(currentDataList);
          },
          currentPage === p,
        ),
      );
    }
  });

  container.appendChild(
    createBtn(
      '<i class="fas fa-chevron-right"></i>',
      currentPage === totalPages,
      () => {
        currentPage++;
        renderTable(currentDataList);
      },
    ),
  );
}

window.addEpisodeInput = (titleVal = "", embedVal = "") => {
  const container = document.getElementById("episode-list-input");
  if (!titleVal) {
    const currentCount = container.querySelectorAll(".ep-item").length;
    titleVal = `Episode ${currentCount + 1}`;
  }
  const div = document.createElement("div");
  div.className =
    "ep-item flex gap-2 items-center bg-black/20 p-2 rounded border border-gray-700 animate-fade-in";
  div.innerHTML = `<input type="text" placeholder="Judul Eps" class="inp-ep-title bg-black/50 border border-gray-600 rounded px-2 py-1 text-sm w-1/3 text-white outline-none"><input type="text" placeholder="Embed URL" class="inp-ep-embed bg-black/50 border border-gray-600 rounded px-2 py-1 text-sm flex-1 text-white outline-none"><button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-white px-2"><i class="fas fa-times"></i></button>`;
  div.querySelector(".inp-ep-title").value = titleVal;
  div.querySelector(".inp-ep-embed").value = embedVal;
  container.appendChild(div);
};

window.addCastInput = (name = "", role = "", img = "") => {
  const container = document.getElementById("cast-list-input");
  const div = document.createElement("div");
  div.className =
    "cast-item grid grid-cols-3 gap-2 bg-black/20 p-2 rounded border border-gray-700 relative pr-8 animate-fade-in";
  div.innerHTML = `<input type="text" placeholder="Nama" class="inp-cast-name bg-black/50 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none w-full"><input type="text" placeholder="Role" class="inp-cast-role bg-black/50 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none w-full"><input type="text" placeholder="Img URL" class="inp-cast-img bg-black/50 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none w-full"><button type="button" onclick="this.parentElement.remove()" class="absolute right-1 top-2 text-red-500 hover:text-white"><i class="fas fa-times"></i></button>`;
  div.querySelector(".inp-cast-name").value = name;
  div.querySelector(".inp-cast-role").value = role;
  div.querySelector(".inp-cast-img").value = img;
  container.appendChild(div);
};

window.addDownloadInput = (label = "", url = "") => {
  const container = document.getElementById("download-list-input");
  const div = document.createElement("div");
  div.className =
    "dl-item flex gap-2 items-center bg-black/20 p-2 rounded border border-gray-700 animate-fade-in";
  div.innerHTML = `<input type="text" placeholder="Label" class="inp-dl-label w-1/3 bg-black/50 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none"><input type="text" placeholder="URL Link" class="inp-dl-url flex-1 bg-black/50 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none"><button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-white px-1"><i class="fas fa-times"></i></button>`;
  div.querySelector(".inp-dl-label").value = label;
  div.querySelector(".inp-dl-url").value = url;
  container.appendChild(div);
};

window.toggleTypeFields = () => {
  const type = document.getElementById("inp-type").value;
  if (type === "movie") {
    document.getElementById("section-movie-source").classList.remove("hidden");
    document.getElementById("section-series-source").classList.add("hidden");
  } else {
    document.getElementById("section-movie-source").classList.add("hidden");
    document.getElementById("section-series-source").classList.remove("hidden");
  }
};

window.switchTab = (tab) => {
  document.getElementById("view-list").classList.add("hidden");
  document.getElementById("view-add").classList.add("hidden");
  document.getElementById("view-sitemap").classList.add("hidden");
  document.getElementById("view-dashboard").classList.add("hidden");

  if (tab === "list")
    document.getElementById("view-list").classList.remove("hidden");
  else if (tab === "add")
    document.getElementById("view-add").classList.remove("hidden");
  else if (tab === "sitemap")
    document.getElementById("view-sitemap").classList.remove("hidden");
  else if (tab === "dashboard")
    document.getElementById("view-dashboard").classList.remove("hidden");

  updateSidebarActiveState(tab);
};

function updateSidebarActiveState(activeTab) {
  const map = {
    list: "nav-list",
    dashboard: "nav-dashboard",
    add: "nav-add",
    sitemap: "nav-sitemap",
  };

  document.querySelectorAll(".nav-dot").forEach((el) => el.remove());

  const activeBtn = document.getElementById(map[activeTab]);
  if (activeBtn) {
    const dot = document.createElement("div");
    dot.className =
      "w-2.5 h-2.5 bg-green-500 rounded-full ml-auto nav-dot shadow-[0_0_10px_#22c55e]";
    activeBtn.appendChild(dot);
  }
}

window.resetForm = () => {
  document.getElementById("form-title").textContent = "Tambah Film Baru";
  const form = document.getElementById("form-movie");
  if (form) form.reset();
  document.getElementById("inp-id").value = "";
  document.getElementById("episode-list-input").innerHTML = "";
  document.getElementById("cast-list-input").innerHTML = "";
  document.getElementById("download-list-input").innerHTML = "";
  addCastInput();
  addDownloadInput();
  toggleTypeFields();
};

function getMovieDataFromForm() {
  const idInput = document.getElementById("inp-id").value;
  const id = idInput ? idInput : Date.now().toString();
  const type = document.getElementById("inp-type").value;

  const castInputs = document.querySelectorAll(".cast-item");
  const castArray = [];
  castInputs.forEach((div) => {
    const name = div.querySelector(".inp-cast-name").value;
    if (name) {
      castArray.push({
        name: name,
        role: div.querySelector(".inp-cast-role").value || "Actor",
        img: div.querySelector(".inp-cast-img").value || "",
      });
    }
  });

  const downloadInputs = document.querySelectorAll(".dl-item");
  const downloadsObj = {};
  downloadInputs.forEach((div) => {
    const label = div.querySelector(".inp-dl-label").value;
    const url = div.querySelector(".inp-dl-url").value;
    if (label && url) downloadsObj[label] = url;
  });

  const movieData = {
    id: parseInt(id),
    judul: document.getElementById("inp-judul").value,
    poster: document.getElementById("inp-poster").value,
    type: type,
    rating: document.getElementById("inp-rating").value,
    status: document.getElementById("inp-status").value,
    rilis: document.getElementById("inp-rilis").value,
    durasi: document.getElementById("inp-durasi").value,
    total_eps: document.getElementById("inp-total-eps").value,
    deskripsi: document.getElementById("inp-desc").value,
    genre: document
      .getElementById("inp-genre")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    cast: castArray,
    downloads: Object.keys(downloadsObj).length > 0 ? downloadsObj : null,
    lastUpdated: new Date().toISOString(),
  };

  if (type === "movie") {
    movieData.sources = { embed: document.getElementById("inp-embed").value };
    movieData.episodes = null;
  } else {
    const epInputs = document.querySelectorAll(".ep-item");
    const episodes = [];
    epInputs.forEach((div) => {
      episodes.push({
        title: div.querySelector(".inp-ep-title").value,
        sources: { embed: div.querySelector(".inp-ep-embed").value },
      });
    });
    movieData.episodes = episodes;
    movieData.sources = null;
  }
  return movieData;
}

window.openExportModal = () => {
  try {
    const data = getMovieDataFromForm();
    if (!data.judul) {
      showToast("Isi data film dulu sebelum export!", "red");
      return;
    }
    const jsonStr = JSON.stringify(data, null, 2);
    rawExportJSON = jsonStr;
    document.getElementById("export-modal").classList.remove("hidden");
    renderExportHighlight(jsonStr);
  } catch (e) {
    showToast("Error Export: " + e.message, "red");
  }
};
window.closeExportModal = () =>
  document.getElementById("export-modal").classList.add("hidden");
window.copyExportJSON = () => {
  if (!rawExportJSON) return;
  navigator.clipboard.writeText(rawExportJSON).then(() => {
    showToast("JSON disalin!", "green");
  });
};
window.downloadExportJSON = () => {
  if (!rawExportJSON) return;
  const blob = new Blob([rawExportJSON], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const data = JSON.parse(rawExportJSON);
  a.download = `${data.judul.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("File JSON didownload!", "green");
};

function renderExportHighlight(json) {
  const codeBlock = document.getElementById("export-code");
  const lineNumbers = document.getElementById("export-lines");
  let safeCode = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  safeCode = safeCode.replace(
    /"(\w+)":/g,
    '<span class="json-key">"$1"</span>:',
  );
  safeCode = safeCode.replace(
    /: "([^"]*)"/g,
    ': <span class="json-string">"$1"</span>',
  );
  safeCode = safeCode.replace(/: (\d+)/g, ': <span class="json-num">$1</span>');
  codeBlock.innerHTML = safeCode;
  const lines = json.split("\n").length;
  let linesHTML = "";
  for (let i = 1; i <= lines; i++) linesHTML += `${i}<br>`;
  lineNumbers.innerHTML = linesHTML;
}

window.openImportModal = () => {
  document.getElementById("import-modal").classList.remove("hidden");
  document.getElementById("import-json-area").value = "";
  document.getElementById("import-json-area").focus();
};
window.closeImportModal = () =>
  document.getElementById("import-modal").classList.add("hidden");
window.handleJsonImport = async () => {
  const jsonStr = document.getElementById("import-json-area").value;
  if (!jsonStr.trim()) {
    showToast("Paste kode JSON dulu!", "red");
    return;
  }
  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    try {
      data = JSON.parse(`[${jsonStr}]`);
    } catch (e2) {
      alert("Format JSON Error: " + e.message);
      return;
    }
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      alert("JSON kosong.");
      return;
    }
    if (data.length === 1) {
      fillFormWithData(data[0]);
      showToast("Data dimuat ke form", "green");
      closeImportModal();
    } else {
      if (
        !confirm(
          `Terdeteksi ${data.length} film dalam JSON. Apakah Anda ingin menyimpan semuanya langsung ke database?`,
        )
      )
        return;
      showToast("Sedang memproses bulk import...", "blue");
      let successCount = 0;
      const batchPromises = data.map(async (movie, index) => {
        try {
          const id = movie.id
            ? String(movie.id)
            : (Date.now() + index).toString();
          const movieData = {
            id: parseInt(id),
            judul: movie.judul || "",
            poster: movie.poster || "",
            rating: movie.rating || "",
            deskripsi: movie.deskripsi || "",
            type: (movie.type || "movie").toLowerCase(),
            rilis: movie.rilis || "",
            status: movie.status || "Ongoing",
            total_eps: movie.total_eps || "",
            durasi: movie.durasi || "",
            genre: Array.isArray(movie.genre)
              ? movie.genre
              : movie.genre
                ? movie.genre.split(",").map((s) => s.trim())
                : [],
            cast: movie.cast || [],
            downloads: movie.downloads || null,
            lastUpdated: new Date().toISOString(),
          };
          if (movieData.type === "series") {
            if (movie.episodes && Array.isArray(movie.episodes)) {
              movieData.episodes = movie.episodes.map((ep) => ({
                title: ep.title || "",
                sources: { embed: ep.sources?.embed || ep.sources || "" },
              }));
            } else {
              movieData.episodes = [];
            }
            movieData.sources = null;
          } else {
            movieData.sources = {
              embed: movie.sources?.embed || movie.sources || "",
            };
            movieData.episodes = null;
          }
          await setDoc(doc(db, "movies", id), movieData);
          successCount++;
        } catch (err) {
          console.error("Gagal import item:", movie.judul, err);
        }
      });
      await Promise.all(batchPromises);
      showToast(`${successCount} Film Berhasil Diimport!`, "green");
      loadMovies();
      closeImportModal();
      switchTab("list");
    }
    return;
  }
  fillFormWithData(data);
  showToast("Data dimuat ke form", "green");
  closeImportModal();
};

function fillFormWithData(data) {
  document.getElementById("inp-judul").value = data.judul || "";
  document.getElementById("inp-poster").value = data.poster || "";
  document.getElementById("inp-rating").value = data.rating || "";
  document.getElementById("inp-desc").value = data.deskripsi || "";
  document.getElementById("inp-type").value = (
    data.type || "movie"
  ).toLowerCase();
  document.getElementById("inp-rilis").value = data.rilis || "";
  document.getElementById("inp-status").value = data.status || "Ongoing";
  document.getElementById("inp-total-eps").value = data.total_eps || "";
  document.getElementById("inp-durasi").value = data.durasi || "";
  if (Array.isArray(data.genre)) {
    document.getElementById("inp-genre").value = data.genre.join(", ");
  } else if (typeof data.genre === "string") {
    document.getElementById("inp-genre").value = data.genre;
  }
  toggleTypeFields();
  document.getElementById("cast-list-input").innerHTML = "";
  if (data.cast && Array.isArray(data.cast)) {
    data.cast.forEach((c) => addCastInput(c.name, c.role, c.img));
  } else {
    addCastInput();
  }
  if ((data.type || "movie").toLowerCase() === "series") {
    document.getElementById("episode-list-input").innerHTML = "";
    if (data.episodes && Array.isArray(data.episodes)) {
      data.episodes.forEach((ep) => {
        const link = ep.sources?.embed || ep.sources || "";
        addEpisodeInput(ep.title, link);
      });
    } else {
      addEpisodeInput();
    }
  } else {
    const link = data.sources?.embed || data.sources || "";
    document.getElementById("inp-embed").value = link;
  }
  document.getElementById("download-list-input").innerHTML = "";
  if (data.downloads) {
    Object.entries(data.downloads).forEach(([label, url]) => {
      addDownloadInput(label, url);
    });
  } else {
    addDownloadInput();
  }
}

window.editMovie = (idStr) => {
  const movie = allMoviesData.find((m) => String(m.id) === String(idStr));
  if (!movie) {
    alert("Data film tidak ditemukan di memori local. Coba refresh halaman.");
    return;
  }
  document.getElementById("form-title").textContent = "Edit Film";
  document.getElementById("inp-id").value = movie.id;
  document.getElementById("inp-judul").value = movie.judul || "";
  document.getElementById("inp-poster").value = movie.poster || "";
  document.getElementById("inp-type").value = movie.type || "movie";
  document.getElementById("inp-status").value = movie.status || "Ongoing";
  document.getElementById("inp-rating").value = movie.rating || "";
  document.getElementById("inp-rilis").value = movie.rilis || "";
  document.getElementById("inp-durasi").value = movie.durasi || "";
  document.getElementById("inp-total-eps").value = movie.total_eps || "";
  document.getElementById("inp-desc").value = movie.deskripsi || "";
  document.getElementById("inp-genre").value = Array.isArray(movie.genre)
    ? movie.genre.join(", ")
    : movie.genre || "";
  toggleTypeFields();
  const castContainer = document.getElementById("cast-list-input");
  castContainer.innerHTML = "";
  if (movie.cast && Array.isArray(movie.cast) && movie.cast.length > 0) {
    movie.cast.forEach((c) =>
      addCastInput(c.name || "", c.role || "", c.img || ""),
    );
  } else {
    addCastInput();
  }
  const dlContainer = document.getElementById("download-list-input");
  dlContainer.innerHTML = "";
  if (movie.downloads && typeof movie.downloads === "object") {
    Object.entries(movie.downloads).forEach(([label, url]) => {
      addDownloadInput(label, url);
    });
  } else {
    addDownloadInput();
  }
  document.getElementById("inp-embed").value = "";
  const epContainer = document.getElementById("episode-list-input");
  epContainer.innerHTML = "";
  if (movie.type === "series") {
    if (
      movie.episodes &&
      Array.isArray(movie.episodes) &&
      movie.episodes.length > 0
    ) {
      movie.episodes.forEach((ep) => {
        const embedLink = ep.sources?.embed || ep.sources?.iframe || "";
        addEpisodeInput(ep.title || "", embedLink);
      });
    } else {
      addEpisodeInput();
    }
  } else {
    const embedLink = movie.sources?.embed || movie.sources?.iframe || "";
    document.getElementById("inp-embed").value = embedLink;
  }
  switchTab("add");
};

window.handleSaveMovie = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = "Menyimpan...";
  try {
    const movieData = getMovieDataFromForm();
    await setDoc(doc(db, "movies", String(movieData.id)), movieData);
    showToast("Data Tersimpan!", "green");
    loadMovies();
    switchTab("list");
  } catch (err) {
    console.error(err);
    showToast("Error: " + err.message, "red");
  } finally {
    btn.disabled = false;
    btn.textContent = "SIMPAN DATA";
  }
};

window.openDeleteModal = (id) => {
  pendingDeleteId = id;
  document.getElementById("delete-modal").classList.remove("hidden");
};
window.closeDeleteModal = () => {
  pendingDeleteId = null;
  document.getElementById("delete-modal").classList.add("hidden");
};
window.confirmDelete = async () => {
  if (!pendingDeleteId) return;
  try {
    await deleteDoc(doc(db, "movies", String(pendingDeleteId)));
    showToast("Film berhasil dihapus!", "green");
    loadMovies();
  } catch (e) {
    showToast("Gagal hapus: " + e.message, "red");
  } finally {
    closeDeleteModal();
  }
};
window.filterAdminList = () => {
  const term = document.getElementById("search-admin").value.toLowerCase();
  const filtered = allMoviesData.filter((m) =>
    m.judul.toLowerCase().includes(term),
  );
  currentPage = 1;
  renderTable(filtered);
};

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

window.generateSitemap = async () => {
  const codeBlock = document.getElementById("sitemap-code");
  const lineNumbers = document.getElementById("line-numbers");
  codeBlock.innerHTML = "Generating...";
  lineNumbers.innerHTML = "1";
  try {
    const snap = await getDocs(collection(db, "movies"));
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    xml += `  <url>\n    <loc>https://streamclip.my.id/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>https://streamclip.my.id/riwayat</loc>\n    <priority>0.5</priority>\n  </url>\n  <url>\n    <loc>https://streamclip.my.id/favorit</loc>\n    <priority>0.5</priority>\n  </url>\n`;
    snap.forEach((doc) => {
      const m = doc.data();
      const slug = createSlug(m.judul);
      const url = `https://streamclip.my.id/watch/${m.id}-${slug}`;
      const lastMod = m.lastUpdated
        ? m.lastUpdated.split("T")[0]
        : new Date().toISOString().split("T")[0];
      xml += `  <url>\n    <loc>${url}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    });
    xml += `</urlset>`;
    rawSitemapXML = xml;
    renderCodeWithHighlight(xml, "sitemap-code", "line-numbers", true);
    showToast("Sitemap Berhasil Digenerate!", "green");
  } catch (e) {
    codeBlock.textContent = "Error: " + e.message;
    console.error(e);
  }
};

function renderCodeWithHighlight(code, blockId, lineId, isXML = false) {
  const codeBlock = document.getElementById(blockId);
  const lineNumbers = document.getElementById(lineId);
  let safeCode = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (isXML) {
    safeCode = safeCode.replace(
      /(&lt;\/?)(\w+)(.*?)(&gt;)/g,
      '<span class="xml-tag">$1$2</span><span class="xml-attr">$3</span><span class="xml-tag">$4</span>',
    );
    safeCode = safeCode.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<span class="xml-val">$1</span>',
    );
    safeCode = safeCode.replace(
      />([^<]+)</g,
      '><span class="xml-content">$1</span><',
    );
  } else {
    safeCode = safeCode.replace(
      /"(\w+)":/g,
      '<span class="json-key">"$1"</span>:',
    );
    safeCode = safeCode.replace(
      /: "([^"]*)"/g,
      ': <span class="json-string">"$1"</span>',
    );
    safeCode = safeCode.replace(
      /: (\d+)/g,
      ': <span class="json-num">$1</span>',
    );
  }

  codeBlock.innerHTML = safeCode;
  const lines = code.split("\n").length;
  let linesHTML = "";
  for (let i = 1; i <= lines; i++) linesHTML += `${i}<br>`;
  lineNumbers.innerHTML = linesHTML;
}

window.copySitemap = () => {
  if (!rawSitemapXML) return;
  navigator.clipboard.writeText(rawSitemapXML).then(() => {
    showToast("XML Sitemap disalin!", "green");
  });
};
window.downloadSitemap = () => {
  if (!rawSitemapXML) return;
  const blob = new Blob([rawSitemapXML], { type: "text/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sitemap.xml";
  a.click();
  URL.revokeObjectURL(url);
  showToast("File XML didownload!", "green");
};
window.closeExportModal = () =>
  document.getElementById("export-modal").classList.add("hidden");
window.copyExportJSON = () => {
  if (!rawExportJSON) return;
  navigator.clipboard.writeText(rawExportJSON).then(() => {
    showToast("JSON disalin!", "green");
  });
};
window.downloadExportJSON = () => {
  if (!rawExportJSON) return;
  const blob = new Blob([rawExportJSON], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const data = JSON.parse(rawExportJSON);
  a.download = `${data.judul.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("File JSON didownload!", "green");
};
function showToast(msg, color) {
  Toastify({
    text: msg,
    duration: 3000,
    gravity: "top",
    position: "right",
    style: { background: color === "green" ? "#22c55e" : "#ef4444" },
  }).showToast();
}
