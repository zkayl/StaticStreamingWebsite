import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  increment,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db } from "./config.js";

let currentUser = null;
let currentMovieData = null;
let watchedEpisodesCache = new Set();

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

function getOptimizedImage(url, type = "poster") {
  if (!url) return "https://placehold.co/100x100/333/fff?text=No+Img";
  if (url.includes("tmdb.org/t/p/")) {
    if (type === "poster") return url.replace("/w500/", "/w342/");
    else if (type === "cast") return url.replace("/w200/", "/w185/");
  }
  return url;
}

function stopLoading() {
  const loader = document.getElementById("loading-state");
  const content = document.getElementById("content-area");
  if (loader) loader.classList.add("hidden");
  if (content) content.classList.remove("hidden");
}

function showError(msg) {
  const loader = document.getElementById("loading-state");
  const content = document.getElementById("content-area");
  if (loader) loader.classList.add("hidden");

  if (content) {
    content.classList.remove("hidden");
    content.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
                <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
                <h2 class="text-xl font-bold text-white">Terjadi Kesalahan</h2>
                <p class="text-gray-400 mt-2">${msg}</p>
                <a href="/" class="mt-6 px-6 py-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white transition">Kembali ke Home</a>
            </div>
        `;
  }
}

function getUrlParams() {
  const path = window.location.pathname;
  const segments = path.split("/").filter(Boolean);

  const watchIndex = segments.indexOf("watch");

  if (watchIndex !== -1 && segments.length > watchIndex + 1) {
    const idStr = segments[watchIndex + 1];
    const epSlug =
      segments.length > watchIndex + 3 ? segments[watchIndex + 3] : null;

    const movieId = idStr.split("-")[0];
    return { movieId, epParam: epSlug };
  }

  const urlParams = new URLSearchParams(window.location.search);
  const idRaw = urlParams.get("id");
  return {
    movieId: idRaw ? idRaw.split("-")[0] : null,
    epParam: urlParams.get("ep"),
  };
}

const { movieId, epParam: urlEpParam } = getUrlParams();
let episodeIndex = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  initPage();
});

async function initPage() {
  if (!movieId) {
    showError("ID Film tidak ditemukan di URL.");
    return;
  }

  try {
    const docRef = doc(db, "movies", movieId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      currentMovieData = { id: docSnap.id, ...docSnap.data() };
      const episodes = currentMovieData.episodes || [];

      if (currentUser) {
        await loadWatchedHistory();
        checkFavoriteStatus();
      }

      const type = (currentMovieData.type || "movie").toLowerCase();

      if (type === "series" && episodes.length > 0) {
        if (urlEpParam) {
          const foundIndex = episodes.findIndex(
            (ep) => createSlug(ep.title) === urlEpParam,
          );
          if (foundIndex !== -1) {
            episodeIndex = foundIndex;
          } else {
            const match = urlEpParam.match(/\d+/);
            if (match) {
              const num = parseInt(match[0]);
              episodeIndex = num > 0 && num <= episodes.length ? num - 1 : 0;
            } else {
              episodeIndex = 0;
            }
          }
        } else if (currentUser) {
          const lastIndex = getLastWatchedEpisodeIndex();
          if (lastIndex !== null && episodes[lastIndex]) {
            const slug = createSlug(episodes[lastIndex].title);
            const idSlug = `${currentMovieData.id}-${createSlug(currentMovieData.judul)}`;
            window.location.replace(`/watch/${idSlug}/${slug}`);
            return;
          } else {
            episodeIndex = 0;
          }
        } else {
          episodeIndex = 0;
        }
      } else {
        episodeIndex = 0;
      }

      renderPage(currentMovieData);
      saveToHistory();
      updateDoc(docRef, { views: increment(1) }).catch(() => {});
    } else {
      showError("Film tidak ditemukan di database.");
    }
  } catch (error) {
    console.error("Error Init Page:", error);
    showError("Gagal memuat data: " + error.message);
  }
}

function renderPage(movie) {
  try {
    document.title = `Nonton ${movie.judul} - MyClip`;

    document.getElementById("movie-title").textContent = movie.judul;
    document.getElementById("movie-desc").textContent =
      movie.deskripsi || "Tidak ada deskripsi.";

    const MAIN_CATEGORIES = [
      "Anime",
      "Drama Korea",
      "Drama China",
      "Donghua",
      "Indonesia",
      "Thailand",
      "Tokusatsu",
      "Hollywood",
      "Bollywood",
    ];
    let typeLabel = movie.type || "Movie";
    typeLabel = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
    let categoryLabel = "";
    if (movie.genre && Array.isArray(movie.genre)) {
      const found = movie.genre.find((g) =>
        MAIN_CATEGORIES.some((cat) => cat.toLowerCase() === g.toLowerCase()),
      );
      if (found) categoryLabel = ` > ${found}`;
    }
    document.getElementById("breadcrumb-text").textContent =
      `Home > ${typeLabel}${categoryLabel} > ${movie.judul}`;

    const tagsContainer = document.getElementById("movie-tags");
    if (movie.genre) {
      const genres = Array.isArray(movie.genre) ? movie.genre : [movie.genre];
      tagsContainer.innerHTML = genres
        .map(
          (g) =>
            `<span class="bg-gray-800 text-gray-300 px-2 py-1 rounded border border-gray-700">${g}</span>`,
        )
        .join("");
    }

    const metaContainer = document.getElementById("metadata-grid");
    metaContainer.innerHTML = `
            <div class="flex justify-between border-b border-gray-800 pb-2"><span>Rilis</span> <span class="text-white">${movie.rilis || "-"}</span></div>
            <div class="flex justify-between border-b border-gray-800 pb-2"><span>Durasi</span> <span class="text-white">${movie.durasi || "-"}</span></div>
            <div class="flex justify-between border-b border-gray-800 pb-2"><span>Total Eps</span> <span class="text-white">${movie.total_eps || "-"}</span></div>
            <div class="flex justify-between border-b border-gray-800 pb-2"><span>Rating</span> <span class="text-streamRed font-bold">★ ${movie.rating || "0"}</span></div>
            <div class="flex justify-between"><span>Tipe</span> <span class="text-white uppercase">${movie.type || "Movie"}</span></div>
        `;

    renderCast(movie);

    const type = (movie.type || "movie").toLowerCase();

    if (type === "series" && movie.episodes && movie.episodes.length > 0) {
      document.getElementById("episode-container").classList.remove("hidden");
      renderEpisodeList(movie.episodes, movie.id, movie.judul);

      const safeIndex = movie.episodes[episodeIndex] ? episodeIndex : 0;
      const currentEp = movie.episodes[safeIndex];

      const source = currentEp.sources || {};
      loadPlayer(source);

      document.getElementById("movie-title").innerHTML =
        `${movie.judul} <span class="text-gray-500 text-lg block mt-1">${currentEp.title}</span>`;
    } else {
      loadPlayer(movie.sources);
    }

    stopLoading();
  } catch (e) {
    console.error("Render Error:", e);
    showError("Terjadi kesalahan saat menampilkan data.");
  }
}

function renderEpisodeList(episodes, mId, mJudul) {
  const list = document.getElementById("episode-list");
  list.innerHTML = "";

  episodes.forEach((ep, idx) => {
    const btn = document.createElement("button");
    const isActive = idx === episodeIndex;
    const isWatched = watchedEpisodesCache.has(idx);

    let colorClass = "";

    if (isActive) {
      colorClass =
        "border-2 border-streamRed text-white z-10 scale-105 shadow-[0_0_15px_rgba(229,9,20,0.4)]";
    } else if (isWatched) {
      colorClass =
        "border border-gray-800 text-gray-600 opacity-70 hover:opacity-100 hover:text-gray-400";
    } else {
      colorClass =
        "border border-gray-700 text-gray-300 hover:border-white hover:text-white";
    }

    btn.className = `flex-shrink-0 px-4 py-3 rounded-lg min-w-[120px] text-left transition-all duration-200 select-none bg-transparent ${colorClass}`;

    const icon =
      isWatched && !isActive
        ? '<i class="fas fa-check text-[10px] mr-1"></i> '
        : "";

    btn.innerHTML = `<div class="font-bold text-sm truncate pointer-events-none">${icon}${ep.title}</div>`;

    btn.onclick = (e) => {
      if (list.classList.contains("is-dragging")) return;
      const titleSlug = createSlug(mJudul);
      const epSlug = createSlug(ep.title);
      window.location.href = `/watch/${mId}/${titleSlug}/${epSlug}`;
    };
    list.appendChild(btn);
  });

  enableDragScroll(list);

  if (!list.hasAttribute("data-scrolled")) {
    setTimeout(() => {
      const activeBtn = list.querySelector(".border-streamRed");
      if (activeBtn)
        activeBtn.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
    }, 500);
    list.setAttribute("data-scrolled", "true");
  }
}

function renderCast(movie) {
  const container = document.getElementById("cast-container");
  const list = document.getElementById("cast-list");
  list.innerHTML = "";
  if (!movie.cast || !Array.isArray(movie.cast) || movie.cast.length === 0) {
    container.classList.add("hidden");
    return;
  }
  container.classList.remove("hidden");
  movie.cast.forEach((person) => {
    const item = document.createElement("div");
    item.className =
      "cast-card min-w-[100px] max-w-[100px] flex flex-col items-center text-center";
    const imgUrl = getOptimizedImage(person.img, "cast");
    item.innerHTML = `
            <div class="cast-img-wrapper w-[90px] h-[90px] rounded-lg overflow-hidden border-2 border-[#333] mb-2 transition-colors hover:border-streamRed">
                <img src="${imgUrl}" class="w-full h-full object-cover pointer-events-none" loading="lazy" onerror="this.src='https://placehold.co/100x100/333/fff?text=?'">
            </div>
            <p class="text-xs font-bold text-white leading-tight truncate w-full pointer-events-none">${person.name || "Unknown"}</p>
            <p class="text-[10px] text-gray-500 truncate w-full pointer-events-none">${person.role || "-"}</p>
        `;
    list.appendChild(item);
  });
  enableDragScroll(list);
}

function enableDragScroll(slider) {
  let isDown = false;
  let startX;
  let scrollLeft;
  let dragged = false;
  slider.addEventListener("mousedown", (e) => {
    isDown = true;
    dragged = false;
    slider.classList.add("active");
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
    slider.classList.remove("is-dragging");
  });
  slider.addEventListener("mouseleave", () => {
    isDown = false;
    slider.classList.remove("active");
  });
  slider.addEventListener("mouseup", () => {
    isDown = false;
    slider.classList.remove("active");
    setTimeout(() => slider.classList.remove("is-dragging"), 50);
  });
  slider.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.5;
    slider.scrollLeft = scrollLeft - walk;
    if (Math.abs(walk) > 5) {
      dragged = true;
      slider.classList.add("is-dragging");
    }
  });
}

function loadPlayer(sources) {
  const wrapper = document.getElementById("video-wrapper");
  if (!sources) {
    wrapper.innerHTML =
      '<div class="text-gray-500">Video source not available</div>';
    return;
  }
  let embedUrl = sources.embed || sources.iframe || "";
  if (typeof sources === "string") embedUrl = sources;
  if (embedUrl && embedUrl.includes("seekstreaming.com/v/")) {
    embedUrl = embedUrl.replace("/v/", "/embed/");
  }
  if (embedUrl) {
    wrapper.innerHTML = `<iframe src="${embedUrl}" class="w-full h-full border-0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
  } else {
    wrapper.innerHTML =
      '<div class="text-gray-500">Link embed belum tersedia.</div>';
  }
}

async function checkFavoriteStatus() {
  if (!currentUser || !movieId) return;
  try {
    const docRef = doc(
      db,
      "users",
      currentUser.uid,
      "favorites",
      String(movieId),
    );
    const docSnap = await getDoc(docRef);
    updateFavoriteButton(docSnap.exists());
  } catch (e) {
    console.error("Gagal cek favorit:", e);
  }
}
function updateFavoriteButton(isFav) {
  const btn = document.getElementById("btn-favorite");
  const icon = btn.querySelector("i");
  const text = btn.querySelector("span");
  if (isFav) {
    btn.classList.remove(
      "bg-gray-800",
      "border-gray-600",
      "text-white",
      "hover:bg-gray-700",
    );
    btn.classList.add(
      "bg-streamRed",
      "border-streamRed",
      "text-white",
      "hover:bg-red-700",
    );
    icon.classList.remove("far");
    icon.classList.add("fas");
    text.textContent = "Disimpan";
  } else {
    btn.classList.remove(
      "bg-streamRed",
      "border-streamRed",
      "text-white",
      "hover:bg-red-700",
    );
    btn.classList.add(
      "bg-gray-800",
      "border-gray-600",
      "text-white",
      "hover:bg-gray-700",
    );
    icon.classList.remove("fas");
    icon.classList.add("far");
    text.textContent = "Favorit";
  }
}
window.toggleFavorite = async () => {
  if (!currentUser) {
    alert("Silakan login untuk menyimpan favorit!");
    return;
  }
  if (!currentMovieData) return;
  const docId = String(currentMovieData.id);
  const docRef = doc(db, "users", currentUser.uid, "favorites", docId);
  const btn = document.getElementById("btn-favorite");
  const isFav = btn.querySelector("i").classList.contains("fas");
  updateFavoriteButton(!isFav);
  try {
    if (isFav) await deleteDoc(docRef);
    else
      await setDoc(docRef, {
        movieId: docId,
        judul: currentMovieData.judul,
        poster: currentMovieData.poster,
        type: currentMovieData.type || "Movie",
        addedAt: serverTimestamp(),
      });
  } catch (e) {
    updateFavoriteButton(isFav);
    alert("Gagal memperbarui favorit.");
  }
};

async function loadWatchedHistory() {
  try {
    const q = query(
      collection(db, "users", currentUser.uid, "history"),
      where("movieId", "==", String(movieId)),
    );
    const snapshot = await getDocs(q);
    watchedEpisodesCache.clear();
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.isEpisode && data.episodeIndex !== undefined)
        watchedEpisodesCache.add(data.episodeIndex);
    });
  } catch (e) {
    console.error("Gagal load history:", e);
  }
}

function getLastWatchedEpisodeIndex() {
  if (watchedEpisodesCache.size === 0) return null;
  return Math.max(...watchedEpisodesCache);
}

async function saveToHistory() {
  if (!currentUser || !currentMovieData) return;
  try {
    let docId = String(currentMovieData.id);
    let data = {
      movieId: docId,
      judul: currentMovieData.judul,
      poster: currentMovieData.poster,
      type: currentMovieData.type || "Movie",
      watchedAt: serverTimestamp(),
      isEpisode: false,
    };
    if (
      (currentMovieData.type || "").toLowerCase() === "series" &&
      currentMovieData.episodes
    ) {
      const currentEp = currentMovieData.episodes[episodeIndex];
      if (currentEp) {
        docId = `${docId}_ep${episodeIndex}`;
        data.episodeIndex = episodeIndex;
        data.episodeTitle = currentEp.title;
        data.isEpisode = true;
      }
    }
    const historyRef = doc(db, "users", currentUser.uid, "history", docId);
    await setDoc(historyRef, data, { merge: true });
    if (data.isEpisode) {
      watchedEpisodesCache.add(episodeIndex);
    }
  } catch (e) {
    console.error("Gagal simpan riwayat:", e);
  }
}

window.goToDownload = () => {
  if (!currentMovieData) return;
  const titleSlug = createSlug(currentMovieData.judul);
  window.open(`/download/${movieId}-${titleSlug}`, "_blank");
};

window.shareMovie = () => {
  if (navigator.share)
    navigator
      .share({ title: document.title, url: window.location.href })
      .catch(console.error);
  else {
    navigator.clipboard.writeText(window.location.href);
    alert("Link disalin!");
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
    )
      blockEvent(e);
  });
  ["copy", "cut", "paste"].forEach((ev) =>
    document.addEventListener(ev, blockEvent),
  );
})();
