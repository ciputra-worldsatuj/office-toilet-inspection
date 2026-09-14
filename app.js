// GANTI DENGAN URL DEPLOYMENT GOOGLE APPS SCRIPT WEB APP ANDA
const GAS_URL = "https://script.google.com/macros/s/AKfycbwE8E0Ez_8-lFoOAVfQq1Or_0cp9cgpRrKnSXqTHAclckabB3i6Ddh4-V60Jp278PKwXQ/exec";

// APP STATE
let currentLocation = { lantai: null, jenis: null };
let db = null;
let html5QrCode = null;

// REGISTER SERVICE WORKER
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

// INITIALIZE INDEXEDDB
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ToiletInspectionDB", 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("inspections")) {
        db.createObjectStore("inspections", { keyPath: "uuid" });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      updatePendingCount();
      resolve();
    };
    request.onerror = (e) => reject(e);
  });
}

// CONNECTION STATUS CHECK (HEALTH CHECK + ONLINE EVENT)
async function checkConnection() {
  const badge = document.getElementById("connection-status");
  if (!navigator.onLine) {
    badge.className = "status-badge offline";
    badge.innerText = "🔴 OFFLINE";
    return;
  }
  
  try {
    const res = await fetch(`${GAS_URL}?action=ping`, { method: "GET" });
    if (res.ok) {
      badge.className = "status-badge online";
      badge.innerText = "🟢 ONLINE";
    } else {
      throw new Error();
    }
  } catch (err) {
    badge.className = "status-badge offline";
    badge.innerText = "🔴 OFFLINE";
  }
}

window.addEventListener("online", checkConnection);
window.addEventListener("offline", checkConnection);
setInterval(checkConnection, 15000); // Check every 15s

// FETCH LEADERS FROM GAS (FALLBACK TO HARDCODED IF OFFLINE)
async function fetchLeaders() {
  const select = document.getElementById("nama_leader");
  try {
    const res = await fetch(`${GAS_URL}?action=getLeaders`);
    const json = await res.json();
    if (json.status === "SUCCESS" && json.leaders.length > 0) {
      select.innerHTML = '<option value="">-- Pilih Leader --</option>';
      json.leaders.forEach(l => {
        select.innerHTML += `<option value="${l}">${l}</option>`;
      });
      return;
    }
  } catch (e) {}
  
  // Hardcoded Fallback
  select.innerHTML = `
    <option value="">-- Pilih Leader --</option>
    <option value="Ade">Ade</option>
    <option value="Rowinah">Rowinah</option>
    <option value="Fikri">Fikri</option>
    <option value="Hendra">Hendra</option>
  `;
}

// QR SCANNER & LOCATION PARSER
function startScanner() {
  document.getElementById("qr-reader").classList.remove("hidden");
  document.getElementById("scan-error").classList.add("hidden");

  html5QrCode = new Html5Qrcode("qr-reader");
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    (decodedText) => {
      parseLocationCode(decodedText);
      html5QrCode.stop().then(() => {
        document.getElementById("qr-reader").classList.add("hidden");
      });
    },
    () => {}
  ).catch(err => {
    alert("Kamera tidak dapat diakses.");
  });
}

function parseLocationCode(code) {
  // Pattern: OF1-(LB1|LBY|L08..L40)-(M|W|V)
  const regex = /^OF1-(LB1|LBY|L(?:0[8-9]|[1-3][0-9]|40))-(M|W|V)$/;
  const match = code.trim().match(regex);

  const errorBox = document.getElementById("scan-error");
  const infoBox = document.getElementById("location-info");
  const form = document.getElementById("inspection-form");

  if (!match) {
    errorBox.classList.remove("hidden");
    infoBox.classList.add("hidden");
    form.classList.add("hidden");
    return;
  }

  errorBox.classList.add("hidden");
  const rawLantai = match[1];
  const rawJenis = match[2];

  // Formatting display
  let lantaiText = rawLantai;
  if (rawLantai === "LB1") lantaiText = "BASEMENT 1";
  else if (rawLantai === "LBY") lantaiText = "LOBBY";
  else lantaiText = "LANTAI " + parseInt(rawLantai.replace("L", ""));

  let jenisText = "PRIA";
  if (rawJenis === "W") jenisText = "WANITA";
  if (rawJenis === "V") jenisText = "VIP";

  currentLocation = { lantai: rawLantai, jenis: jenisText };

  document.getElementById("lbl-lantai").innerText = lantaiText;
  document.getElementById("lbl-jenis").innerText = jenisText;
  infoBox.classList.remove("hidden");

  renderChecklist(jenisText);
  form.classList.remove("hidden");
}

// RENDER DYNAMIC CHECKLIST
const COMMON_ITEMS = [
  { id: "bau_ruangan", label: "Bau Ruangan", green: "Wangi", red: "Bau" },
  { id: "lantai_kondisi", label: "Kondisi Lantai", green: "Bersih", red: "Kotor" },
  { id: "dinding", label: "Dinding", green: "Bersih", red: "Kotor" },
  { id: "tempat_sampah", label: "Tempat Sampah", green: "Bersih", red: "Kotor" },
  { id: "wastafel", label: "Wastafel", green: "Bersih", red: "Kotor" },
  { id: "cermin_wastafel", label: "Cermin Wastafel", green: "Bersih", red: "Kotor" },
  { id: "hand_soap", label: "Hand Soap", green: "Isi", red: "Kosong" },
  { id: "tissue", label: "Tissue", green: "Isi", red: "Kosong" },
  { id: "floor_drain", label: "Floor Drain", green: "Bersih", red: "Kotor" }
];

function renderChecklist(jenisToilet) {
  const container = document.getElementById("checklist-container");
  container.innerHTML = "";

  let items = [...COMMON_ITEMS];
  if (jenisToilet === "PRIA") {
    items.push({ id: "hand_dryer", label: "Hand Dryer", green: "Bersih", red: "Kotor" });
    items.push({ id: "urinal", label: "Urinal", green: "Bersih", red: "Kotor" });
  } else if (jenisToilet === "WANITA") {
    items.push({ id: "hand_dryer", label: "Hand Dryer", green: "Bersih", red: "Kotor" });
  } else if (jenisToilet === "VIP") {
    items.push({ id: "shower_room", label: "Shower Room", green: "Bersih", red: "Kotor" });
  }

  items.forEach(item => {
    container.innerHTML += `
      <div class="toggle-item">
        <span class="toggle-label">${item.label}</span>
        <div class="switch-group" data-id="${item.id}">
          <button type="button" class="switch-btn active-green" onclick="setToggle(this, '${item.green}', 'green')">${item.green}</button>
          <button type="button" class="switch-btn" onclick="setToggle(this, '${item.red}', 'red')">${item.red}</button>
        </div>
      </div>
    `;
  });
}

function setToggle(btn, val, color) {
  const parent = btn.parentElement;
  const buttons = parent.querySelectorAll(".switch-btn");
  buttons.forEach(b => b.className = "switch-btn");
  
  if (color === "green") {
    btn.className = "switch-btn active-green";
  } else {
    btn.className = "switch-btn active-red";
  }
}

// SAVE TO INDEXEDDB
async function saveOffline(e) {
  e.preventDefault();
  if (!currentLocation.lantai) {
    alert("Silakan scan barcode lokasi terlebih dahulu!");
    return;
  }

  // Base64 Converter for Photo Evidence
  const fileInput = document.getElementById("foto_file");
  let fotoBase64 = "";
  if (fileInput.files.length > 0) {
    fotoBase64 = await toBase64(fileInput.files[0]);
  }

  // Collect Checklist values
  const checklistData = {};
  document.querySelectorAll(".switch-group").forEach(group => {
    const id = group.getAttribute("data-id");
    const activeBtn = group.querySelector(".active-green, .active-red");
    checklistData[id] = activeBtn ? activeBtn.innerText : "-";
  });

  // Timestamp perangkat (YYYY-MM-DD HH:mm:ss)
  const now = new Date();
  const inspection_time = now.getFullYear() + "-" +
    String(now.getMonth() + 1).padStart(2, '0') + "-" +
    String(now.getDate()).padStart(2, '0') + " " +
    String(now.getHours()).padStart(2, '0') + ":" +
    String(now.getMinutes()).padStart(2, '0') + ":" +
    String(now.getSeconds()).padStart(2, '0');

  const transaction = {
    uuid: "INS-" + Date.now() + "-" + Math.random().toString(36).substr(2, 6).toUpperCase(),
    inspection_time: inspection_time,
    nama_petugas: document.getElementById("nama_petugas").value,
    nama_leader: document.getElementById("nama_leader").value,
    shift: document.getElementById("shift").value,
    rentang_jam: document.getElementById("rentang_jam").value,
    lantai: currentLocation.lantai,
    jenis_toilet: currentLocation.jenis,
    catatan: document.getElementById("catatan").value,
    foto_base64: fotoBase64,
    ...checklistData
  };

  const tx = db.transaction("inspections", "readwrite");
  tx.objectStore("inspections").add(transaction);
  
  tx.oncomplete = () => {
    alert("✅ Data berhasil disimpan secara lokal!");
    document.getElementById("inspection-form").reset();
    document.getElementById("inspection-form").classList.add("hidden");
    document.getElementById("location-info").classList.add("hidden");
    currentLocation = { lantai: null, jenis: null };
    updatePendingCount();
  };
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// UPDATE PENDING COUNT BADGE
function updatePendingCount() {
  const tx = db.transaction("inspections", "readonly");
  const store = tx.objectStore("inspections");
  const req = store.count();
  req.onsuccess = () => {
    document.getElementById("pending-count").innerText = `💾 Tersimpan: ${req.result} data`;
  };
}

// SUBMIT / SYNC DATA TO GAS
async function syncData() {
  const tx = db.transaction("inspections", "readonly");
  const store = tx.objectStore("inspections");
  const req = store.getAll();

  req.onsuccess = async () => {
    const records = req.result;
    if (records.length === 0) {
      alert("Tidak ada data pending yang belum disinkronkan.");
      return;
    }

    const modal = document.getElementById("sync-modal");
    const statusText = document.getElementById("sync-status-text");
    const progress = document.getElementById("sync-progress");
    
    modal.classList.remove("hidden");
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      statusText.innerText = `⏳ ${i + 1}/${records.length} data disinkronisasi...`;
      progress.value = ((i + 1) / records.length) * 100;

      try {
        const res = await fetch(GAS_URL, {
          method: "POST",
          body: JSON.stringify(rec),
          headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
        const result = await res.json();

        // HAPUS DARI INDEXEDDB HANYA JIKA APPS SCRIPT MENGEMBALIKAN KODE SUCCESS
        if (result.status === "SUCCESS") {
          await deleteLocalRecord(rec.uuid);
          successCount++;
        } else {
          failedCount++;
        }
      } catch (err) {
        failedCount++;
      }
    }

    modal.classList.add("hidden");
    updatePendingCount();

    if (failedCount === 0) {
      alert(`✅ ${successCount} data berhasil disinkronisasi!`);
    } else {
      alert(`⚠️ ${successCount} berhasil disinkronkan, ❌ ${failedCount} gagal (tetap tersimpan di offline).`);
    }
  };
}

function deleteLocalRecord(uuid) {
  return new Promise((resolve) => {
    const tx = db.transaction("inspections", "readwrite");
    tx.objectStore("inspections").delete(uuid);
    tx.oncomplete = () => resolve();
  });
}

// ON INIT
window.addEventListener("DOMContentLoaded", () => {
  initDB();
  checkConnection();
  fetchLeaders();
});
