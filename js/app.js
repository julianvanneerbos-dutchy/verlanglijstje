import { db } from "./firebase-config.js";
import { 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  setDoc, 
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signInAnonymously, 
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// --- 0. PWA SERVICE WORKER REGISTRATIE ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((err) => {
      console.warn("ServiceWorker registratie mislukt:", err);
    });
  });
}

// --- 1. MODERNE SVG ICONEN (Identiek aan Boodschappenapp) ---
const ICONS = {
  drag: `<svg class="drag-handle" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" title="Sleep om te sorteren"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`,
  edit: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  trash: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`
};

// --- 2. CONFIGURATIE & STATE ---
const auth = getAuth();
const ADMIN_EMAIL = "julian.vanneerbos@gmail.com";

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Kon persistente sessie niet instellen:", err);
});

const urlParams = new URLSearchParams(window.location.search);
const listId = urlParams.get("list");
const buyerPinFromUrl = urlParams.get("pin");

let isCurrentUserAdmin = false;
let currentBuyerName = localStorage.getItem("buyer_name") || "";
let showGiverNames = localStorage.getItem("show_giver_names") === "true";
let currentListBuyerPin = "";
let cachedItems = [];
let cachedClaims = {};
let cachedLists = [];
let pendingClaimItemId = null;
let editingListId = null;
let editingItemId = null;

let unsubscribeItems = null;
let unsubscribeClaims = null;
let unsubscribeListMeta = null;

// DOM Elementen
const listTitleEl = document.getElementById("list-title");
const btnBackOverview = document.getElementById("btn-back-overview");
const btnLogout = document.getElementById("btn-logout");
const itemsListEl = document.getElementById("items-list");

// Login Modal
const modalAdminLogin = document.getElementById("modal-admin-login");
const formAdminLogin = document.getElementById("form-admin-login");
const inputAdminPin = document.getElementById("input-admin-pin");
const loginError = document.getElementById("login-error");

// Dashboard elementen
const listsOverviewPanel = document.getElementById("lists-overview-panel");
const allListsContainer = document.getElementById("all-lists-container");
const btnCreateNewList = document.getElementById("btn-create-new-list");
const modalCreateList = document.getElementById("modal-create-list");
const formCreateList = document.getElementById("form-create-list");
const btnCancelList = document.getElementById("btn-cancel-list");

// Bewerk modal
const modalEditList = document.getElementById("modal-edit-list");
const formEditList = document.getElementById("form-edit-list");
const editListTitleInput = document.getElementById("edit-list-title");
const btnCancelEditList = document.getElementById("btn-cancel-edit-list");

// Panelen
const adminPanel = document.getElementById("admin-panel");
const buyerPanel = document.getElementById("buyer-panel");
const buyerStatusText = document.getElementById("buyer-status-text");
const btnChangeBuyerName = document.getElementById("btn-change-buyer-name");
const displayBuyerPin = document.getElementById("display-buyer-pin");
const btnShare = document.getElementById("btn-share");
const toggleShowNames = document.getElementById("toggle-show-names");

// Modals items
const modalAdd = document.getElementById("modal-add-item");
const btnOpenAddModal = document.getElementById("btn-open-add-modal");
const btnCloseModal = document.getElementById("btn-close-modal");
const formAddItem = document.getElementById("form-add-item");

const modalEditItem = document.getElementById("modal-edit-item");
const formEditItem = document.getElementById("form-edit-item");
const btnCancelEditItem = document.getElementById("btn-cancel-edit-item");
const editItemTitle = document.getElementById("edit-item-title");
const editItemUrl = document.getElementById("edit-item-url");
const editItemPrice = document.getElementById("edit-item-price");
const editItemNotes = document.getElementById("edit-item-notes");

const modalConfirmClaim = document.getElementById("modal-confirm-claim");
const formConfirmClaim = document.getElementById("form-confirm-claim");
const confirmClaimText = document.getElementById("confirm-claim-text");
const btnCancelConfirmClaim = document.getElementById("btn-cancel-confirm-claim");

const modalBuyerName = document.getElementById("modal-buyer-name");
const modalBuyerTitle = document.getElementById("modal-buyer-title");
const formBuyerName = document.getElementById("form-buyer-name");
const inputBuyerName = document.getElementById("input-buyer-name");
const btnCancelBuyerName = document.getElementById("btn-cancel-buyer-name");

// Footer & Release Notes elementen
const adminFooter = document.getElementById("admin-footer");
const btnOpenReleases = document.getElementById("btn-open-releases");
const appVersionBadge = document.getElementById("app-version-badge");
const modalReleaseNotes = document.getElementById("modal-release-notes");
const btnCloseReleases = document.getElementById("btn-close-releases");
const releaseNotesContainer = document.getElementById("release-notes-container");

if (toggleShowNames) {
  toggleShowNames.checked = showGiverNames;
  toggleShowNames.addEventListener("change", () => {
    showGiverNames = toggleShowNames.checked;
    localStorage.setItem("show_giver_names", showGiverNames ? "true" : "false");
    renderItems();
  });
}

// --- CHANGELOG & VERSIENUMMER LOGICA ---
async function loadLatestVersion() {
  try {
    const res = await fetch("./changelog.json?v=" + Date.now());
    if (!res.ok) return;
    const releases = await res.json();
    if (Array.isArray(releases) && releases.length > 0 && releases[0].version) {
      if (appVersionBadge) {
        appVersionBadge.textContent = releases[0].version;
      }
    }
  } catch (err) {
    console.warn("Kon versienummer niet ophalen:", err);
  }
}

loadLatestVersion();

if (btnOpenReleases && modalReleaseNotes) {
  btnOpenReleases.onclick = async () => {
    modalReleaseNotes.showModal();
    try {
      const res = await fetch("./changelog.json?v=" + Date.now());
      if (!res.ok) throw new Error("Kon changelog niet ophalen");
      const releases = await res.json();
      renderReleaseNotes(releases);
    } catch (err) {
      if (releaseNotesContainer) {
        releaseNotesContainer.innerHTML = "<p class='label'>Kon updates niet inladen.</p>";
      }
    }
  };
}

if (btnCloseReleases && modalReleaseNotes) {
  btnCloseReleases.onclick = () => modalReleaseNotes.close();
}

function renderReleaseNotes(releases) {
  if (!releaseNotesContainer) return;
  releaseNotesContainer.innerHTML = "";
  
  if (!Array.isArray(releases) || releases.length === 0) {
    releaseNotesContainer.innerHTML = "<p class='label'>Geen recente updates gevonden.</p>";
    return;
  }

  releases.forEach((rel) => {
    const box = document.createElement("div");
    box.className = "release-entry";
    
    const changesHtml = (rel.changes || [])
      .map((change) => `<li>${escapeHtml(change)}</li>`)
      .join("");

    box.innerHTML = `
      <div class="release-header">
        <span class="release-version">${escapeHtml(rel.version || "")}</span>
        <span class="release-date">${escapeHtml(rel.date || "")}</span>
      </div>
      <ul class="release-list">
        ${changesHtml}
      </ul>
    `;
    releaseNotesContainer.appendChild(box);
  });
}

// --- 3. URL OPSCHONING HELPER ---
function cleanWebUrl(rawUrl) {
  if (!rawUrl) return null;
  let urlStr = rawUrl.trim();
  if (!urlStr) return null;

  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = "https://" + urlStr;
  }

  try {
    const parsed = new URL(urlStr);
    const trackingParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", 
      "fbclid", "gclid", "ref", "ref_", "tag"
    ];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch (err) {
    return urlStr;
  }
}

// --- 4. AUTHENTICATION & ROUTERING ---
onAuthStateChanged(auth, async (user) => {
  const urlHasPin = urlParams.has("pin");
  isCurrentUserAdmin = !!(user && user.email === ADMIN_EMAIL && !urlHasPin);

  if (isCurrentUserAdmin) {
    if (btnLogout) btnLogout.classList.remove("hidden");
    if (adminFooter) adminFooter.classList.remove("hidden");
    if (btnLogout) {
      btnLogout.onclick = async () => {
        await signOut(auth);
        window.location.reload();
      };
    }
  } else {
    if (btnLogout) btnLogout.classList.add("hidden");
    if (adminFooter) adminFooter.classList.add("hidden");
  }

  if (listId) {
    if (!user) {
      try {
        await signInAnonymously(auth);
        return;
      } catch (err) {
        console.error("Anoniem aanmelden mislukt:", err);
      }
    }
    renderListDetail();
  } else {
    if (isCurrentUserAdmin) {
      if (modalAdminLogin && modalAdminLogin.open) modalAdminLogin.close();
      renderDashboard();
    } else {
      showAdminLoginModal();
    }
  }
});

function showAdminLoginModal() {
  if (!modalAdminLogin) return;
  modalAdminLogin.showModal();

  if (formAdminLogin) {
    formAdminLogin.onsubmit = async (e) => {
      e.preventDefault();
      if (loginError) loginError.style.display = "none";
      const pin = inputAdminPin.value.trim();

      try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithEmailAndPassword(auth, ADMIN_EMAIL, pin);
        modalAdminLogin.close();
        inputAdminPin.value = "";
      } catch (err) {
        if (loginError) loginError.style.display = "block";
        inputAdminPin.value = "";
      }
    };
  }
}

// ==========================================
// SCENARIO A: DASHBOARD
// ==========================================
function renderDashboard() {
  if (listsOverviewPanel) listsOverviewPanel.classList.remove("hidden");
  if (listTitleEl) listTitleEl.textContent = "Mijn Verlanglijstjes";
  if (btnBackOverview) btnBackOverview.classList.add("hidden");
  if (adminPanel) adminPanel.classList.add("hidden");
  if (buyerPanel) buyerPanel.classList.add("hidden");

  onSnapshot(collection(db, "lists"), (snapshot) => {
    cachedLists = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    cachedLists.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : 9999;
      const orderB = b.order !== undefined ? b.order : 9999;
      return orderA - orderB;
    });

    renderListsCards();
  });

  if (btnCreateNewList && modalCreateList) btnCreateNewList.onclick = () => modalCreateList.showModal();
  if (btnCancelList && modalCreateList) btnCancelList.onclick = () => modalCreateList.close();

  if (formCreateList) {
    formCreateList.onsubmit = async (e) => {
      e.preventDefault();
      const titleInput = document.getElementById("new-list-title")?.value.trim();
      if (!titleInput) return;

      const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
      const newOrderIndex = cachedLists.length;

      const docRef = await addDoc(collection(db, "lists"), {
        title: titleInput,
        buyerPin: generatedPin,
        order: newOrderIndex,
        createdAt: serverTimestamp()
      });

      if (modalCreateList) modalCreateList.close();
      window.location.search = `?list=${docRef.id}`;
    };
  }

  if (btnCancelEditList && modalEditList) btnCancelEditList.onclick = () => modalEditList.close();
  if (formEditList) {
    formEditList.onsubmit = async (e) => {
      e.preventDefault();
      const newTitle = editListTitleInput.value.trim();
      if (newTitle && editingListId) {
        await updateDoc(doc(db, "lists", editingListId), { title: newTitle });
        if (modalEditList) modalEditList.close();
        editingListId = null;
      }
    };
  }
}

function renderListsCards() {
  if (!allListsContainer) return;
  allListsContainer.innerHTML = "";
  if (cachedLists.length === 0) {
    allListsContainer.innerHTML = "<p class='label'>Nog geen verlanglijstjes aangemaakt.</p>";
    return;
  }

  cachedLists.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "item-card";
    li.dataset.id = item.id;
    li.dataset.index = index;
    li.draggable = true;

    li.innerHTML = `
      <div class="list-row">
        <div class="list-row-main">
          ${ICONS.drag}
          <div>
            <strong class="item-title">${escapeHtml(item.title || "Naamloos")}</strong>
            <span class="label" style="display: block;">PIN: ${item.buyerPin || "----"}</span>
          </div>
        </div>
        <div class="list-actions">
          <button class="btn-icon btn-edit" title="Lijstnaam bewerken">${ICONS.edit}</button>
          <button class="btn-icon btn-danger btn-delete" title="Lijst verwijderen">${ICONS.trash}</button>
        </div>
      </div>
    `;

    li.querySelector(".list-row-main").onclick = () => {
      window.location.search = `?list=${item.id}`;
    };

    li.querySelector(".btn-edit").onclick = (e) => {
      e.stopPropagation();
      editingListId = item.id;
      editListTitleInput.value = item.title || "";
      if (modalEditList) modalEditList.showModal();
    };

    li.querySelector(".btn-delete").onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`Weet je zeker dat je "${item.title}" wilt verwijderen?`)) {
        await deleteDoc(doc(db, "lists", item.id));
      }
    };

    attachDragEvents(li, cachedLists, renderListsCards, saveNewListOrder);
    allListsContainer.appendChild(li);
  });
}

async function saveNewListOrder() {
  const batch = writeBatch(db);
  cachedLists.forEach((list, index) => {
    batch.update(doc(db, "lists", list.id), { order: index });
  });
  await batch.commit();
}

// ===================================================
// SCENARIO B: LIJSTWEERGAVE
// ===================================================
function renderListDetail() {
  if (listsOverviewPanel) listsOverviewPanel.classList.add("hidden");

  if (isCurrentUserAdmin) {
    if (btnBackOverview) {
      btnBackOverview.classList.remove("hidden");
      btnBackOverview.onclick = () => { window.location.search = ""; };
    }
    if (adminPanel) adminPanel.classList.remove("hidden");
    if (buyerPanel) buyerPanel.classList.add("hidden");

    if (btnShare) {
      btnShare.onclick = () => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?list=${listId}&pin=${currentListBuyerPin}`;
        const shareText = `Bekijk mijn verlanglijstje en reserveer cadeaus: ${shareUrl}`;

        if (navigator.share) {
          navigator.share({ title: "Verlanglijst", text: shareText });
        } else {
          navigator.clipboard.writeText(shareText);
          alert("Deellink gekopieerd naar klembord!");
        }
      };
    }

    if (btnOpenAddModal && modalAdd) btnOpenAddModal.onclick = () => modalAdd.showModal();
    if (btnCloseModal && modalAdd) btnCloseModal.onclick = () => modalAdd.close();

    if (formAddItem) {
      formAddItem.onsubmit = async (e) => {
        e.preventDefault();
        const title = document.getElementById("item-title")?.value.trim();
        const rawUrl = document.getElementById("item-url")?.value;
        const url = cleanWebUrl(rawUrl);
        const price = parseFloat(document.getElementById("item-price")?.value);
        const notes = document.getElementById("item-notes")?.value.trim();

        if (!title) return;

        const newOrderIndex = cachedItems.length;

        await addDoc(collection(db, "lists", listId, "items"), {
          title,
          url: url,
          price: isNaN(price) ? null : price,
          notes: notes || null,
          order: newOrderIndex,
          createdAt: serverTimestamp()
        });

        formAddItem.reset();
        if (modalAdd) modalAdd.close();
      };
    }

    if (btnCancelEditItem && modalEditItem) btnCancelEditItem.onclick = () => modalEditItem.close();
    if (formEditItem) {
      formEditItem.onsubmit = async (e) => {
        e.preventDefault();
        const title = editItemTitle.value.trim();
        const url = cleanWebUrl(editItemUrl.value);
        const price = parseFloat(editItemPrice.value);
        const notes = editItemNotes.value.trim();

        if (!title || !editingItemId) return;

        await updateDoc(doc(db, "lists", listId, "items", editingItemId), {
          title,
          url: url,
          price: isNaN(price) ? null : price,
          notes: notes || null
        });

        if (modalEditItem) modalEditItem.close();
        editingItemId = null;
      };
    }

  } else {
    if (btnBackOverview) btnBackOverview.classList.add("hidden");
    if (adminPanel) adminPanel.classList.add("hidden");
    if (buyerPanel) buyerPanel.classList.remove("hidden");

    if (btnChangeBuyerName) {
      btnChangeBuyerName.onclick = () => {
        if (modalBuyerTitle) modalBuyerTitle.textContent = "Naam wijzigen";
        if (inputBuyerName) inputBuyerName.value = currentBuyerName;
        if (btnCancelBuyerName) btnCancelBuyerName.classList.remove("hidden");
        if (modalBuyerName) modalBuyerName.showModal();
      };
    }
    if (btnCancelBuyerName && modalBuyerName) btnCancelBuyerName.onclick = () => modalBuyerName.close();
  }

  if (unsubscribeListMeta) unsubscribeListMeta();
  unsubscribeListMeta = onSnapshot(doc(db, "lists", listId), (docSnap) => {
    if (!docSnap.exists()) {
      if (listTitleEl) listTitleEl.textContent = "Lijst niet gevonden";
      if (itemsListEl) itemsListEl.innerHTML = "<p class='label'>Dit verlanglijstje bestaat niet meer.</p>";
      if (buyerPanel) buyerPanel.classList.add("hidden");
      return;
    }

    const data = docSnap.data();
    if (listTitleEl) listTitleEl.textContent = data.title || "Verlanglijstje";
    currentListBuyerPin = String(data.buyerPin || "");

    if (isCurrentUserAdmin) {
      if (displayBuyerPin) displayBuyerPin.textContent = currentListBuyerPin;
      startDataListeners();
    } else {
      const cleanUrlPin = String(buyerPinFromUrl || "").trim();

      if (cleanUrlPin !== currentListBuyerPin) {
        if (buyerPanel) buyerPanel.classList.add("hidden");
        if (itemsListEl) {
          itemsListEl.innerHTML = `
            <div class="card" style="text-align: center; padding: 2rem;">
              <h3>🔒 Toegang geweigerd</h3>
              <p class="label" style="margin-top: 0.5rem;">De pincode in deze link klopt niet of ontbreekt.</p>
            </div>
          `;
        }
        return;
      }

      startDataListeners();
    }
  }, (err) => {
    console.error("Fout bij ophalen lijstmetadata:", err);
  });
}

function startDataListeners() {
  if (unsubscribeItems) unsubscribeItems();
  if (unsubscribeClaims) unsubscribeClaims();

  unsubscribeItems = onSnapshot(collection(db, "lists", listId, "items"), (snapshot) => {
    cachedItems = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    cachedItems.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : 9999;
      const orderB = b.order !== undefined ? b.order : 9999;
      return orderA - orderB;
    });

    renderItems();
  }, (err) => {
    console.error("Fout bij ophalen items:", err);
  });

  unsubscribeClaims = onSnapshot(collection(db, "lists", listId, "claims"), (snapshot) => {
    cachedClaims = {};
    snapshot.docs.forEach(docSnap => {
      cachedClaims[docSnap.id] = docSnap.data();
    });
    renderItems();
  }, (err) => {
    console.error("Fout bij ophalen claims:", err);
  });
}

function renderItems() {
  if (!itemsListEl) return;
  itemsListEl.innerHTML = "";

  const totalCount = cachedItems.length;
  const claimedCount = Object.keys(cachedClaims).length;
  const availableCount = Math.max(0, totalCount - claimedCount);

  if (!isCurrentUserAdmin && buyerStatusText) {
    const greeting = currentBuyerName ? `Hoi ${escapeHtml(currentBuyerName)}! ` : "";
    buyerStatusText.textContent = `${greeting}${availableCount} van de ${totalCount} cadeaus nog beschikbaar`;
  }

  cachedItems.forEach((item, index) => {
    const claim = cachedClaims[item.id];
    const isClaimed = !!claim;
    const isClaimedByMe = isClaimed && claim.claimedBy === currentBuyerName;

    const li = document.createElement("li");
    li.className = `item-card ${isClaimed ? "claimed" : ""}`;
    li.dataset.id = item.id;
    li.dataset.index = index;

    if (isCurrentUserAdmin) {
      li.draggable = true;
    }

    li.innerHTML = `
      <div class="item-header">
        <div class="item-title-wrap">
          ${isCurrentUserAdmin ? ICONS.drag : ""}
          <span class="item-title">${escapeHtml(item.title)}</span>
        </div>
        ${item.price ? `<span class="item-price">€ ${item.price.toFixed(2)}</span>` : ""}
      </div>
      ${item.notes ? `<p class="item-notes">${escapeHtml(item.notes)}</p>` : ""}
      ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="item-link">Bekijk product ↗</a>` : ""}
      <div class="item-actions"></div>
    `;

    const actionsContainer = li.querySelector(".item-actions");

    if (isCurrentUserAdmin) {
      if (isClaimed) {
        const badge = document.createElement("div");
        badge.className = "claim-badge-admin";

        if (showGiverNames) {
          badge.textContent = `✓ Gekozen door: ${claim.claimedBy || "Onbekend"}`;
        } else {
          badge.textContent = `✓ Gekozen (Verrassing)`;
        }
        actionsContainer.appendChild(badge);

        const btnReset = document.createElement("button");
        btnReset.className = "btn btn-text btn-small";
        btnReset.textContent = "Reservering wissen";
        btnReset.onclick = () => deleteDoc(doc(db, "lists", listId, "claims", item.id));
        actionsContainer.appendChild(btnReset);

      } else {
        const btnEdit = document.createElement("button");
        btnEdit.className = "btn-icon btn-edit";
        btnEdit.title = "Cadeau aanpassen";
        btnEdit.innerHTML = ICONS.edit;
        btnEdit.onclick = () => {
          editingItemId = item.id;
          editItemTitle.value = item.title || "";
          editItemUrl.value = item.url || "";
          editItemPrice.value = item.price || "";
          editItemNotes.value = item.notes || "";
          if (modalEditItem) modalEditItem.showModal();
        };
        actionsContainer.appendChild(btnEdit);
      }

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn-icon btn-danger btn-delete";
      btnDelete.title = "Cadeau verwijderen";
      btnDelete.innerHTML = ICONS.trash;
      btnDelete.onclick = () => deleteDoc(doc(db, "lists", listId, "items", item.id));
      actionsContainer.appendChild(btnDelete);

      attachDragEvents(li, cachedItems, renderItems, saveNewItemOrder);

    } else {
      if (!isClaimed) {
        const btnClaim = document.createElement("button");
        btnClaim.className = "btn btn-primary full-width";
        btnClaim.textContent = "🎁 Dit geef ik!";
        btnClaim.onclick = () => triggerClaimConfirmation(item);
        actionsContainer.appendChild(btnClaim);
      } else {
        const statusSpan = document.createElement("span");
        statusSpan.className = "label";
        statusSpan.textContent = isClaimedByMe ? "✓ Gereserveerd door jou" : `✓ Gereserveerd door ${claim.claimedBy}`;
        actionsContainer.appendChild(statusSpan);

        if (isClaimedByMe) {
          const btnUnclaim = document.createElement("button");
          btnUnclaim.className = "btn btn-text";
          btnUnclaim.textContent = "Vrijgeven";
          btnUnclaim.onclick = () => deleteDoc(doc(db, "lists", listId, "claims", item.id));
          actionsContainer.appendChild(btnUnclaim);
        }
      }
    }

    itemsListEl.appendChild(li);
  });
}

async function saveNewItemOrder() {
  const batch = writeBatch(db);
  cachedItems.forEach((item, index) => {
    batch.update(doc(db, "lists", listId, "items", item.id), { order: index });
  });
  await batch.commit();
}

// --- 5. CLAIM WORKFLOW ---
function triggerClaimConfirmation(item) {
  pendingClaimItemId = item.id;

  if (!currentBuyerName) {
    if (modalBuyerTitle) modalBuyerTitle.textContent = "Wie ben je?";
    if (btnCancelBuyerName) btnCancelBuyerName.classList.add("hidden");
    if (inputBuyerName) inputBuyerName.value = "";
    if (modalBuyerName) modalBuyerName.showModal();
  } else {
    if (confirmClaimText) confirmClaimText.textContent = `Weet je zeker dat je "${item.title}" wilt reserveren?`;
    if (modalConfirmClaim) modalConfirmClaim.showModal();
  }
}

if (btnCancelConfirmClaim && modalConfirmClaim) {
  btnCancelConfirmClaim.onclick = () => {
    modalConfirmClaim.close();
    pendingClaimItemId = null;
  };
}

if (formConfirmClaim) {
  formConfirmClaim.onsubmit = async (e) => {
    e.preventDefault();
    if (pendingClaimItemId && currentBuyerName) {
      await executeClaim(pendingClaimItemId, currentBuyerName);
      if (modalConfirmClaim) modalConfirmClaim.close();
      pendingClaimItemId = null;
    }
  };
}

if (formBuyerName) {
  formBuyerName.onsubmit = async (e) => {
    e.preventDefault();
    const newName = inputBuyerName.value.trim();
    if (!newName) return;

    const oldName = currentBuyerName;
    currentBuyerName = newName;
    localStorage.setItem("buyer_name", currentBuyerName);
    if (modalBuyerName) modalBuyerName.close();

    if (oldName && oldName !== newName) {
      Object.keys(cachedClaims).forEach(async (id) => {
        if (cachedClaims[id].claimedBy === oldName) {
          await updateDoc(doc(db, "lists", listId, "claims", id), { claimedBy: newName });
        }
      });
    }

    if (pendingClaimItemId) {
      const item = cachedItems.find((i) => i.id === pendingClaimItemId);
      if (item) {
        if (confirmClaimText) confirmClaimText.textContent = `Weet je zeker dat je "${item.title}" wilt reserveren?`;
        if (modalConfirmClaim) modalConfirmClaim.showModal();
      }
    }

    renderItems();
  };
}

async function executeClaim(itemId, name) {
  await setDoc(doc(db, "lists", listId, "claims", itemId), {
    claimedBy: name,
    claimedAt: serverTimestamp()
  });
}

// ===================================================
// GENERIEKE DRAG & TOUCH REORDERING
// ===================================================
let draggedEl = null;

function attachDragEvents(li, arrayRef, renderCallback, saveCallback) {
  li.ondragstart = (e) => {
    draggedEl = li;
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  };

  li.ondragend = () => {
    if (draggedEl) draggedEl.classList.remove("dragging");
    document.querySelectorAll(".item-card").forEach(el => el.classList.remove("drag-over"));
    draggedEl = null;
  };

  li.ondragover = (e) => {
    e.preventDefault();
    if (draggedEl && draggedEl !== li) {
      li.classList.add("drag-over");
    }
  };

  li.ondragleave = () => {
    li.classList.remove("drag-over");
  };

  li.ondrop = async (e) => {
    e.preventDefault();
    li.classList.remove("drag-over");
    if (!draggedEl || draggedEl === li) return;

    const fromIndex = parseInt(draggedEl.dataset.index, 10);
    const toIndex = parseInt(li.dataset.index, 10);

    const movedItem = arrayRef.splice(fromIndex, 1)[0];
    arrayRef.splice(toIndex, 0, movedItem);

    renderCallback();
    await saveCallback();
  };

  const handle = li.querySelector(".drag-handle");
  if (!handle) return;

  handle.addEventListener("touchstart", () => {
    draggedEl = li;
    li.classList.add("dragging");
  }, { passive: true });

  handle.addEventListener("touchmove", (e) => {
    const targetEl = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY)?.closest(".item-card");
    document.querySelectorAll(".item-card").forEach(el => el.classList.remove("drag-over"));
    if (targetEl && targetEl !== draggedEl) {
      targetEl.classList.add("drag-over");
    }
  }, { passive: true });

  handle.addEventListener("touchend", async (e) => {
    if (!draggedEl) return;
    draggedEl.classList.remove("dragging");
    const changedTouch = e.changedTouches[0];
    const targetEl = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY)?.closest(".item-card");
    document.querySelectorAll(".item-card").forEach(el => el.classList.remove("drag-over"));

    if (targetEl && targetEl !== draggedEl) {
      const fromIndex = parseInt(draggedEl.dataset.index, 10);
      const toIndex = parseInt(targetEl.dataset.index, 10);
      const movedItem = arrayRef.splice(fromIndex, 1)[0];
      arrayRef.splice(toIndex, 0, movedItem);
      renderCallback();
      await saveCallback();
    }
    draggedEl = null;
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, (tag) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[tag] || tag));
}
