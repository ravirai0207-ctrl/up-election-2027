/**
 * Uttar Pradesh Assembly Election 2027 Dashboard
 * Core Application Logic, Map Visualization & Interactive Vote % Swing Simulator
 */

// Application State
const state = {
  constituencies: [],
  geoData: null,
  activeLayer: "2022", // "2022" | "2017" | "2024_ls" | "2019_ls" | "simulated"
  filters: {
    region: "all",
    party: "all",
    margin: "all",
    search: ""
  },
  selectedAcNo: null,
  table: {
    sortField: "ac_no",
    sortAsc: true,
    page: 1,
    pageSize: 25
  },
  // Simulation State for Vote % Changing
  sim: {
    baseline: "2022",
    swings: {
      bjp: 0.0,
      sp: 0.0,
      bsp: 0.0,
      inc: 0.0,
      rld: 0.0
    },
    seatOverrides: {}, // ac_no -> { p1_val, p2_val, winner, party, margin, flipped }
    projectedWinners: {}, // ac_no -> { winner, party, margin, flipped, oldParty }
    flippedList: [],
    tallies: { bjp: 255, sp: 111, ads: 12, rld: 8, sbsp: 6, inc: 2, bsp: 1, oth: 8 }
  },
  map: null,
  geoJsonLayer: null,
  chartInstance: null
};

// Party Color Definitions
const PARTY_COLORS = {
  "BJP": "#f97316",
  "SP": "#dc2626",
  "RLD": "#16a34a",
  "Apna Dal (Soneylal)": "#7c3aed",
  "AD(S)": "#7c3aed",
  "Suheldev Bharatiya Samaj Party": "#eab308",
  "SBSP": "#eab308",
  "INC": "#0284c7",
  "Congress": "#0284c7",
  "BSP": "#2563eb",
  "NISHAD": "#06b6d4",
  "Nirbal Indian Shoshit Hamara Aam Dal": "#06b6d4",
  "Jansatta Dal (Loktantrik)": "#d97706",
  "JDL": "#d97706",
  "ASP(KR)": "#4f46e5",
  "IND": "#64748b",
  "Other": "#64748b"
};

function getPartyColor(partyName) {
  if (!partyName) return "#94a3b8";
  const p = partyName.trim();
  if (PARTY_COLORS[p]) return PARTY_COLORS[p];
  for (const [key, color] of Object.entries(PARTY_COLORS)) {
    if (p.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(p.toLowerCase())) {
      return color;
    }
  }
  return "#64748b";
}

function parseNumeric(val) {
  if (!val) return 0;
  const num = String(val).replace(/[^0-9.-]/g, "");
  return parseFloat(num) || 0;
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  setupViewTabs();
  setupFilterControls();
  setupLayerSwitcher();
  setupSearchAutocomplete();
  setupHeritageBanner();
  setupTableSortingAndExport();

  await loadData();
  initMap();
  setupSimulator();
  recalculateSimulation();
  renderTable();
  updateAssemblyHeaderCounts();

  // Pre-select high profile seat: #300 Gorakhpur Urban
  selectConstituency(300, false);
});

// -----------------------------------------------------------------------------
// Data Loading (Supports both file:// and http:// protocols)
// -----------------------------------------------------------------------------
async function loadData() {
  if (window.UP_CONSTITUENCIES && window.UP_GEOJSON) {
    state.constituencies = window.UP_CONSTITUENCIES;
    state.geoData = window.UP_GEOJSON;
    console.log(`Loaded ${state.constituencies.length} constituencies and GeoJSON directly from memory.`);
    return;
  }

  try {
    const [constituenciesRes, geoRes] = await Promise.all([
      fetch("data/constituencies.json"),
      fetch("data/up_map.geojson")
    ]);

    state.constituencies = await constituenciesRes.json();
    state.geoData = await geoRes.json();
    console.log(`Loaded ${state.constituencies.length} constituencies via fetch.`);
  } catch (err) {
    console.error("Error loading electoral data:", err);
  }
}

// -----------------------------------------------------------------------------
// Interactive Map Setup (Leaflet)
// -----------------------------------------------------------------------------
function initMap() {
  state.map = L.map("up-election-map", {
    center: [27.15, 80.9],
    zoom: 7,
    minZoom: 6,
    maxZoom: 12,
    zoomControl: true
  });

  // OpenStreetMap Tile Layer (Free, Open, No API Keys or Watermarks)
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
    maxZoom: 18,
    opacity: 0.55
  }).addTo(state.map);

  renderGeoJsonLayer();

  if (state.geoJsonLayer) {
    state.map.fitBounds(state.geoJsonLayer.getBounds(), { padding: [15, 15] });
  }

  document.getElementById("btn-reset-map-zoom").addEventListener("click", () => {
    if (state.geoJsonLayer) {
      state.map.fitBounds(state.geoJsonLayer.getBounds(), { padding: [20, 20] });
    }
  });
}

function getWinningPartyForLayer(seat, layerKey) {
  if (!seat) return "Other";
  switch (layerKey) {
    case "2022":
      return seat.res_2022?.party || seat.current_party || "Other";
    case "2017":
      return seat.res_2017?.party || "Other";
    case "2024_ls":
      return seat.res_2024_ls?.party || "Other";
    case "2019_ls":
      return seat.res_2019_ls?.party || "Other";
    case "simulated":
      return state.sim.projectedWinners[seat.ac_no]?.party || seat.res_2022?.party || "Other";
    default:
      return seat.current_party || "Other";
  }
}

function doesSeatPassFilters(seat) {
  if (state.filters.region !== "all") {
    if (seat.region !== state.filters.region) return false;
  }
  if (state.filters.party !== "all") {
    const curP = seat.current_party || "";
    if (!curP.toLowerCase().includes(state.filters.party.toLowerCase())) return false;
  }
  if (state.filters.margin !== "all") {
    const marginVal = parseNumeric(seat.res_2022?.margin);
    if (state.filters.margin === "battleground" && marginVal >= 5000) return false;
    if (state.filters.margin === "tight" && (marginVal < 5000 || marginVal > 15000)) return false;
    if (state.filters.margin === "safe" && marginVal <= 25000) return false;
  }
  if (state.filters.search) {
    const q = state.filters.search.toLowerCase();
    const matchName = seat.ac_name.toLowerCase().includes(q);
    const matchMla = (seat.current_mla || "").toLowerCase().includes(q);
    const matchDist = seat.district.toLowerCase().includes(q);
    const matchNo = String(seat.ac_no) === q;
    if (!matchName && !matchMla && !matchDist && !matchNo) return false;
  }
  return true;
}

function renderGeoJsonLayer() {
  if (!state.geoData || !state.map) return;

  if (state.geoJsonLayer) {
    state.map.removeLayer(state.geoJsonLayer);
  }

  const seatLookup = new Map(state.constituencies.map(s => [s.ac_no, s]));
  let matchCount = 0;

  state.geoJsonLayer = L.geoJSON(state.geoData, {
    style: (feature) => {
      const acNo = feature.properties.ac_no || feature.properties.AC_NO;
      const seat = seatLookup.get(acNo);
      const isMatch = seat ? doesSeatPassFilters(seat) : true;
      if (isMatch) matchCount++;

      const winningParty = getWinningPartyForLayer(seat, state.activeLayer);
      const fillColor = getPartyColor(winningParty);
      const isSelected = state.selectedAcNo === acNo;

      return {
        fillColor: fillColor,
        fillOpacity: isMatch ? (isSelected ? 0.95 : 0.78) : 0.12,
        color: isSelected ? "#0f172a" : (isMatch ? "#ffffff" : "#cbd5e1"),
        weight: isSelected ? 3.5 : (isMatch ? 1 : 0.5),
        opacity: 1
      };
    },
    onEachFeature: (feature, layer) => {
      const acNo = feature.properties.ac_no || feature.properties.AC_NO;
      const seat = seatLookup.get(acNo);
      if (!seat) return;

      const simWinner = state.sim.projectedWinners[acNo];
      const winParty = getWinningPartyForLayer(seat, state.activeLayer);

      const tooltipContent = `
        <div style="font-family: var(--font-body); padding: 4px;">
          <div style="font-size: 11px; color: #94a3b8; font-weight: 700;">AC #${seat.ac_no} &bull; ${seat.district} (${seat.region})</div>
          <div style="font-size: 14px; font-weight: 800; color: #ffffff; margin: 2px 0;">${seat.ac_name}</div>
          <div style="font-size: 12px; color: #e2e8f0;">${state.activeLayer === "simulated" ? "Simulated Winner" : "Current MLA"}: <strong>${state.activeLayer === "simulated" ? simWinner?.winner : seat.current_mla}</strong> (<span style="color: ${getPartyColor(winParty)}">${winParty}</span>)</div>
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 3px;">${state.activeLayer === "simulated" ? "Projected Margin" : "2022 Margin"}: <strong>${state.activeLayer === "simulated" ? (simWinner?.margin + "%") : seat.res_2022.margin}</strong></div>
        </div>
      `;

      layer.bindTooltip(tooltipContent, {
        className: "custom-leaflet-tooltip",
        sticky: true,
        direction: "top",
        offset: [0, -10]
      });

      layer.on("mouseover", (e) => {
        if (state.selectedAcNo !== acNo) {
          layer.setStyle({
            weight: 2.5,
            color: "#0f172a",
            fillOpacity: 0.92
          });
          layer.bringToFront();
        }
      });

      layer.on("mouseout", (e) => {
        if (state.selectedAcNo !== acNo) {
          state.geoJsonLayer.resetStyle(layer);
        }
      });

      layer.on("click", () => {
        selectConstituency(acNo, true);
      });
    }
  }).addTo(state.map);

  document.getElementById("filtered-seat-counter").textContent = `Showing ${matchCount} of 403 seats`;
}

// -----------------------------------------------------------------------------
// Interactive Vote % Swing Simulator Engine
// -----------------------------------------------------------------------------
function setupSimulator() {
  // Stepper Buttons in Simulator Studio
  document.querySelectorAll(".sim-sliders-panel .stepper-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const party = btn.dataset.party;
      const delta = parseFloat(btn.dataset.delta);
      const slider = document.getElementById(`slider-${party}`);
      if (slider) {
        let val = parseFloat(slider.value) + delta;
        val = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), val));
        slider.value = val;
        state.sim.swings[party] = val;
        updateSimSliderDisplays();
        recalculateSimulation();
      }
    });
  });

  // Slider inputs in Simulator Studio
  ["bjp", "sp", "bsp", "inc", "rld"].forEach(p => {
    const slider = document.getElementById(`slider-${p}`);
    if (slider) {
      slider.addEventListener("input", () => {
        state.sim.swings[p] = parseFloat(slider.value);
        updateSimSliderDisplays();
        recalculateSimulation();
      });
    }
  });

  // Quick-swing buttons on Map
  document.querySelectorAll(".map-swing-quickbar .step-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const party = btn.dataset.party;
      const step = parseFloat(btn.dataset.step);
      let cur = state.sim.swings[party] || 0;
      let nextVal = Math.round((cur + step) * 10) / 10;
      state.sim.swings[party] = Math.max(-15, Math.min(15, nextVal));

      const mainSlider = document.getElementById(`slider-${party}`);
      if (mainSlider) mainSlider.value = state.sim.swings[party];

      updateSimSliderDisplays();
      recalculateSimulation();
    });
  });

  // Reset Swings Buttons
  const resetSwings = () => {
    ["bjp", "sp", "bsp", "inc", "rld"].forEach(p => {
      state.sim.swings[p] = 0;
      const slider = document.getElementById(`slider-${p}`);
      if (slider) slider.value = 0;
    });
    state.sim.seatOverrides = {};
    updateSimSliderDisplays();
    recalculateSimulation();
  };

  const btnResetAll = document.getElementById("btn-reset-all-sim");
  if (btnResetAll) btnResetAll.addEventListener("click", resetSwings);

  const btnQuickReset = document.getElementById("btn-quick-reset-swing");
  if (btnQuickReset) btnQuickReset.addEventListener("click", resetSwings);

  // Baseline Selection Pills
  document.querySelectorAll("#sim-baseline-pills .pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#sim-baseline-pills .pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.sim.baseline = pill.dataset.base;
      recalculateSimulation();
    });
  });

  // Preset Scenarios
  document.querySelectorAll("#sim-preset-scenarios .pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#sim-preset-scenarios .pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      const sc = pill.dataset.scenario;

      if (sc === "2024_replay") {
        state.sim.baseline = "2024_ls";
        ["bjp", "sp", "bsp", "inc", "rld"].forEach(p => state.sim.swings[p] = 0);
        document.querySelectorAll("#sim-baseline-pills .pill").forEach(p => {
          p.classList.toggle("active", p.dataset.base === "2024_ls");
        });
      } else if (sc === "sp_surge") {
        state.sim.baseline = "2022";
        state.sim.swings.sp = 3.5;
        state.sim.swings.bjp = -1.5;
        state.sim.swings.bsp = -2.0;
        state.sim.swings.inc = 0.5;
      } else if (sc === "bjp_consolidation") {
        state.sim.baseline = "2022";
        state.sim.swings.bjp = 3.0;
        state.sim.swings.sp = -1.5;
        state.sim.swings.bsp = -1.5;
      } else if (sc === "bsp_shift") {
        state.sim.baseline = "2022";
        state.sim.swings.bsp = -5.0;
        state.sim.swings.sp = 4.0;
        state.sim.swings.bjp = 1.0;
      }

      // Sync sliders
      ["bjp", "sp", "bsp", "inc", "rld"].forEach(p => {
        const slider = document.getElementById(`slider-${p}`);
        if (slider) slider.value = state.sim.swings[p];
      });

      updateSimSliderDisplays();
      recalculateSimulation();
    });
  });

  // Button: "Visualize on Map"
  const btnViewSimMap = document.getElementById("btn-view-sim-map");
  if (btnViewSimMap) {
    btnViewSimMap.addEventListener("click", () => {
      switchView("view-map");
      const simLayerBtn = document.querySelector(".layer-btn[data-layer=\"simulated\"]");
      if (simLayerBtn) simLayerBtn.click();
    });
  }
}

function updateSimSliderDisplays() {
  const formatSwing = (val) => (val > 0 ? `+${val.toFixed(1)}%` : `${val.toFixed(1)}%`);

  ["bjp", "sp", "bsp", "inc", "rld"].forEach(p => {
    const disp = document.getElementById(`sim-${p}-display`);
    if (disp) disp.textContent = formatSwing(state.sim.swings[p]);
  });

  const qBjp = document.getElementById("q-bjp-val");
  if (qBjp) qBjp.textContent = formatSwing(state.sim.swings.bjp);

  const qSp = document.getElementById("q-sp-val");
  if (qSp) qSp.textContent = formatSwing(state.sim.swings.sp);

  const qBsp = document.getElementById("q-bsp-val");
  if (qBsp) qBsp.textContent = formatSwing(state.sim.swings.bsp);

  const qInc = document.getElementById("q-inc-val");
  if (qInc) qInc.textContent = formatSwing(state.sim.swings.inc);
}

function getBasePartyAndShare(seat, baseline) {
  let wParty = "BJP";
  let wName = "";
  let wShare = 45.0;
  let rParty = "SP";
  let rName = "";
  let rShare = 38.0;

  if (baseline === "2024_ls") {
    wParty = seat.res_2024_ls.party;
    wName = seat.res_2024_ls.winner_mp;
    wShare = parseNumeric(seat.res_2024_ls.vote_share) || 45.0;
    rParty = seat.res_2024_ls.runner_party || "OTH";
    rName = seat.res_2024_ls.runner_mp || "Runner Up";
    rShare = Math.max(20, wShare - parseNumeric(seat.res_2024_ls.margin) / 10000);
  } else if (baseline === "2017") {
    wParty = seat.res_2017.party;
    wName = seat.res_2017.winner;
    wShare = 44.0;
    rParty = seat.res_2017.runner_party || "SP";
    rName = seat.res_2017.runner_up || "Runner Up";
    rShare = 36.0;
  } else if (baseline === "2019_ls") {
    wParty = seat.res_2019_ls.party;
    wName = seat.res_2019_ls.winner_mp;
    wShare = parseNumeric(seat.res_2019_ls.vote_share) || 47.0;
    rParty = seat.res_2019_ls.runner_party || "SP";
    rName = seat.res_2019_ls.runner_mp || "Runner Up";
    rShare = 37.0;
  } else {
    // 2022 Vidhan Sabha (Default)
    wParty = seat.res_2022.party;
    wName = seat.res_2022.winner;
    wShare = parseNumeric(seat.res_2022.vote_share) || 46.0;
    rParty = seat.res_2022.runner_party || "SP";
    rName = seat.res_2022.runner_up || "Runner Up";
    rShare = parseNumeric(seat.res_2022.runner_share) || 38.0;
  }

  return { wParty, wName, wShare, rParty, rName, rShare };
}

function getSwingForParty(party) {
  const p = (party || "").toLowerCase();
  if (p.includes("bjp")) return state.sim.swings.bjp;
  if (p.includes("sp") || p.includes("samajwadi")) return state.sim.swings.sp;
  if (p.includes("bsp") || p.includes("bahujan")) return state.sim.swings.bsp;
  if (p.includes("inc") || p.includes("congress")) return state.sim.swings.inc;
  if (p.includes("rld") || p.includes("lok dal")) return state.sim.swings.rld;
  if (p.includes("apna dal") || p.includes("ad(s)") || p.includes("sbsp") || p.includes("nishad")) {
    return state.sim.swings.bjp * 0.8; // Allies correlate with NDA
  }
  return 0;
}

function recalculateSimulation() {
  if (!state.constituencies.length) return;

  const baseline = state.sim.baseline;
  state.sim.projectedWinners = {};
  state.sim.flippedList = [];

  const tallies = {
    bjp: 0,
    sp: 0,
    ads: 0,
    rld: 0,
    sbsp: 0,
    inc: 0,
    bsp: 0,
    oth: 0
  };

  state.constituencies.forEach(seat => {
    const acNo = seat.ac_no;
    const base = getBasePartyAndShare(seat, baseline);

    let simWinner = base.wName;
    let simParty = base.wParty;
    let simMargin = (base.wShare - base.rShare);
    let flipped = false;

    // Check individual seat override
    if (state.sim.seatOverrides[acNo]) {
      const ov = state.sim.seatOverrides[acNo];
      if (ov.p2_val > ov.p1_val) {
        simWinner = base.rName;
        simParty = base.rParty;
        simMargin = (ov.p2_val - ov.p1_val);
        flipped = true;
      } else {
        simWinner = base.wName;
        simParty = base.wParty;
        simMargin = (ov.p1_val - ov.p2_val);
        flipped = false;
      }
    } else {
      // General swing calculation
      const swingW = getSwingForParty(base.wParty);
      const swingR = getSwingForParty(base.rParty);

      const adjW = base.wShare + swingW;
      const adjR = base.rShare + swingR;

      if (adjR > adjW) {
        simWinner = base.rName;
        simParty = base.rParty;
        simMargin = (adjR - adjW);
        flipped = true;
      } else {
        simWinner = base.wName;
        simParty = base.wParty;
        simMargin = (adjW - adjR);
        flipped = false;
      }
    }

    state.sim.projectedWinners[acNo] = {
      winner: simWinner,
      party: simParty,
      margin: simMargin.toFixed(1),
      flipped: flipped,
      oldParty: base.wParty,
      oldWinner: base.wName
    };

    if (flipped) {
      state.sim.flippedList.push({
        ac_no: acNo,
        ac_name: seat.ac_name,
        district: seat.district,
        from_party: base.wParty,
        to_party: simParty,
        margin: simMargin.toFixed(1)
      });
    }

    // Tally up
    const p = simParty.toUpperCase();
    if (p.includes("BJP")) tallies.bjp++;
    else if (p.includes("SP") || p.includes("SAMAJWADI")) tallies.sp++;
    else if (p.includes("APNA DAL") || p.includes("AD(S)")) tallies.ads++;
    else if (p.includes("RLD")) tallies.rld++;
    else if (p.includes("SBSP")) tallies.sbsp++;
    else if (p.includes("INC") || p.includes("CONGRESS")) tallies.inc++;
    else if (p.includes("BSP")) tallies.bsp++;
    else tallies.oth++;
  });

  const ndaTotal = tallies.bjp + tallies.ads + tallies.rld + tallies.sbsp;
  const indiaTotal = tallies.sp + tallies.inc;
  const bspTotal = tallies.bsp;
  const othTotal = tallies.oth;

  // Update Projected Seats in Simulator Studio
  const elBjp = document.getElementById("sim-bjp-seats");
  if (elBjp) elBjp.textContent = ndaTotal;

  const elSp = document.getElementById("sim-sp-seats");
  if (elSp) elSp.textContent = indiaTotal;

  const elBsp = document.getElementById("sim-bsp-seats");
  if (elBsp) elBsp.textContent = bspTotal;

  const elOth = document.getElementById("sim-oth-seats");
  if (elOth) elOth.textContent = othTotal;

  // Deltas vs baseline
  const baseNda = 273;
  const baseIndia = 125;
  const ndaDelta = ndaTotal - baseNda;
  const indiaDelta = indiaTotal - baseIndia;

  const elBjpDelta = document.getElementById("sim-bjp-delta");
  if (elBjpDelta) {
    elBjpDelta.textContent = `${ndaDelta >= 0 ? "+" : ""}${ndaDelta} vs baseline`;
    elBjpDelta.className = `kpi-delta ${ndaDelta >= 0 ? "pos" : "neg"}`;
  }

  const elSpDelta = document.getElementById("sim-sp-delta");
  if (elSpDelta) {
    elSpDelta.textContent = `${indiaDelta >= 0 ? "+" : ""}${indiaDelta} vs baseline`;
    elSpDelta.className = `kpi-delta ${indiaDelta >= 0 ? "pos" : "neg"}`;
  }

  // Majority Banner
  const majBanner = document.getElementById("sim-majority-banner");
  const majHeadline = document.getElementById("sim-majority-headline");
  const majSub = document.getElementById("sim-majority-sub");

  if (majBanner && majHeadline && majSub) {
    if (ndaTotal >= 202) {
      majBanner.className = "sim-majority-banner";
      majHeadline.textContent = "NDA Projected to Retain Majority";
      majSub.textContent = `Projected ${ndaTotal} seats (crosses 202 majority mark by +${ndaTotal - 202} seats)`;
    } else if (indiaTotal >= 202) {
      majBanner.className = "sim-majority-banner india-lead";
      majHeadline.textContent = "INDIA Alliance Projected to Cross Majority Mark!";
      majSub.textContent = `Projected ${indiaTotal} seats (crosses 202 majority mark by +${indiaTotal - 202} seats)`;
    } else {
      majBanner.className = "sim-majority-banner";
      majHeadline.textContent = "Hung Assembly Projected (No Single Alliance at 202)";
      majSub.textContent = `NDA: ${ndaTotal} | INDIA: ${indiaTotal} | BSP: ${bspTotal} | Others: ${othTotal}`;
    }
  }

  // Progress Bar
  const trackIndia = document.getElementById("sim-track-india");
  const trackNda = document.getElementById("sim-track-nda");
  const trackOth = document.getElementById("sim-track-oth");

  const indiaPct = Math.round((indiaTotal / 403) * 100);
  const ndaPct = Math.round((ndaTotal / 403) * 100);
  const othPct = Math.max(1, 100 - indiaPct - ndaPct);

  if (trackIndia) {
    trackIndia.style.width = `${indiaPct}%`;
    trackIndia.textContent = `${indiaTotal} (${indiaPct}%)`;
  }
  if (trackNda) {
    trackNda.style.width = `${ndaPct}%`;
    trackNda.textContent = `${ndaTotal} (${ndaPct}%)`;
  }
  if (trackOth) {
    trackOth.style.width = `${othPct}%`;
  }

  const lblIndia = document.getElementById("sim-lbl-india");
  if (lblIndia) lblIndia.textContent = `INDIA Alliance: ${indiaTotal} Seats`;

  const lblNda = document.getElementById("sim-lbl-nda");
  if (lblNda) lblNda.textContent = `NDA Alliance: ${ndaTotal} Seats`;

  // Flipped Seats List
  const flippedTitle = document.getElementById("flipped-count-title");
  if (flippedTitle) flippedTitle.innerHTML = `Seats Flipped: <strong>${state.sim.flippedList.length} seats</strong>`;

  const flippedContainer = document.getElementById("flipped-seats-list");
  if (flippedContainer) {
    if (state.sim.flippedList.length === 0) {
      flippedContainer.innerHTML = `
        <div class="empty-flip-state">
          <span>No seats flipped from baseline yet. Adjust the vote % sliders to model swings!</span>
        </div>
      `;
    } else {
      flippedContainer.innerHTML = "";
      state.sim.flippedList.forEach(flip => {
        const item = document.createElement("div");
        item.className = "flip-item";
        item.innerHTML = `
          <div class="flip-item-left">
            <span class="flip-ac-no">#${flip.ac_no}</span>
            <span class="flip-ac-name">${flip.ac_name}</span>
            <span class="flip-dist">(${flip.district})</span>
          </div>
          <div class="flip-arrow-group">
            <span class="flip-badge" style="background-color: ${getPartyColor(flip.from_party)}">${flip.from_party}</span>
            <span style="font-size: 11px; color: #94a3b8;">&rarr;</span>
            <span class="flip-badge" style="background-color: ${getPartyColor(flip.to_party)}">${flip.to_party}</span>
            <span style="font-size: 11px; font-weight: 700; color: #16a34a; margin-left: 4px;">+${flip.margin}%</span>
          </div>
        `;
        item.addEventListener("click", () => {
          selectConstituency(flip.ac_no, true);
          switchView("view-map");
        });
        flippedContainer.appendChild(item);
      });
    }
  }

  // Quickbar summary on Map
  const quickSummary = document.getElementById("quick-sim-summary");
  if (quickSummary) {
    quickSummary.innerHTML = `Projected 2027: <strong>BJP+ ${ndaTotal} | SP+ ${indiaTotal}</strong> (${state.sim.flippedList.length} flips)`;
  }

  // Re-color map if in simulated mode
  if (state.activeLayer === "simulated") {
    renderGeoJsonLayer();
  }
}

// -----------------------------------------------------------------------------
// Select Constituency & Update Detail Card / Drawer
// -----------------------------------------------------------------------------
function selectConstituency(acNo, flyToMap = true) {
  state.selectedAcNo = acNo;
  const seat = state.constituencies.find(s => s.ac_no === acNo);
  if (!seat) return;

  document.getElementById("sidebar-placeholder").style.display = "none";
  document.getElementById("sidebar-seat-details").style.display = "flex";

  // Fill in Header & Metadata
  document.getElementById("card-ac-no").textContent = `AC #${seat.ac_no}`;
  document.getElementById("card-region").textContent = seat.region;
  document.getElementById("card-district").textContent = seat.district;
  document.getElementById("card-ac-name").textContent = seat.ac_name;
  document.getElementById("card-pc-name").textContent = `Part of ${seat.pc_name} Lok Sabha Constituency (PC #${seat.pc_no})`;

  // Current MLA
  document.getElementById("card-mla-name").textContent = seat.current_mla || "Vacant / Not Listed";
  const mlaPartyBadge = document.getElementById("card-mla-party");
  mlaPartyBadge.textContent = seat.current_party || "Independent";
  mlaPartyBadge.style.backgroundColor = getPartyColor(seat.current_party);
  document.getElementById("card-mla-margin").textContent = `Won by ${seat.res_2022.margin} votes`;

  // ---------------------------------------------------------------------------
  // Individual Seat Vote % Simulator Controls
  // ---------------------------------------------------------------------------
  const p1Label = document.getElementById("seat-sim-p1-label");
  const p1Val = document.getElementById("seat-sim-p1-val");
  const p1Slider = document.getElementById("seat-sim-p1-slider");

  const p2Label = document.getElementById("seat-sim-p2-label");
  const p2Val = document.getElementById("seat-sim-p2-val");
  const p2Slider = document.getElementById("seat-sim-p2-slider");

  const seatSimBadge = document.getElementById("seat-sim-status-badge");
  const seatSimWinner = document.getElementById("seat-sim-winner-line");
  const seatSimMargin = document.getElementById("seat-sim-margin-line");

  const origP1 = parseNumeric(seat.res_2022.vote_share) || 48.0;
  const origP2 = parseNumeric(seat.res_2022.runner_share) || 38.0;

  const currentOverride = state.sim.seatOverrides[acNo] || { p1_val: origP1, p2_val: origP2 };

  p1Label.textContent = `${seat.res_2022.winner} (${seat.res_2022.party}) %:`;
  p1Val.textContent = `${currentOverride.p1_val.toFixed(1)}%`;
  p1Slider.value = currentOverride.p1_val;

  p2Label.textContent = `${seat.res_2022.runner_up || "Runner-up"} (${seat.res_2022.runner_party || "OTH"}) %:`;
  p2Val.textContent = `${currentOverride.p2_val.toFixed(1)}%`;
  p2Slider.value = currentOverride.p2_val;

  const updateSeatSimResult = (s1, s2) => {
    p1Val.textContent = `${s1.toFixed(1)}%`;
    p2Val.textContent = `${s2.toFixed(1)}%`;

    if (s2 > s1) {
      seatSimBadge.textContent = "🔥 SEAT FLIPS TO RUNNER-UP";
      seatSimBadge.style.color = "#dc2626";
      seatSimWinner.innerHTML = `Projected Winner: <strong style="color: ${getPartyColor(seat.res_2022.runner_party)}">${seat.res_2022.runner_up} (${seat.res_2022.runner_party})</strong>`;
      seatSimMargin.textContent = `Projected Lead: +${(s2 - s1).toFixed(1)}%`;
      state.sim.seatOverrides[acNo] = { p1_val: s1, p2_val: s2 };
    } else {
      seatSimBadge.textContent = "PROJECTED HOLD";
      seatSimBadge.style.color = "#16a34a";
      seatSimWinner.innerHTML = `Projected Winner: <strong style="color: ${getPartyColor(seat.res_2022.party)}">${seat.res_2022.winner} (${seat.res_2022.party})</strong>`;
      seatSimMargin.textContent = `Projected Lead: +${(s1 - s2).toFixed(1)}%`;
      state.sim.seatOverrides[acNo] = { p1_val: s1, p2_val: s2 };
    }
    recalculateSimulation();
  };

  updateSeatSimResult(currentOverride.p1_val, currentOverride.p2_val);

  p1Slider.oninput = () => {
    updateSeatSimResult(parseFloat(p1Slider.value), parseFloat(p2Slider.value));
  };

  p2Slider.oninput = () => {
    updateSeatSimResult(parseFloat(p1Slider.value), parseFloat(p2Slider.value));
  };

  const btnResetSeat = document.getElementById("btn-reset-seat-sim");
  if (btnResetSeat) {
    btnResetSeat.onclick = () => {
      delete state.sim.seatOverrides[acNo];
      p1Slider.value = origP1;
      p2Slider.value = origP2;
      updateSeatSimResult(origP1, origP2);
    };
  }

  // 2022 Vidhan Sabha Card
  document.getElementById("card-2022-margin").textContent = `Margin: ${seat.res_2022.margin}`;
  document.getElementById("card-2022-winner").textContent = seat.res_2022.winner;
  const w22Party = document.getElementById("card-2022-wparty");
  w22Party.textContent = seat.res_2022.party;
  w22Party.style.backgroundColor = getPartyColor(seat.res_2022.party);
  document.getElementById("card-2022-wvotes").textContent = `${seat.res_2022.votes} (${seat.res_2022.vote_share}%)`;

  document.getElementById("card-2022-runner").textContent = seat.res_2022.runner_up || "None";
  const r22Party = document.getElementById("card-2022-rparty");
  r22Party.textContent = seat.res_2022.runner_party || "OTH";
  r22Party.style.backgroundColor = getPartyColor(seat.res_2022.runner_party);
  document.getElementById("card-2022-rvotes").textContent = `${seat.res_2022.runner_votes} (${seat.res_2022.runner_share}%)`;
  document.getElementById("card-2022-turnout").textContent = `Turnout: ${seat.res_2022.turnout}%`;

  const leadPctDiff = (parseNumeric(seat.res_2022.vote_share) - parseNumeric(seat.res_2022.runner_share)).toFixed(2);
  document.getElementById("card-2022-pctdiff").textContent = `+${leadPctDiff}%`;

  // 2017 Vidhan Sabha Card
  document.getElementById("card-2017-margin").textContent = `Margin: ${seat.res_2017.margin}`;
  document.getElementById("card-2017-winner").textContent = seat.res_2017.winner || "Not Listed";
  const w17Party = document.getElementById("card-2017-wparty");
  w17Party.textContent = seat.res_2017.party;
  w17Party.style.backgroundColor = getPartyColor(seat.res_2017.party);
  document.getElementById("card-2017-wvotes").textContent = `${seat.res_2017.votes} votes`;

  document.getElementById("card-2017-runner").textContent = seat.res_2017.runner_up || "Runner Up";
  const r17Party = document.getElementById("card-2017-rparty");
  r17Party.textContent = seat.res_2017.runner_party || "OTH";
  r17Party.style.backgroundColor = getPartyColor(seat.res_2017.runner_party);
  document.getElementById("card-2017-rvotes").textContent = `${seat.res_2017.runner_votes} votes`;

  const swingEl = document.getElementById("card-2017-swing");
  if (seat.res_2017.party === seat.res_2022.party) {
    swingEl.innerHTML = `2017 to 2022: <strong style="color: #64748b;">${seat.res_2022.party} Hold</strong>`;
  } else {
    swingEl.innerHTML = `2017 to 2022: <strong style="color: #16a34a;">${seat.res_2022.party} Gain from ${seat.res_2017.party}</strong>`;
  }

  // 2024 Lok Sabha Card
  const allianceBadge = document.getElementById("card-2024-alliance");
  allianceBadge.textContent = `${seat.res_2024_ls.alliance_lead} Lead`;
  if (seat.res_2024_ls.alliance_lead === "INDIA") {
    allianceBadge.style.backgroundColor = "#eff6ff";
    allianceBadge.style.color = "#1d4ed8";
  } else {
    allianceBadge.style.backgroundColor = "#fff7ed";
    allianceBadge.style.color = "#c2410c";
  }

  document.getElementById("card-2024-mp").textContent = seat.res_2024_ls.winner_mp;
  const mp24Party = document.getElementById("card-2024-mpparty");
  mp24Party.textContent = seat.res_2024_ls.party;
  mp24Party.style.backgroundColor = getPartyColor(seat.res_2024_ls.party);
  document.getElementById("card-2024-mpvotes").textContent = `${seat.res_2024_ls.votes} (${seat.res_2024_ls.vote_share}%)`;

  document.getElementById("card-2024-mprunner").textContent = seat.res_2024_ls.runner_mp || "Runner Up";
  const r24Party = document.getElementById("card-2024-mprparty");
  r24Party.textContent = seat.res_2024_ls.runner_party || "NDA";
  r24Party.style.backgroundColor = getPartyColor(seat.res_2024_ls.runner_party);
  document.getElementById("card-2024-mprvotes").textContent = `Margin: ${seat.res_2024_ls.margin}`;
  document.getElementById("card-2024-pcname").textContent = seat.res_2024_ls.pc_name;

  // 2019 Lok Sabha Card
  document.getElementById("card-2019-party").textContent = `${seat.res_2019_ls.party} MP`;
  document.getElementById("card-2019-mp").textContent = seat.res_2019_ls.winner_mp;
  const mp19Party = document.getElementById("card-2019-mpparty");
  mp19Party.textContent = seat.res_2019_ls.party;
  mp19Party.style.backgroundColor = getPartyColor(seat.res_2019_ls.party);
  document.getElementById("card-2019-mpvotes").textContent = `${seat.res_2019_ls.votes} (${seat.res_2019_ls.vote_share}%)`;
  document.getElementById("card-2019-mprunner").textContent = `${seat.res_2019_ls.runner_mp} (${seat.res_2019_ls.runner_party})`;

  // Render Multi-Election Distribution Chart
  renderConstituencyChart(seat);

  // 2027 Election Outlook narrative
  updateOutlookNarrative(seat);

  // Update map layer styling to highlight this seat
  if (state.geoJsonLayer) {
    state.geoJsonLayer.eachLayer(layer => {
      const featAcNo = layer.feature.properties.ac_no || layer.feature.properties.AC_NO;
      if (featAcNo === acNo) {
        layer.setStyle({
          weight: 3.5,
          color: "#0f172a",
          fillOpacity: 0.95
        });
        layer.bringToFront();
        if (flyToMap && state.map) {
          state.map.flyToBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 10, duration: 0.8 });
        }
      } else {
        state.geoJsonLayer.resetStyle(layer);
      }
    });
  }

  if (window.lucide) lucide.createIcons();
}

// -----------------------------------------------------------------------------
// Chart.js: Multi-Year Distribution Bar Chart
// -----------------------------------------------------------------------------
function renderConstituencyChart(seat) {
  const ctx = document.getElementById("constituencyDistributionChart").getContext("2d");

  if (state.chartInstance) {
    state.chartInstance.destroy();
  }

  const v2017Winner = parseNumeric(seat.res_2017.votes);
  const v2017Runner = parseNumeric(seat.res_2017.runner_votes);

  const p2022W = parseNumeric(seat.res_2022.vote_share) || 45;
  const p2022R = parseNumeric(seat.res_2022.runner_share) || 35;

  const p2024W = parseNumeric(seat.res_2024_ls.vote_share) || 48;
  const p2019W = parseNumeric(seat.res_2019_ls.vote_share) || 46;

  state.chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["2017 Assembly", "2019 Lok Sabha", "2022 Assembly", "2024 Lok Sabha"],
      datasets: [
        {
          label: "Winner Vote Share %",
          data: [
            v2017Winner && v2017Runner ? Math.round((v2017Winner / (v2017Winner + v2017Runner)) * 85) : 46,
            p2019W,
            p2022W,
            p2024W
          ],
          backgroundColor: [
            getPartyColor(seat.res_2017.party),
            getPartyColor(seat.res_2019_ls.party),
            getPartyColor(seat.res_2022.party),
            getPartyColor(seat.res_2024_ls.party)
          ],
          borderRadius: 6
        },
        {
          label: "Runner-up Vote Share %",
          data: [
            v2017Winner && v2017Runner ? Math.round((v2017Runner / (v2017Winner + v2017Runner)) * 85) : 38,
            Math.max(15, 100 - p2019W - 15),
            p2022R,
            Math.max(15, 100 - p2024W - 12)
          ],
          backgroundColor: "#cbd5e1",
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            boxWidth: 10,
            font: { family: "Plus Jakarta Sans", size: 10, weight: "600" }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw}%`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            stepSize: 20,
            callback: (v) => `${v}%`,
            font: { family: "Plus Jakarta Sans", size: 9 }
          },
          grid: { color: "rgba(226, 232, 240, 0.6)" }
        },
        x: {
          ticks: {
            font: { family: "Plus Jakarta Sans", size: 9, weight: "600" }
          },
          grid: { display: false }
        }
      }
    }
  });
}

function updateOutlookNarrative(seat) {
  const margin = parseNumeric(seat.res_2022.margin);
  const curParty = seat.res_2022.party;
  const lsParty = seat.res_2024_ls.party;
  const lsAlliance = seat.res_2024_ls.alliance_lead;

  let narrative = "";

  if (margin < 5000) {
    narrative = `Ultra-critical razor thin seat. In 2022, ${seat.res_2022.winner} (${curParty}) edged past with just ${seat.res_2022.margin} votes. With ${lsAlliance} alliance demonstrating strong mobilization in the 2024 Lok Sabha cycle, this constituency will be one of the top contested battlegrounds of the 2027 Vidhan Sabha election.`;
  } else if (curParty !== lsParty) {
    narrative = `Divergent electoral trend. Won by ${curParty} in the 2022 state assembly, but in 2024 General Elections, the segment swung towards ${lsParty} (${lsAlliance} Alliance). Swing voters and candidate selection will be paramount for 2027.`;
  } else {
    narrative = `Stronghold characteristics. ${curParty} held this seat with a convincing victory in 2022 (${seat.res_2022.margin} margin) and maintained its momentum in 2024. For opposing coalitions, flipping this seat in 2027 will require high anti-incumbency and unified voting.`;
  }

  document.getElementById("card-outlook-text").textContent = narrative;
}

// -----------------------------------------------------------------------------
// Universal Search & Autocomplete
// -----------------------------------------------------------------------------
function setupSearchAutocomplete() {
  const input = document.getElementById("universal-search-input");
  const dropdown = document.getElementById("search-autocomplete-list");
  const clearBtn = document.getElementById("clear-search-btn");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    state.filters.search = q;

    if (q.length > 0) {
      clearBtn.style.display = "flex";
      showAutocomplete(q);
    } else {
      clearBtn.style.display = "none";
      dropdown.style.display = "none";
    }

    renderGeoJsonLayer();
    renderTable();
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    state.filters.search = "";
    clearBtn.style.display = "none";
    dropdown.style.display = "none";
    renderGeoJsonLayer();
    renderTable();
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  document.getElementById("close-sidebar-btn").addEventListener("click", () => {
    document.getElementById("sidebar-seat-details").style.display = "none";
    document.getElementById("sidebar-placeholder").style.display = "flex";
    state.selectedAcNo = null;
    if (state.geoJsonLayer) renderGeoJsonLayer();
  });

  document.querySelectorAll(".pick-tag").forEach(tag => {
    tag.addEventListener("click", () => {
      const ac = parseInt(tag.dataset.ac);
      selectConstituency(ac, true);
    });
  });
}

function showAutocomplete(query) {
  const dropdown = document.getElementById("search-autocomplete-list");
  dropdown.innerHTML = "";

  const matches = state.constituencies.filter(s => {
    return s.ac_name.toLowerCase().includes(query) ||
           (s.current_mla || "").toLowerCase().includes(query) ||
           s.district.toLowerCase().includes(query) ||
           String(s.ac_no) === query;
  }).slice(0, 10);

  if (matches.length === 0) {
    dropdown.innerHTML = "<div style=\"padding: 12px; font-size: 13px; color: #94a3b8; text-align: center;\">No matching constituency found</div>";
    dropdown.style.display = "block";
    return;
  }

  matches.forEach(s => {
    const item = document.createElement("div");
    item.className = "autocomplete-item";
    item.innerHTML = `
      <div class="ac-item-left">
        <span class="ac-item-title">#${s.ac_no} ${s.ac_name}</span>
        <span class="ac-item-meta">${s.district} &bull; MLA: ${s.current_mla}</span>
      </div>
      <span class="ac-party-tag" style="background-color: ${getPartyColor(s.current_party)}">${s.current_party}</span>
    `;
    item.addEventListener("click", () => {
      selectConstituency(s.ac_no, true);
      dropdown.style.display = "none";
      switchView("view-map");
    });
    dropdown.appendChild(item);
  });

  dropdown.style.display = "block";
}

// -----------------------------------------------------------------------------
// Layer Switcher (2022 vs 2017 vs 2024 vs 2019 vs Simulated)
// -----------------------------------------------------------------------------
function setupLayerSwitcher() {
  const buttons = document.querySelectorAll(".layer-btn");
  const heading = document.getElementById("active-map-heading");
  const sub = document.getElementById("active-map-sub");

  const titles = {
    "2022": {
      title: "2022 Vidhan Sabha: Current Assembly Composition",
      desc: "Showing all 403 constituencies colored by 2022 winning party (Current sitting MLAs). Click any seat to inspect."
    },
    "2017": {
      title: "2017 Vidhan Sabha: Historic 312-Seat BJP Landslide",
      desc: "Showing 2017 assembly election winners. BJP+ secured 325 seats (BJP 312), SP 47, BSP 19, Congress 7."
    },
    "2024_ls": {
      title: "2024 Lok Sabha Election: Assembly Segment Leads",
      desc: "Showing party leads across the 403 assembly segments in 2024 General Elections. INDIA Alliance led in 225 segments, NDA in 173."
    },
    "2019_ls": {
      title: "2019 Lok Sabha Election: Assembly Segment Leads",
      desc: "Showing 2019 General Election leads. BJP led in 274 assembly segments, Mahagathbandhan (SP-BSP) in 109, Congress in 12."
    },
    "simulated": {
      title: "2027 Simulated Assembly: Dynamic Vote % Model",
      desc: "Showing projected winners across all 403 constituencies calculated from your active vote % swings and individual seat adjustments."
    }
  };

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      state.activeLayer = btn.dataset.layer;
      heading.textContent = titles[state.activeLayer]?.title || "Election Map";
      sub.textContent = titles[state.activeLayer]?.desc || "";

      renderGeoJsonLayer();
      if (state.selectedAcNo) {
        selectConstituency(state.selectedAcNo, false);
      }
    });
  });
}

// -----------------------------------------------------------------------------
// Global Filter Controls
// -----------------------------------------------------------------------------
function setupFilterControls() {
  document.querySelectorAll("#region-filter-pills .pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#region-filter-pills .pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.filters.region = pill.dataset.region;
      renderGeoJsonLayer();
      renderTable();
    });
  });

  document.querySelectorAll("#party-filter-pills .pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#party-filter-pills .pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.filters.party = pill.dataset.party;
      renderGeoJsonLayer();
      renderTable();
    });
  });

  document.querySelectorAll("#margin-filter-pills .pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#margin-filter-pills .pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.filters.margin = pill.dataset.margin;
      renderGeoJsonLayer();
      renderTable();
    });
  });

  document.getElementById("reset-all-filters").addEventListener("click", () => {
    state.filters.region = "all";
    state.filters.party = "all";
    state.filters.margin = "all";
    state.filters.search = "";

    document.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
    document.querySelector("#region-filter-pills [data-region=\"all\"]").classList.add("active");
    document.querySelector("#party-filter-pills [data-party=\"all\"]").classList.add("active");
    document.querySelector("#margin-filter-pills [data-margin=\"all\"]").classList.add("active");

    document.getElementById("universal-search-input").value = "";
    document.getElementById("clear-search-btn").style.display = "none";

    renderGeoJsonLayer();
    renderTable();
  });
}

// -----------------------------------------------------------------------------
// View Tabs (Map <-> Simulator <-> Table <-> Analytics)
// -----------------------------------------------------------------------------
function setupViewTabs() {
  const tabs = [
    { btn: document.getElementById("tab-map-btn"), viewId: "view-map" },
    { btn: document.getElementById("tab-simulator-btn"), viewId: "view-simulator" },
    { btn: document.getElementById("tab-table-btn"), viewId: "view-table" },
    { btn: document.getElementById("tab-analytics-btn"), viewId: "view-analytics" }
  ];

  tabs.forEach(t => {
    if (t.btn) {
      t.btn.addEventListener("click", () => {
        switchView(t.viewId);
      });
    }
  });
}

function switchView(viewId) {
  document.querySelectorAll(".view-tabs .tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".content-view").forEach(view => view.classList.remove("active"));

  const shortName = viewId.replace("view-", "");
  const activeBtn = document.getElementById(`tab-${shortName}-btn`);
  if (activeBtn) activeBtn.classList.add("active");

  const activeView = document.getElementById(viewId);
  if (activeView) activeView.classList.add("active");

  if (viewId === "view-map" && state.map) {
    setTimeout(() => {
      state.map.invalidateSize();
      if (state.geoJsonLayer) {
        state.map.fitBounds(state.geoJsonLayer.getBounds(), { padding: [15, 15] });
      }
    }, 120);
  }
}

// -----------------------------------------------------------------------------
// Table Directory Rendering & Sorting
// -----------------------------------------------------------------------------
function setupTableSortingAndExport() {
  const headers = document.querySelectorAll("#seats-table th.sortable");
  headers.forEach(th => {
    th.addEventListener("click", () => {
      const field = th.dataset.sort;
      if (state.table.sortField === field) {
        state.table.sortAsc = !state.table.sortAsc;
      } else {
        state.table.sortField = field;
        state.table.sortAsc = true;
      }
      renderTable();
    });
  });

  const btnExport = document.getElementById("btn-export-csv");
  if (btnExport) btnExport.addEventListener("click", exportCSV);
}

function renderTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody || !state.constituencies.length) return;

  let filtered = state.constituencies.filter(doesSeatPassFilters);

  const f = state.table.sortField;
  const asc = state.table.sortAsc ? 1 : -1;

  filtered.sort((a, b) => {
    let va = a[f];
    let vb = b[f];

    if (f === "margin") {
      va = parseNumeric(a.res_2022?.margin);
      vb = parseNumeric(b.res_2022?.margin);
    } else if (f === "win_2017") {
      va = a.res_2017?.party;
      vb = b.res_2017?.party;
    } else if (f === "win_2024") {
      va = a.res_2024_ls?.party;
      vb = b.res_2024_ls?.party;
    }

    if (typeof va === "string") {
      return va.localeCompare(vb) * asc;
    }
    return ((va > vb ? 1 : -1) * asc);
  });

  const total = filtered.length;
  const pageSize = state.table.pageSize;
  const totalPages = Math.ceil(total / pageSize) || 1;
  state.table.page = Math.min(state.table.page, totalPages);

  const start = (state.table.page - 1) * pageSize;
  const paginated = filtered.slice(start, start + pageSize);

  tbody.innerHTML = "";

  paginated.forEach(seat => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="tbl-ac-num">${seat.ac_no}</td>
      <td class="tbl-ac-name" title="Click to view on map">${seat.ac_name}</td>
      <td>${seat.district}</td>
      <td><span style="font-size: 11px; color: #475569;">${seat.region}</span></td>
      <td><strong>${seat.current_mla}</strong></td>
      <td>
        <span class="tbl-party-badge" style="background-color: ${getPartyColor(seat.current_party)}">
          ${seat.current_party}
        </span>
      </td>
      <td><strong>${seat.res_2022.margin}</strong></td>
      <td>
        <span class="tbl-party-badge" style="background-color: ${getPartyColor(seat.res_2017.party)}">
          ${seat.res_2017.party}
        </span>
      </td>
      <td>
        <span class="tbl-party-badge" style="background-color: ${getPartyColor(seat.res_2024_ls.party)}">
          ${seat.res_2024_ls.party}
        </span>
      </td>
      <td>
        <button class="icon-action-btn" data-ac="${seat.ac_no}">
          View Seat
        </button>
      </td>
    `;

    tr.querySelector(".tbl-ac-name").addEventListener("click", () => {
      selectConstituency(seat.ac_no, true);
      switchView("view-map");
    });

    tr.querySelector("button").addEventListener("click", () => {
      selectConstituency(seat.ac_no, true);
      switchView("view-map");
    });

    tbody.appendChild(tr);
  });

  document.getElementById("table-entries-count").textContent = `Showing ${Math.min(start + 1, total)} to ${Math.min(start + pageSize, total)} of ${total} entries`;

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const container = document.getElementById("table-pagination");
  container.innerHTML = "";

  if (totalPages <= 1) return;

  const cur = state.table.page;

  const createBtn = (p, label, active = false) => {
    const btn = document.createElement("button");
    btn.className = `page-btn ${active ? "active" : ""}`;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      state.table.page = p;
      renderTable();
    });
    return btn;
  };

  if (cur > 1) {
    container.appendChild(createBtn(cur - 1, "Prev"));
  }

  const startP = Math.max(1, cur - 2);
  const endP = Math.min(totalPages, cur + 2);

  for (let p = startP; p <= endP; p++) {
    container.appendChild(createBtn(p, String(p), p === cur));
  }

  if (cur < totalPages) {
    container.appendChild(createBtn(cur + 1, "Next"));
  }
}

function exportCSV() {
  const headers = [
    "AC_NO", "Constituency", "District", "Region", "Lok_Sabha_PC",
    "Current_MLA", "Current_Party",
    "2022_Winner", "2022_Party", "2022_Votes", "2022_Margin", "2022_Runner", "2022_Runner_Party",
    "2017_Winner", "2017_Party", "2017_Votes", "2017_Margin",
    "2024_LS_Winner_MP", "2024_LS_Party", "2024_LS_Alliance_Lead",
    "2019_LS_Winner_MP", "2019_LS_Party"
  ];

  const rows = state.constituencies.map(s => [
    s.ac_no,
    `"${s.ac_name}"`,
    `"${s.district}"`,
    `"${s.region}"`,
    `"${s.pc_name}"`,
    `"${s.current_mla}"`,
    `"${s.current_party}"`,
    `"${s.res_2022.winner}"`,
    `"${s.res_2022.party}"`,
    s.res_2022.votes,
    s.res_2022.margin,
    `"${s.res_2022.runner_up}"`,
    `"${s.res_2022.runner_party}"`,
    `"${s.res_2017.winner}"`,
    `"${s.res_2017.party}"`,
    s.res_2017.votes,
    s.res_2017.margin,
    `"${s.res_2024_ls.winner_mp}"`,
    `"${s.res_2024_ls.party}"`,
    `"${s.res_2024_ls.alliance_lead}"`,
    `"${s.res_2019_ls.winner_mp}"`,
    `"${s.res_2019_ls.party}"`
  ]);

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "up_election_2027_constituencies_data.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// -----------------------------------------------------------------------------
// Assembly Header Counts & Metrics
// -----------------------------------------------------------------------------
function updateAssemblyHeaderCounts() {
  const counts = { BJP: 0, SP: 0, "Apna Dal (Soneylal)": 0, RLD: 0, SBSP: 0, INC: 0, BSP: 0, Others: 0 };

  state.constituencies.forEach(s => {
    const p = s.current_party;
    if (p === "BJP") counts.BJP++;
    else if (p === "SP" || p === "Samajwadi Party") counts.SP++;
    else if (p === "Apna Dal (Soneylal)" || p === "AD(S)") counts["Apna Dal (Soneylal)"]++;
    else if (p === "RLD") counts.RLD++;
    else if (p === "Suheldev Bharatiya Samaj Party" || p === "SBSP") counts.SBSP++;
    else if (p === "INC" || p === "Congress") counts.INC++;
    else if (p === "BSP") counts.BSP++;
    else counts.Others++;
  });

  if (document.getElementById("hdr-bjp-count")) document.getElementById("hdr-bjp-count").textContent = counts.BJP;
  if (document.getElementById("hdr-sp-count")) document.getElementById("hdr-sp-count").textContent = counts.SP;
  if (document.getElementById("hdr-ads-count")) document.getElementById("hdr-ads-count").textContent = counts["Apna Dal (Soneylal)"];
  if (document.getElementById("hdr-rld-count")) document.getElementById("hdr-rld-count").textContent = counts.RLD;
  if (document.getElementById("hdr-sbsp-count")) document.getElementById("hdr-sbsp-count").textContent = counts.SBSP;
  if (document.getElementById("hdr-inc-count")) document.getElementById("hdr-inc-count").textContent = counts.INC;
  if (document.getElementById("hdr-bsp-count")) document.getElementById("hdr-bsp-count").textContent = counts.BSP;
  if (document.getElementById("hdr-oth-count")) document.getElementById("hdr-oth-count").textContent = counts.Others;
}

// -----------------------------------------------------------------------------
// UP Heritage Showcase Lightbox
// -----------------------------------------------------------------------------
function setupHeritageBanner() {
  const chips = document.querySelectorAll(".heritage-chip");
  const modal = document.getElementById("heritage-lightbox");
  const img = document.getElementById("lightbox-img");
  const title = document.getElementById("lightbox-title");
  const desc = document.getElementById("lightbox-desc");
  const closeBtn = document.getElementById("lightbox-close-btn");

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");

      const imgKey = chip.dataset.img;
      img.src = `assets/images/${imgKey}.jpg`;
      title.textContent = chip.dataset.title;
      desc.textContent = chip.dataset.desc;

      modal.classList.add("active");
    });
  });

  closeBtn.addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("active");
  });
}
