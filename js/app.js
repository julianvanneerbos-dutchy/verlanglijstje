
// --- CHANGELOG & VERSIENUMMER LOGICA ---

// 1. Functie die meteen bij het opstarten het nieuwste versienummer ophaalt
async function loadLatestVersion() {
  try {
    const res = await fetch("./changelog.json?v=" + Date.now());
    if (!res.ok) return;
    const releases = await res.json();
    // Pakt het eerste item uit de lijst (bijv. v1.4.0) en zet het in de badge
    if (Array.isArray(releases) && releases.length > 0 && releases[0].version) {
      if (appVersionBadge) {
        appVersionBadge.textContent = releases[0].version;
      }
    }
  } catch (err) {
    console.warn("Kon versienummer niet ophalen:", err);
  }
}

// 2. Roep de functie direct aan zodra de app opstart
loadLatestVersion();

// 3. Als je op de knop klikt, open de pop-up en toon alle versies uit changelog.json
if (btnOpenReleases) {
  btnOpenReleases.onclick = async () => {
    modalReleaseNotes.showModal();
    try {
      const res = await fetch("./changelog.json?v=" + Date.now());
      if (!res.ok) throw new Error("Kon changelog niet ophalen");
      const releases = await res.json();
      renderReleaseNotes(releases);
    } catch (err) {
      releaseNotesContainer.innerHTML = "<p class='label'>Kon updates niet inladen.</p>";
    }
  };
}

// 4. Sluitknop van de pop-up
if (btnCloseReleases) {
  btnCloseReleases.onclick = () => modalReleaseNotes.close();
}

function renderReleaseNotes(releases) {
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
        <span class="release-version">${escapeHtml(rel.version)}</span>
        <span class="release-date">${escapeHtml(rel.date)}</span>
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
    btnLogout.classList.remove("hidden");
    if (adminFooter) adminFooter.classList.remove("hidden");
    btnLogout.onclick = async () => {
      await signOut(auth);
      window.location.reload();
    };
  } else {
    btnLogout.classList.add("hidden");
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

  formAdminLogin.onsubmit = async (e) => {
    e.preventDefault();
    loginError.style.display = "none";
    const pin = inputAdminPin.value.trim();

    try {
      await setPersistence(auth, browserLocalPersistence);
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
      modalEditList.showModal();
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

    // Toevoegen modal
    btnOpenAddModal.onclick = () => modalAdd.showModal();
    btnCloseModal.onclick = () => modalAdd.close();

    formAddItem.onsubmit = async (e) => {
      e.preventDefault();
      const title = document.getElementById("item-title").value.trim();
      const rawUrl = document.getElementById("item-url").value;
      const url = cleanWebUrl(rawUrl);
      const price = parseFloat(document.getElementById("item-price").value);
      const notes = document.getElementById("item-notes").value.trim();

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
      modalAdd.close();
    };

    // Bewerken modal
    btnCancelEditItem.onclick = () => modalEditItem.close();
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

  // Metadata luisteren & PIN check
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

    // Sorteren op order
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
          modalEditItem.showModal();
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

// --- 5. CLAIM WORKFLOW MET BEVESTIGINGSDIALOOG ---
function triggerClaimConfirmation(item) {
  pendingClaimItemId = item.id;

  if (!currentBuyerName) {
    modalBuyerTitle.textContent = "Wie ben je?";
    btnCancelBuyerName.classList.add("hidden");
    inputBuyerName.value = "";
    modalBuyerName.showModal();
  } else {
    confirmClaimText.textContent = `Weet je zeker dat je "${item.title}" wilt reserveren?`;
    modalConfirmClaim.showModal();
  }
}

btnCancelConfirmClaim.onclick = () => {
  modalConfirmClaim.close();
  pendingClaimItemId = null;
};

formConfirmClaim.onsubmit = async (e) => {
  e.preventDefault();
  if (pendingClaimItemId && currentBuyerName) {
    await executeClaim(pendingClaimItemId, currentBuyerName);
    modalConfirmClaim.close();
    pendingClaimItemId = null;
  }
};

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
      const item = cachedItems.find((i) => i.id === pendingClaimItemId);
      if (item) {
        confirmClaimText.textContent = `Weet je zeker dat je "${item.title}" wilt reserveren?`;
        modalConfirmClaim.showModal();
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
