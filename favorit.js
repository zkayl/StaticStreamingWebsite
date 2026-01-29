import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db } from "./config.js";

let currentUser = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loadFavorites();
  } else {
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("empty-state").classList.remove("hidden");
    document.getElementById("empty-state").querySelector("p").textContent =
      "Login untuk melihat favorit.";
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

async function loadFavorites() {
  const grid = document.getElementById("fav-grid");

  try {
    const q = query(
      collection(db, "users", currentUser.uid, "favorites"),
      orderBy("addedAt", "desc"),
    );
    const snapshot = await getDocs(q);

    document.getElementById("loading").classList.add("hidden");

    if (snapshot.empty) {
      document.getElementById("empty-state").classList.remove("hidden");
      return;
    }

    snapshot.forEach((doc) => {
      const data = doc.data();
      const card = createCard(data);
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
    "relative bg-streamDarkGray rounded-md overflow-hidden cursor-pointer group h-full flex flex-col hover:scale-105 transition-transform duration-300";

  let poster = movie.poster;
  if (poster && poster.includes("tmdb.org/t/p/"))
    poster = poster.replace("/w500/", "/w342/");

  card.onclick = () => {
    const titleSlug = createSlug(movie.judul);
    window.location.href = `/watch/${movie.movieId}/${titleSlug}`;
  };

  card.innerHTML = `
        <div class="absolute top-2 right-2 bg-streamRed text-white text-[10px] font-bold px-2 py-1 rounded shadow z-10">FAV</div>
        <div class="relative w-full aspect-[2/3] overflow-hidden">
            <img src="${poster}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" loading="lazy">
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                 <i class="fas fa-play text-3xl text-streamRed drop-shadow-lg"></i>
            </div>
        </div>
        <div class="p-3">
            <h3 class="font-bold text-white text-sm leading-tight truncate mb-1">${movie.judul}</h3>
            <p class="text-xs text-gray-500 uppercase">${movie.type || "Movie"}</p>
        </div>
    `;
  return card;
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
