import { db } from "./firebase-config.js";
import { 
  collection, doc, onSnapshot, addDoc, deleteDoc, setDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// 1. Rollen en URL parsing
const urlParams = new URLSearchParams(window.location.search);
const listId = urlParams.get("list") || "familie-lijst"; // Standaard lijst ID
const buyerPinFromUrl = urlParams.get("pin");
const isAdmin = urlParams.get("admin") === "true"; // In echte app beveiligen via PIN/Auth

let currentBuyerName = localStorage.getItem("buyer_name") || "";
let cachedItems = [];
let cachedClaims = {};
let pendingClaimItemId = null;

// UI elementen
const itemsListEl = document.getElementById("items-list");
const adminPanel = document.getElementById("admin-panel");
const buyerPanel = document.getElementById("buyer-panel");
const displayBuyerPin = document.getElementById("display-buyer-pin");
const btnShare = document.getElementById("btn-share");
const modalAdd = document.getElementById("modal-add-item");
const modalBuyerName = document.getElementById("modal-buyer-name");

// 2. Initialisatie UI per rol
if (isAdmin) {
  adminPanel.classList.remove("hidden");
  const activeBuyerPin = "5521"; // Uit list document ophalen
  displayBuyerPin.textContent = activeBuyerPin;

  btnShare.addEventListener("click", () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?list=${listId}&pin=${activeBuyerPin}`;
    const text = `Bekijk het verlanglijstje en streep cadeautjes af via: ${shareUrl}`;
    
    if (navigator.share) {
      navigator.share({ title: "Verlanglijst", text, url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl);
      alert("Deellink gekopieerd naar klembord!");
    }
  });

  document.getElementById("btn-open-add-modal").onclick = () => modalAdd.showModal();
  document.getElementById("btn-close-modal").onclick = () => modalAdd.close();
  
  document.getElementById("form-add-item").onsubmit = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "lists", listId, "items"), {
      title: document.getElementById("item-title").value,
      url: document.getElementById("item-url").value || null,
      price: parseFloat(document.getElementById("item-price").value) || null,
      notes: document.getElementById("item-notes").value || null,
      createdAt: serverTimestamp()
    });
    e.target.reset();
    modalAdd.close();
  };
} else {
  // Familie / Koper weergave
  buyerPanel.classList.remove("hidden");
}

// 3. Realtime Luisteren naar Items
onSnapshot(collection(db, "lists", listId, "items"), (snapshot) => {
  cachedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  render();
});

// 4. Realtime Luisteren naar Claims (Alleen als koper, admin luistert hier NIET naar)
if (!isAdmin) {
  onSnapshot(collection(db, "lists", listId, "claims"), (snapshot) => {
    cachedClaims = {};
    snapshot.docs.forEach(doc => { cachedClaims[doc.id] = doc.data(); });
    render();
  });
}

// 5. Render Logica
function render() {
  itemsListEl.innerHTML = "";
  
  cachedItems.forEach(item => {
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
      // Admin acties: reset reservering of verwijderen
      const btnReset = document.createElement("button");
      btnReset.className = "btn btn-text";
      btnReset.textContent = "Reset reservering";
      btnReset.onclick = () => deleteDoc(doc(db, "lists", listId, "claims", item.id));

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn btn-text";
      btnDelete.textContent = "🗑️";
      btnDelete.onclick = () => deleteDoc(doc(db, "lists", listId, "items", item.id));

      actionsContainer.append(btnReset, btnDelete);
    } else {
      // Koper acties
      if (!isClaimed) {
        const btnClaim = document.createElement("button");
        btnClaim.className = "btn btn-primary full-width";
        btnClaim.textContent = "🎁 Dit koop ik!";
        btnClaim.onclick = () => handleClaimClick(item.id);
        actionsContainer.appendChild(btnClaim);
      } else {
        const statusText = document.createElement("span");
        statusText.className = "label";
        statusText.textContent = isClaimedByMe ? "✓ Gereserveerd door jou" : `✓ Gereserveerd door ${claim.claimedBy}`;
        actionsContainer.appendChild(statusText);

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

// 6. Claim afhandeling & Naam popup
function handleClaimClick(itemId) {
  if (!currentBuyerName) {
    pendingClaimItemId = itemId;
    modalBuyerName.showModal();
  } else {
    executeClaim(itemId, currentBuyerName);
  }
}

document.getElementById("form-buyer-name").onsubmit = (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("input-buyer-name").value.trim();
  if (nameInput) {
    currentBuyerName = nameInput;
    localStorage.setItem("buyer_name", currentBuyerName);
    modalBuyerName.close();
    if (pendingClaimItemId) {
      executeClaim(pendingClaimItemId, currentBuyerName);
      pendingClaimItemId = null;
    }
  }
};

async function executeClaim(itemId, name) {
  await setDoc(doc(db, "lists", listId, "claims", itemId), {
    claimedBy: name,
    claimedAt: serverTimestamp()
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}
