import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./config.js";

function getUrlParams() {
  const path = window.location.pathname;
  const segments = path.split("/").filter(Boolean);

  const dlIndex = segments.indexOf("download");

  if (dlIndex !== -1 && segments.length > dlIndex + 1) {
    const idSlug = segments[dlIndex + 1];

    return idSlug.split("-")[0];
  }

  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("id");
}

function getOptimizedImage(url) {
  if (!url) return "https://placehold.co/300x450/333/fff?text=No+Image";
  if (url.includes("tmdb.org/t/p/")) return url.replace("/w500/", "/w342/");
  return url;
}

async function init() {
  const movieId = getUrlParams();
  const loader = document.getElementById("loader");
  const content = document.getElementById("content");

  if (!movieId) {
    document.getElementById("download-container").innerHTML =
      `<div class="p-10 text-center text-red-500">ID Film tidak ditemukan di URL.</div>`;
    return;
  }

  try {
    const docRef = doc(db, "movies", movieId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      renderPage(data);

      loader.classList.add("hidden");
      content.classList.remove("hidden");
      setTimeout(() => content.classList.remove("opacity-0"), 50);
    } else {
      document.getElementById("download-container").innerHTML =
        `<div class="p-10 text-center text-red-500">Data film tidak ditemukan di database.</div>`;
    }
  } catch (error) {
    console.error("Error:", error);
    document.getElementById("download-container").innerHTML =
      `<div class="p-10 text-center text-red-500">Terjadi kesalahan koneksi.</div>`;
  }
}

function renderPage(data) {
  document.title = `Download ${data.judul} - MyClip`;
  document.getElementById("poster").src = getOptimizedImage(data.poster);
  document.getElementById("title").textContent = data.judul;
  document.getElementById("desc").textContent =
    data.deskripsi || "Tidak ada sinopsis.";

  const tagsContainer = document.getElementById("tags");
  if (data.genre && Array.isArray(data.genre)) {
    data.genre.forEach((g) => {
      tagsContainer.innerHTML += `<span class="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700">${g}</span>`;
    });
  }

  const type = (data.type || "movie").toLowerCase();
  const linksGrid = document.getElementById("links-grid");
  const listTitle = document.getElementById("list-title");
  const batchSection = document.getElementById("batch-section");
  const batchLinksDiv = document.getElementById("batch-links");

  if (type === "series") {
    if (data.downloads && typeof data.downloads === "object") {
      batchSection.classList.remove("hidden");
      batchLinksDiv.innerHTML = "";
      Object.entries(data.downloads).forEach(([label, url]) => {
        batchLinksDiv.appendChild(
          createDownloadButton(label, url, "bg-yellow-600 hover:bg-yellow-700"),
        );
      });
    }

    listTitle.innerHTML =
      '<i class="fas fa-list-ol mr-2 text-blue-500"></i> Daftar Episode';
    linksGrid.innerHTML = "";

    if (
      data.episodes &&
      Array.isArray(data.episodes) &&
      data.episodes.length > 0
    ) {
      data.episodes.forEach((ep, index) => {
        const epCard = document.createElement("div");
        epCard.className =
          "bg-gray-800 border border-gray-700 rounded-lg p-3 flex flex-col gap-2 hover:border-blue-500 transition-colors";

        const title = document.createElement("div");
        title.className = "text-sm font-bold text-gray-200 truncate";
        title.textContent = ep.title || `Episode ${index + 1}`;
        epCard.appendChild(title);

        const btnGroup = document.createElement("div");
        btnGroup.className = "flex gap-2 mt-auto";

        if (ep.download) {
          const btn = document.createElement("a");
          btn.href = ep.download;
          btn.target = "_blank";
          btn.className =
            "flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 rounded transition-colors";
          btn.innerHTML = '<i class="fas fa-download"></i> Download';
          btnGroup.appendChild(btn);
        } else {
          btnGroup.innerHTML =
            '<span class="text-xs text-gray-500">Link streaming only</span>';
        }

        epCard.appendChild(btnGroup);
        linksGrid.appendChild(epCard);
      });
    } else {
      linksGrid.innerHTML =
        '<div class="col-span-full text-center text-gray-500">Belum ada daftar episode.</div>';
    }
  } else {
    listTitle.innerHTML =
      '<i class="fas fa-film mr-2 text-blue-500"></i> Link Download Movie';
    linksGrid.innerHTML = "";

    if (data.downloads && typeof data.downloads === "object") {
      Object.entries(data.downloads).forEach(([label, url]) => {
        const btn = createDownloadButton(
          label,
          url,
          "bg-green-600 hover:bg-green-700 h-14 text-lg",
        );
        btn.classList.remove("h-10");
        linksGrid.appendChild(btn);
      });
    } else {
      linksGrid.innerHTML =
        '<div class="col-span-full text-center text-gray-500">Link download belum tersedia.</div>';
    }
  }
}

function createDownloadButton(text, url, colorClass) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.className = `flex items-center justify-center gap-2 w-full py-3 rounded-lg font-bold text-white transition-transform hover:scale-105 shadow-lg ${colorClass}`;
  a.innerHTML = `<i class="fas fa-download"></i> ${text}`;
  return a;
}

init();
