# 🗳️ Uttar Pradesh Vidhan Sabha Election 2027 Dashboard

> **Interactive Electoral Intelligence, 403-Constituency Directory & Dynamic Vote % Swing Simulator**  
> Complete constituency-level results comparison across **2017 Assembly**, **2019 Lok Sabha**, **2022 Assembly**, and **2024 Lok Sabha** elections.

![UP Vidhan Bhavan](assets/images/vidhan_bhavan.jpg)

---

## 🌟 Overview

The **UP Election 2027 Dashboard** is a state-of-the-art interactive web application built for political analysts, journalists, and citizens tracking the upcoming **2027 Uttar Pradesh Legislative Assembly election** (18th Assembly: 2022–2027).

It features a light editorial design system celebrating Uttar Pradesh's rich cultural landmarks (**Vidhan Bhavan Lucknow**, **Kashi Ganga Ghats Varanasi**, **Rumi Darwaza Lucknow**, and **Ayodhya Ram Mandir**).

---

## 🚀 Key Features

### 1. 🗺️ Complete 403-Constituency Interactive Vector Map
- Interactive vector choropleth map covering all **403 Assembly Constituencies** from AC #1 (*Behat*) to AC #403 (*Duddhi*).
- Official political party color coding (BJP, SP, RLD, Apna Dal (S), SBSP, INC, BSP, NISHAD, JDL, etc.).
- **Map Layer Switcher**:
  - 🔘 **2022 Assembly**: Current sitting MLAs and party distribution.
  - 🔘 **2017 Assembly**: Historical 325-seat BJP+ wave.
  - 🔘 **2024 Lok Sabha Trend**: Party leads across assembly segments (INDIA 225 vs NDA 173).
  - 🔘 **2019 Lok Sabha Trend**: General Election assembly segment leads.
  - 🔘 **2027 Simulation Layer**: Real-time map color rendering reflecting your custom vote swings!

### 2. ⚡ Dynamic Vote % Swing Simulator (Across All Elections)
- **Universal Swing Sliders**: Shift statewide party vote shares (+/- %) for **BJP, SP, BSP, INC, and RLD**.
- **Baseline Selection**: Model swings starting from **2022 Vidhan Sabha**, **2024 Lok Sabha**, **2017 Vidhan Sabha**, or **2019 Lok Sabha**.
- **Live 202 Majority Mark Progress Bar**: Instantly updates projected seat counts and shows whether NDA or INDIA crosses the 202 majority line.
- **Dynamic Flipped Seats Directory**: Lists every single seat that flips under the modeled swing with its previous vs new winner and margin.
- **Seat-Level Vote % Editor**: Click any specific constituency to independently adjust candidate vote shares and simulate local flips.

### 3. 📊 In-Depth Constituency Intelligence Cards
Clicking any seat on the map displays:
- **Current MLA Information**: MLA name, winning party, and 2022 victory margin.
- **2022 Assembly Election**: Winner, runner-up, total votes, vote share %, margin, and turnout %.
- **2017 Assembly Election**: Winner, runner-up, margin, and seat swing comparison.
- **2024 Lok Sabha Segment Result**: Parliamentary constituency name, elected MP, and alliance lead (**INDIA vs NDA**).
- **2019 Lok Sabha Segment Result**: Elected MP and victory margin.
- **Animated Multi-Year Distribution Chart**: Chart.js vote share comparison across 2017, 2019, 2022, and 2024.
- **2027 Battleground Strategic Outlook**: Bellwether status and margin vulnerability analysis.

### 4. 📋 All 403 Seats Directory & CSV Export
- Searchable and sortable directory across all columns (AC #, Name, District, Region, Current MLA, Party, Margin).
- **Export to CSV**: Download the full multi-election 403-seat dataset with one click.
- **View Seat on Map**: Jump and zoom directly to any seat from the table.

### 5. 🏛️ Uttar Pradesh Heritage Showcase
- Curated photography capturing iconic UP heritage sites:
  - **Vidhan Bhavan, Lucknow**: Seat of the 403-member Legislative Assembly.
  - **Ganga Ghats, Varanasi**: Spiritual capital of Eastern UP (Purvanchal).
  - **Rumi Darwaza, Lucknow**: Architectural monument of Awadh.
  - **Ram Janmabhoomi Mandir, Ayodhya**: Sandstone temple architecture.
- Interactive photo lightbox with cultural and architectural descriptions.

---

## 📁 Repository Structure

```
election-2027/
├── index.html                   # Main application entry point
├── style.css                    # Design system (light theme, party palettes, map styling)
├── app.js                       # Map engine, simulation engine, and UI controller
├── data/
│   ├── constituencies.js        # Universal direct-include 403-seat electoral dataset
│   ├── constituencies.json      # Structured JSON 403-seat dataset
│   ├── up_map.js                # Optimized vector GeoJSON boundary script
│   └── up_map.geojson           # Standalone GeoJSON boundary file
├── assets/
│   └── images/
│       ├── vidhan_bhavan.jpg    # UP Legislative Assembly building
│       ├── varanasi_ghats.jpg   # Varanasi Kashi Ganga Ghats
│       ├── lucknow_rumi.jpg     # Lucknow Rumi Darwaza
│       └── ayodhya_temple.jpg   # Ayodhya Shri Ram Mandir
├── .gitignore                   # Clean git configuration
└── README.md                    # Comprehensive documentation
```

---

## 💻 Local Quickstart

-**Link** https://ravirai0207-ctrl.github.io/up-election-2027/

---

## 📜 Data Sources & Attribution

- **Electoral Data**: Synchronized with official Election Commission of India (ECI) reports for the 2017 & 2022 Uttar Pradesh Legislative Assembly elections and 2019 & 2024 General Parliamentary elections.
- **Geospatial Boundaries**: Community geospatial vector datasets optimized for high-performance browser rendering.
- **Basemap Tiles**: &copy; [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

---

**Developed with ❤️ for Uttar Pradesh Electoral Analytics (2027)**
