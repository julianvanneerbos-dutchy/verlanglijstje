import { db } from "./firebase-config.js";
import { 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  setDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// --- 1. URL & PARAMETERS UITLEZEN ---
const urlParams = new URLSearchParams(window.location.search);
const listId = urlParams.get("list");
const buyerPinFromUrl = urlParams.get("pin");
const isAdmin = urlParams.get("admin") === "true";

// --- 2. DOM ELEMENTEN ---
const listTitleEl = document.getElementById("list-title");
const itemsListEl = document.getElementById("items-list");

// Dashboard elementen
const listsOverviewPanel = document.getElementById("lists-overview-panel");
const allListsContainer = document.getElementById("all-lists-container");
const btnCreateNewList = document.getElementById("btn-create-new-list");
const modalCreateList = document.getElementById("modal-create-list");
const formCreateList = document.getElementById("form-create-list");
const btnCancelList = document.getElementById("btn-cancel-list");

// Beheerder & Koper panelen
const adminPanel = document.getElementById("admin-panel");
const buyerPanel = document.getElementById("buyer-panel");
const buyerStatusText = document.getElementById("buyer-status-text");
const displayBuyerPin = document.getElementById("display-buyer-pin");
const btnShare = document.getElementById("btn-share");

// Modals voor cadeaus & koper naam
const modalAdd = document.getElementById("modal-add-item");
const btnOpenAddModal = document.getElementById("btn-open-add-modal");
const btnCloseModal = document.getElementById("btn-close-modal");
const formAddItem = document.getElementById("form-add-item");

const modalBuyerName = document.getElementById("modal-buyer-name");
const formBuyerName = document.getElementById("form-buyer-name");
const inputBuyerName = document.getElementById("input-buyer-name");

// Lokale state
let currentBuyerName = localStorage.getItem("buyer_name") || "";
let currentListBuyerPin = "";
let cachedItems = [];
let cachedClaims = {};
let pendingClaimItemId = null;


// --- 3. ROUTERING: DASHBOARD OF LIJSTWEERGAVE ---
if (!listId) {
  renderDashboard();
} else {
  renderListDetail();
}


// ==========================================
// SCENARIO A: DASHBOARD (Alle lijstjes tonen)
// ==========================================
function renderDashboard() {
  if (listsOverviewPanel) {
    listsOverviewPanel.classList.remove("hidden");
  }
  listTitleEl.textContent = "Mijn Verlanglijstjes";

  // Realtime luisteren naar alle beschikbare lijsten
  onSnapshot(collection(db, "lists"), (snapshot) => {
    allListsContainer.innerHTML = "";
    if (snapshot.empty) {
      allListsContainer.innerHTML = "<p class='label'>Nog geen verlanglijstjes aangemaakt.</p>";
      return;
    }

    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const li = document.createElement("li");
      li.className = "item-card";
      li.style.cursor = "pointer";
      li.innerHTML = `
        <div class="item-header">
          <strong class="item-title">${escapeHtml(data.title || "Naamloos lijstje")}</strong>
          <span class="label">PIN: ${data.buyerPin || "----"}</span>
        </div>
      `;
      // Doorklikken opent de lijst direct als beheerder
      li.onclick = () => {
        window.location.search = `?admin=true&list=${docSnap.id}`;
      };
      allListsContainer.appendChild(li);
    });
  });

  // Modal voor het aanmaken van een nieuwe lijst
  if (btnCreateNewList && modalCreateList) {
    btnCreateNewList.onclick = () => modalCreateList.showModal();
    if (btnCancelList) {
      btnCancelList.onclick = () => modalCreateList.close();
    }

    formCreateList.onsubmit = async (e) => {
      e.preventDefault();
      const titleInput = document.getElementById("new-list-title").value.trim();
      if (!titleInput) return;

      // Automatisch een willekeurige 4-cijferige kopers-PIN genereren
      const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();

      const docRef = await addDoc(collection(db, "lists"), {
        title: titleInput,
        buyerPin: generatedPin,
        createdAt: serverTimestamp()
      });

      modalCreateList.close();
      window.location.search = `?admin=true&list=${docRef.id}`;
    };
  }
}


// ===================================================
// SCENARIO B: LIJSTWEERGAVE (Cadeaus & Reserveringen)
// ===================================================
function renderListDetail() {
  // 1. Luister naar de metadata van de specifieke lijst (titel & PIN)
  onSnapshot(doc(db, "lists", listId), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      listTitleEl.textContent = data.title || "Verlanglijstje";
      currentListBuyerPin = data.buyerPin || "";
      if (isAdmin && displayBuyerPin) {
        displayBuyerPin.textContent = currentListBuyerPin;
      }
    } else {
      listTitleEl.textContent = "Lijst niet gevonden";
    }
  });

  // 2. Beheerder weergave inrichten
  if (isAdmin) {
    adminPanel.classList.remove("hidden");

    btnShare.onclick = () => {
      const shareUrl = `${window.location.origin}${window.location.pathname}?list=${listId}&pin=${currentListBuyerPin}`;
      const shareText = `Bekijk het verlanglijstje en streep cadeautjes af via: ${shareUrl}`;

      if (navigator.share) {
        navigator.share({ title: "Verlanglijst", text: shareText, url: shareUrl });
      } else {
        navigator.clipboard.writeText(shareUrl);
        alert("Deellink gekopieerd naar klembord!");
      }
    };

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
        title: title,
        url: url || null,
        price: isNaN(price) ? null : price,
        notes: notes || null,
        createdAt: serverTimestamp()
      });

      formAddItem.reset();
      modalAdd.close();
    };
  } else {
    // Familie / Koper weergave
    buyerPanel.classList.remove("hidden");
  }

  // 3. Realtime luisteren naar items
  onSnapshot(collection(db, "lists", listId, "items"), (snapshot) => {
    cachedItems = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderItems();
  });

  // 4. Realtime luisteren naar claims (alleen kopers luisteren hiernaar om verrassing intact te houden)
  if (!isAdmin) {
    onSnapshot(collection(db, "lists", listId, "claims"), (snapshot) => {
      cachedClaims = {};
      snapshot.docs.forEach((docSnap) => {
        cachedClaims[docSnap.id] = docSnap.data();
      });
      renderItems();
    });
  }
}


// --- 4. CADEAUS RENDERING & INTERACTIE ---
function renderItems() {
  itemsListEl.innerHTML = "";

  if (!isAdmin && buyerStatusText) {
    const totalCount = cachedItems.length;
    const claimedCount = Object.keys(cachedClaims).length;
    const availableCount = Math.max(0, totalCount - claimedCount);
    buyerStatusText.textContent = `${availableCount} van de ${totalCount} cadeaus nog beschikbaar`;
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

    if (isAdmin) {
      // Acties voor beheerder: blinde reset of verwijderen
      const btnReset = document.createElement("button");
      btnReset.className = "btn btn-text";
      btnReset.textContent = "Reset reservering";
      btnReset.onclick = () => deleteDoc(doc(db, "lists", listId, "claims", item.id));

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn btn-text";
      btnDelete.textContent = "🗑️ Verwijderen";
      btnDelete.onclick = () => deleteDoc(doc(db, "lists", listId, "items", item.id));

      actionsContainer.append(btnReset, btnDelete);
    } else {
      // Acties voor koper (familie)
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


// --- 5. CLAIM AFHANDELING & EENMALIG NAAM VRAGEN ---
function handleClaimClick(itemId) {
  if (!currentBuyerName) {
    pendingClaimItemId = itemId;
    modalBuyerName.showModal();
  } else {
    executeClaim(itemId, currentBuyerName);
  }
}

if (formBuyerName) {
  formBuyerName.onsubmit = (e) => {
    e.preventDefault();
    const name = inputBuyerName.value.trim();
    if (name) {
      currentBuyerName = name;
      localStorage.setItem("buyer_name", currentBuyerName);
      modalBuyerName.close();

      if (pendingClaimItemId) {
        executeClaim(pendingClaimItemId, currentBuyerName);
        pendingClaimItemId = null;
      }
    }
  };
}

async function executeClaim(itemId, name) {
  await setDoc(doc(db, "lists", listId, "claims", itemId), {
    claimedBy: name,
    claimedAt: serverTimestamp()
  });
}

// XSS protectie helper
function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, (tag) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[tag] || tag));
}
