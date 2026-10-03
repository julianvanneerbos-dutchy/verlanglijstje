# 🎁 Verlanglijstje App

Een moderne, lichte en privacyvriendelijke Progressive Web App (PWA) om verlanglijstjes voor het hele gezin te beheren en te delen. 

Gebouwd zonder zware frameworks: pure HTML5, moderne CSS en vanilla JavaScript, aangedreven door Firebase Firestore en Firebase Authentication.

---

## ✨ Functionaliteiten

### 👑 Beheerder (Admin)
- **Beveiligde toegang:** Beheerder logt in met een eigen account en pincode via Firebase Authentication.
- **Meerdere lijstjes beheren:** Maak eenvoudig meerdere verlanglijstjes aan (bijv. per gezinslid of gelegenheid).
- **Volgorde bepalen (Drag & Drop):** Sorteer zowel de lijstjes als de individuele cadeaus handmatig via muis of touch (sleephendel).
- **Cadeaus bewerken & verwijderen:** Pas titels, richtprijzen, URLs en notities aan zolang een item nog niet gekozen is.
- **Slimme URL-opschoning:** Plak gerust links zonder `https://` (bijv. direct vanaf de Bol.com-app). Tracking-parameters (`utm_*`, affiliate-tags) worden automatisch verwijderd voor een schone, werkende link.
- **Verrassingsmodus (Toggle):** Bepaal zelf of je wilt zien wie welk cadeau reserveert of dat je dit verborgen houdt tot het feestje (`✓ Gekozen (Verrassing)`).
- **Ingebouwde release notes:** Direct inzicht in recente updates via de *"Wat is er nieuw?"*-knop onderaan het dashboard.

### 👥 Familie & Kopers
- **Geen account nodig:** Familieleden openen de gedeelde link (met unieke lijst-PIN) en worden geruisloos anoniem aangemeld.
- **Cadeau reserveren:** Duidelijke knop om een item te claimen, inclusief een bevestigingsvenster om per ongeluk reserveren tijdens scrollen te voorkomen.
- **Naam onthouden:** Familieleden vullen eenmalig hun naam of rol in (bijv. *Oma* of *Tante Els*), die lokaal bewaard blijft.
- **Direct realtime overzicht:** Zie meteen hoeveel cadeaus er nog beschikbaar zijn en welke al gereserveerd zijn.

### 📱 Mobiel & PWA
- **Installeerbaar:** Werkt als Progressive Web App (PWA) met een eigen startscherm-icoon via `manifest.json`.
- **Systeembalk-optimalisatie:** Ondersteunt veilige marges (`env(safe-area-inset-bottom)`) en lichte modus (`color-scheme: light`) zodat Android- en iOS-navigatieknoppen scherp en zichtbaar blijven.

---

## 🛠️ Gebruikte Technologieën

- **Frontend:** Vanilla HTML5, Modern CSS (CSS Grid/Flexbox, Custom Properties), Vanilla JavaScript (ES Modules).
- **Backend / Database:** Firebase Firestore (realtime synchronisatie via document listeners).
- **Authenticatie:** Firebase Auth (Email/Wachtwoord voor beheer, Anoniem voor familieleden).
- **Hosting:** GitHub Pages.

---

## 📁 Bestandsstructuur

```text
├── css/
│   └── style.css            # Moderne layout, cards, CSS-variabelen en animaties
├── js/
│   ├── app.js               # Applicatielogica, drag & drop, modals en Firestore listeners
│   └── firebase-config.js   # Firebase API-sleutels en initialisatie
├── index.html               # Hoofdstructuur en modale dialogen
├── manifest.json            # PWA-configuratie (appnaam, start-URL, thema en iconen)
├── releases.json            # Versiehistorie voor de "Wat is er nieuw?" dialoog
├── sw.js                    # Minimaal service worker-bestand voor PWA-installatie
└── README.md
