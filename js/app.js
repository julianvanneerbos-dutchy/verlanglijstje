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
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// --- 1. CONFIGURATIE & STATE ---
const auth = getAuth();
const ADMIN_EMAIL = "julian.vanneerbos@gmail.com";

const urlParams = new URLSearchParams(window.location.search);
const listId = urlParams.get("list");
const buyerPinFromUrl = urlParams.get("pin");

let isCurrentUserAdmin = false;
let currentBuyerName = localStorage.getItem("buyer_name") || "";
// Standaard UIT (false) tenzij expliciet op true gezet door gebruiker
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

// Login Modal (Admin)
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

// Bewerk modal (Lijst)
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

// Cadeau toevoegen & bewerken modals
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

// Koper modal (Familie)
const modalBuyerName = document.getElementById("modal-buyer-name");
const modalBuyerTitle = document.getElementById("modal-buyer-title");
const formBuyerName = document.getElementById("form-buyer-name");
const inputBuyerName = document.getElementById("input-buyer-name");
const btnCancelBuyerName = document.getElementById("btn-cancel-buyer-name");

// Toggle setup
if (toggleShowNames) {
  toggleShowNames.checked = showGiverNames;
  toggleShowNames.addEventListener("change", () => {
    showGiverNames = toggleShowNames.checked;
    localStorage.setItem("show_giver_names", showGiverNames ? "true" : "false");
    renderItems();
  });
}


// --- 2. AUTHENTICATION & ROUTERING ---
onAuthStateChanged(auth, async (user) => {
  const urlHasPin = urlParams.has("pin");
  isCurrentUserAdmin = !!(user && user.email === ADMIN_EMAIL && !urlHasPin);

  if (isCurrentUserAdmin) {
    btnLogout.classList.remove("hidden");
    btnLogout.onclick = async () => {
      await signOut(auth);
      window.location.reload();
    };
  } else {
    btnLogout.classList.add("hidden");
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

  formAdminLogin.onsubmit = async (e) => {
    e.preventDefault();
    loginError.style.display = "none";
    const pin = inputAdminPin.value.trim();

    try {
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, pin);
      modalAdminLogin.close();
      inputAdminPin.value = "";
    } catch (err) {
      loginError.style.display = "block";
      inputAdminPin.value = "";
    }
  };
}


// ==========================================
// SCENARIO A: DASHBOARD (Alleen Beheerder)
// ==========================================
function renderDashboard() {
  if (listsOverviewPanel) listsOverviewPanel.classList.remove("hidden");
  listTitleEl.textContent = "Mijn Verlanglijstjes";
  btnBackOverview.classList.add("hidden");
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

  btnCreateNewList.onclick = () => modalCreateList.showModal();
  btnCancelList.onclick = () => modalCreateList.close();

  formCreateList.onsubmit = async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById("new-list-title").value.trim();
    if (!titleInput) return;

    const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
    const newOrderIndex = cachedLists.length;

    const docRef = await addDoc(collection(db, "lists"), {
      title: titleInput,
      buyerPin: generatedPin,
      order: newOrderIndex,
      createdAt: serverTimestamp()
    });

    modalCreateList.close();
    window.location.search = `?list=${docRef.id}`;
  };

  btnCancelEditList.onclick = () => modalEditList.close();
  formEditList.onsubmit = async (e) => {
    e.preventDefault();
    const newTitle = editListTitleInput.value.trim();
    if (newTitle && editingListId) {
      await updateDoc(doc(db, "lists", editingListId), { title: newTitle });
      modalEditList.close();
      editingListId = null;
    }
  };
}

function renderListsCards() {
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
          <span class="drag-handle" title="Sleep om te sorteren">☰</span>
          <div>
            <strong class="item-title">${escapeHtml(item.title || "Naamloos")}</strong>
            <span class="label" style="display: block;">PIN: ${item.buyerPin || "----"}</span>
          </div>
        </div>
        <div class="list-actions">
          <button class="btn btn-text btn-edit" title="Lijstnaam bewerken">✏️</button>
          <button class="btn btn-danger btn-delete" title="Lijst verwijderen">🗑️️</button>
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
      modalEditList.showModal();
    };

    li.querySelector(".btn-delete").onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`Weet je zeker dat je "${item.title}" wilt verwijderen?`)) {
        await deleteDoc(doc(db, "lists", item.id));
      }
    };

    attachDragEvents(li);
    allListsContainer.appendChild(li);
  });
}

// Drag & Drop (Muis + Touch)
let draggedEl = null;

function attachDragEvents(li) {
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

    const movedItem = cachedLists.splice(fromIndex, 1)[0];
    cachedLists.splice(toIndex, 0, movedItem);

    renderListsCards();
    await saveNewListOrder();
  };

  const handle = li.querySelector(".drag-handle");
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
      const movedItem = cachedLists.splice(fromIndex, 1)[0];
      cachedLists.splice(toIndex, 0, movedItem);
      renderListsCards();
      await saveNewListOrder();
    }
    draggedEl = null;
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
// SCENARIO B: LIJSTWEERGAVE (Cadeaus & Claims)
// ===================================================
function renderListDetail() {
  if (listsOverviewPanel) listsOverviewPanel.classList.add("hidden");

  if (isCurrentUserAdmin) {
    btnBackOverview.classList.remove("hidden");
    btnBackOverview.onclick = () => { window.location.search = ""; };
    adminPanel.classList.remove("hidden");
    buyerPanel.classList.add("hidden");

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

    // Cadeau toevoegen modal
    btnOpenAddModal.onclick = () => modalAdd.showModal();
    btnCloseModal.onclick = () => modalAdd.close();

    formAddItem.onsubmit = async (e) => {
      e.preventDefault();
      const title = document.getElementById("item-title").value.trim();
      const url = document.getElementById("item-url").value.trim();
      const price = parseFloat(document.getElementById("item-price").value);
      const notes = document.getElementById("item-notes").value.trim();

      if (!title) return;

      await addDoc(collection(db, "lists", listId, "items"), {
        title,
        url: url || null,
        price: isNaN(price) ? null : price,
        notes: notes || null,
        createdAt: serverTimestamp()
      });

      formAddItem.reset();
      modalAdd.close();
    };

    // Cadeau bewerken modal
    btnCancelEditItem.onclick = () => modalEditItem.close();
    formEditItem.onsubmit = async (e) => {
      e.preventDefault();
      const title = editItemTitle.value.trim();
      const url = editItemUrl.value.trim();
      const price = parseFloat(editItemPrice.value);
      const notes = editItemNotes.value.trim();

      if (!title || !editingItemId) return;

      await updateDoc(doc(db, "lists", listId, "items", editingItemId), {
        title,
        url: url || null,
        price: isNaN(price) ? null : price,
        notes: notes || null
      });

      modalEditItem.close();
      editingItemId = null;
    };

  } else {
    // Familie / Koper weergave
    btnBackOverview.classList.add("hidden");
    adminPanel.classList.add("hidden");
    buyerPanel.classList.remove("hidden");

    btnChangeBuyerName.onclick = () => {
      modalBuyerTitle.textContent = "Naam wijzigen";
      inputBuyerName.value = currentBuyerName;
      btnCancelBuyerName.classList.remove("hidden");
      modalBuyerName.showModal();
    };
    btnCancelBuyerName.onclick = () => modalBuyerName.close();
  }

  // Metadata luisteren en PIN check
  if (unsubscribeListMeta) unsubscribeListMeta();
  unsubscribeListMeta = onSnapshot(doc(db, "lists", listId), (docSnap) => {
    if (!docSnap.exists()) {
      listTitleEl.textContent = "Lijst niet gevonden";
      itemsListEl.innerHTML = "<p class='label'>Dit verlanglijstje bestaat niet meer.</p>";
      buyerPanel.classList.add("hidden");
      return;
    }

    const data = docSnap.data();
    listTitleEl.textContent = data.title || "Verlanglijstje";
    currentListBuyerPin = String(data.buyerPin || "");

    if (isCurrentUserAdmin) {
      if (displayBuyerPin) displayBuyerPin.textContent = currentListBuyerPin;
      startDataListeners();
    } else {
      const cleanUrlPin = String(buyerPinFromUrl || "").trim();

      if (cleanUrlPin !== currentListBuyerPin) {
        buyerPanel.classList.add("hidden");
        itemsListEl.innerHTML = `
          <div class="card" style="text-align: center; padding: 2rem;">
            <h3>🔒 Toegang geweigerd</h3>
            <p class="label" style="margin-top: 0.5rem;">De pincode in deze link klopt niet of ontbreekt.</p>
          </div>
        `;
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
  itemsListEl.innerHTML = "";

  const totalCount = cachedItems.length;
  const claimedCount = Object.keys(cachedClaims).length;
  const availableCount = Math.max(0, totalCount - claimedCount);

  if (!isCurrentUserAdmin && buyerStatusText) {
    const greeting = currentBuyerName ? `Hoi ${escapeHtml(currentBuyerName)}! ` : "";
    buyerStatusText.textContent = `${greeting}${availableCount} van de ${totalCount} cadeaus nog beschikbaar`;
  }

  cachedItems.forEach((item) => {
    const claim = cachedClaims[item.id];
    const isClaimed = !!claim;
    const isClaimedByMe = isClaimed && claim.claimedBy === currentBuyerName;

    const li = document.createElement("li");
    li.className = `item-card ${isClaimed ? "claimed" : ""}`;

    li.innerHTML = `
      <div class="item-header">
        <span class="item-title">${escapeHtml(item.title)}</span>
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

        // Respecteer de toggle
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
        // Alleen aanpassen als het cadeau nog openstaat
        const btnEdit = document.createElement("button");
        btnEdit.className = "btn btn-text btn-small";
        btnEdit.textContent = "✏️ Aanpassen";
        btnEdit.onclick = () => {
          editingItemId = item.id;
          editItemTitle.value = item.title || "";
          editItemUrl.value = item.url || "";
          editItemPrice.value = item.price || "";
          editItemNotes.value = item.notes || "";
          modalEditItem.showModal();
        };
        actionsContainer.appendChild(btnEdit);
      }

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn btn-text btn-danger btn-small";
      btnDelete.textContent = "🗑️ Verwijderen";
      btnDelete.onclick = () => deleteDoc(doc(db, "lists", listId, "items", item.id));
      actionsContainer.appendChild(btnDelete);

    } else {
      // Familie / Koper interface
      if (!isClaimed) {
        const btnClaim = document.createElement("button");
        btnClaim.className = "btn btn-primary full-width";
        btnClaim.textContent = "🎁 Dit koop ik!";
        btnClaim.onclick = () => handleClaimClick(item.id);
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

function handleClaimClick(itemId) {
  if (!currentBuyerName) {
    pendingClaimItemId = itemId;
    modalBuyerTitle.textContent = "Wie ben je?";
    btnCancelBuyerName.classList.add("hidden");
    inputBuyerName.value = "";
    modalBuyerName.showModal();
  } else {
    executeClaim(itemId, currentBuyerName);
  }
}

if (formBuyerName) {
  formBuyerName.onsubmit = async (e) => {
    e.preventDefault();
    const newName = inputBuyerName.value.trim();
    if (!newName) return;

    const oldName = currentBuyerName;
    currentBuyerName = newName;
    localStorage.setItem("buyer_name", currentBuyerName);
    modalBuyerName.close();

    if (oldName && oldName !== newName) {
      Object.keys(cachedClaims).forEach(async (id) => {
        if (cachedClaims[id].claimedBy === oldName) {
          await updateDoc(doc(db, "lists", listId, "claims", id), { claimedBy: newName });
        }
      });
    }

    if (pendingClaimItemId) {
      executeClaim(pendingClaimItemId, currentBuyerName);
      pendingClaimItemId = null;
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

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, (tag) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[tag] || tag));
}
