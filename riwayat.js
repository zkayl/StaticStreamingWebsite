import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db } from "./config.js";

let currentUser = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loadHistory();
  } else {
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("empty-state").classList.remove("hidden");
    document.getElementById("empty-state").querySelector("p").textContent =
      "Silakan login untuk melihat riwayat.";
  }
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

async function loadHistory() {
  const grid = document.getElementById("history-grid");

  try {
    const q = query(
      collection(db, "users", currentUser.uid, "history"),
      orderBy("watchedAt", "desc"),
      limit(50),
    );
    const snapshot = await getDocs(q);

    document.getElementById("loading").classList.add("hidden");

    if (snapshot.empty) {
      document.getElementById("empty-state").classList.remove("hidden");
      return;
    }

    const uniqueMovies = new Map();

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!uniqueMovies.has(data.movieId)) {
        uniqueMovies.set(data.movieId, data);
      }
    });

    uniqueMovies.forEach((movie) => {
      const card = createCard(movie);
      grid.appendChild(card);
    });
  } catch (e) {
    console.error(e);
    document.getElementById("loading").innerHTML =
      '<p class="text-red-500">Gagal memuat data.</p>';
  }
}

function createCard(movie) {
  const card = document.createElement("div");
  card.className =
    "relative bg-streamDarkGray rounded-md overflow-hidden cursor-pointer group hover:scale-105 transition-transform duration-300";

  let poster = movie.poster;
  if (poster && poster.includes("tmdb.org/t/p/"))
    poster = poster.replace("/w500/", "/w342/");

  let episodeLabel = "";
  if (movie.isEpisode) {
    episodeLabel = `<div class="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg z-10 truncate max-w-[80%]">Lanjut: ${movie.episodeTitle || "Eps " + (movie.episodeIndex + 1)}</div>`;
  }

  card.onclick = () => {
    const titleSlug = createSlug(movie.judul);
    let url = `/watch/${movie.movieId}/${titleSlug}`;

    if (movie.isEpisode && movie.episodeIndex !== undefined) {
      const epSlug = createSlug(movie.episodeTitle);

      url += epSlug ? `/${epSlug}` : `/episode-${movie.episodeIndex + 1}`;
    }
    window.location.href = url;
  };

  card.innerHTML = `
        ${episodeLabel}
        <div class="relative w-full aspect-[2/3] overflow-hidden">
            <img src="${poster}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy">
            <div class="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors flex items-center justify-center">
                 <i class="fas fa-play-circle text-4xl text-streamRed opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg"></i>
            </div>
        </div>
        <div class="p-3">
            <h3 class="font-bold text-white text-sm leading-tight truncate">${movie.judul}</h3>
            <p class="text-xs text-gray-500 mt-1">${timeAgo(movie.watchedAt?.toDate())}</p>
        </div>
    `;
  return card;
}

window.clearHistory = async () => {
  if (!currentUser) return;
  if (!confirm("Hapus semua riwayat?")) return;

  try {
    const q = query(collection(db, "users", currentUser.uid, "history"));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    window.location.reload();
  } catch (e) {
    alert("Gagal hapus: " + e.message);
  }
};

function timeAgo(date) {
  if (!date) return "";
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " tahun lalu";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " bulan lalu";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " hari lalu";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " jam lalu";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " menit lalu";
  return "Baru saja";
}

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
