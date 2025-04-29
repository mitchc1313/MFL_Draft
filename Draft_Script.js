if (document.querySelector("#options_52") || document.querySelector("#new_predraft")) {

    async function pollForDraftUpdates() {
        try {
            const xmlDoc = await fetchLiveDraftResultsXML();
            if (!xmlDoc) return;

            const picks = Array.from(xmlDoc?.querySelectorAll("draftPick") || []);
            const currentPickCount = picks.length;

            if (currentPickCount > lastSeenDraftPickCount) {
                console.log(`🟢 New draft pick detected! (${currentPickCount} vs ${lastSeenDraftPickCount})`);
                lastSeenDraftPickCount = currentPickCount;

                setupRosterView(); // Full re-render
            } else {
                console.log("⏳ No new picks yet...");
            }
        } catch (err) {
            console.error("❌ Error in polling draft picks:", err);
        }
    }

    function setMobileView(view) {
        document.body.classList.remove("view-roster", "view-pool", "view-queue");
        document.body.classList.add(`view-${view}`);

        document.querySelectorAll(".mobile-nav-draft-btn").forEach(btn => {
            btn.classList.remove("active");
        });
        const activeBtn = document.querySelector(`.mobile-nav-draft-btn[data-view="${view}"]`);
        if (activeBtn) activeBtn.classList.add("active");

        // Optional animation effect
        const activeSection = document.querySelector(`.draft-view`);
        if (activeSection) {
            activeSection.classList.remove("fade-section");
            void activeSection.offsetWidth; // Force reflow
            activeSection.classList.add("fade-section");
        }
    }

    function injectMobileViewButtons() {
        if (window.innerWidth > 900) return;
        if (document.querySelector(".mobile-nav-draft")) return;

        const nav = document.createElement("div");
        nav.className = "mobile-nav-draft";

        nav.innerHTML = `
        <button class="mobile-nav-draft-btn active" data-view="roster" onclick="setMobileView('roster')">
            <i class="fas fa-clipboard-list"></i>
            <div class="label">Roster</div>
        </button>
        <button class="mobile-nav-draft-btn" data-view="pool" onclick="setMobileView('pool')">
            <i class="fas fa-football-ball"></i>
            <div class="label">Player Pool</div>
        </button>
        <button class="mobile-nav-draft-btn" data-view="queue" onclick="setMobileView('queue')">
            <i class="fas fa-layer-group"></i>
            <div class="label">Queue</div>
        </button>
    `;

        const pageBody = document.querySelector(".pagebody");

        if (pageBody) {
            pageBody.appendChild(nav);
        } else {
            console.warn("⚠️ .pagebody not found. Appending to document.body as fallback.");
            document.body.appendChild(nav);
        }

        setMobileView("pool"); // default view
    }



    let mobileNavInjected = false;

    function handleResizeForMobileNav() {
        const existingNav = document.querySelector(".mobile-nav-draft");

        if (window.innerWidth <= 900 && !existingNav) {
            injectMobileViewButtons();
        } else if (window.innerWidth > 900 && existingNav) {
            existingNav.remove();
            document.body.classList.remove("view-roster", "view-pool", "view-queue");
        }
    }



    async function fetchLastYearFantasyPoints(providedLeagueId = null) {
    const leagueIdToUse = (providedLeagueId && !isNaN(providedLeagueId))
        ? providedLeagueId
        : (window.customLeagueId && !isNaN(window.customLeagueId))
            ? window.customLeagueId
            : leagueId;

    if (!leagueIdToUse || !baseURLDynamic || !year) {
        console.error("❌ Missing required global variables: leagueId, year, or baseURLDynamic.");
        return {};
    }

    const prevYear = parseInt(year, 10) - 1;
    const apiURL = `${baseURLDynamic}/${prevYear}/export?TYPE=playerScores&L=${leagueIdToUse}&W=YTD&YEAR=${prevYear}&JSON=1`;

    try {
        const res = await fetch(apiURL);
        const data = await res.json();

        console.log("📦 playerScores API raw data:", data); // <-- NEW
        const scoresArray = data?.playerScores?.playerScore || [];

        console.log(`📋 playerScores array (${scoresArray.length} players):`, scoresArray); // <-- NEW

        const scoresMap = {};
        scoresArray.forEach(player => {
            scoresMap[player.id] = player.score;
        });

        return scoresMap;
    } catch (err) {
        console.error("❌ Failed to fetch last year's scores:", err);
        return {};
    }
}

   async function fetchTeamInfo(providedLeagueId = null) {
    const leagueId = providedLeagueId || window.league_id;

    if (!leagueId) {
        console.error("❌ window.league_id is not defined.");
        return {};
    }

    const url = `${baseURLDynamic}/2025/export?TYPE=league&L=${leagueId}&JSON=1`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        console.log("📦 league API raw data:", data);
        const teams = data?.league?.franchises?.franchise || [];

        console.log(`📋 franchise array (${teams.length} teams):`, teams);

        const teamMap = {};
        teams.forEach(team => {
            teamMap[team.id] = {
                name: team.name
            };
        });

        console.log("🗺️ Mapped team IDs to names:", teamMap);

        return teamMap;
    } catch (err) {
        console.error("❌ Failed to fetch team info:", err);
        return {};
    }
}




    async function fetchNFLByeWeeks(year) {
    const url = `https://api.myfantasyleague.com/${year}/export?TYPE=nflByeWeeks&W=&JSON=1`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        console.log("📦 nflByeWeeks API raw data:", data); // <-- NEW
        const teamArray = data?.nflByeWeeks?.team || [];

        console.log(`📋 nflByeWeeks array (${teamArray.length} teams):`, teamArray); // <-- NEW

        const byeWeekMap = {};
        teamArray.forEach(team => {
            byeWeekMap[team.id] = team.bye_week || "—";
        });

        console.log("🗺️ Mapped team bye weeks:", byeWeekMap); // <-- NEW

        return byeWeekMap;
    } catch (err) {
        console.error("❌ Failed to fetch bye week data:", err);
        return {};
    }
}

    function getPickTimeLimitInSeconds() {
        const { value, unit } = window.pickTimeLimit || { value: 4, unit: "hours" };
        let seconds;

        switch (unit) {
            case "seconds": seconds = value; break;
            case "minutes": seconds = value * 60; break;
            case "hours": seconds = value * 3600; break;
            case "days": seconds = value * 86400; break;
            default: seconds = 14400; break;
        }
        return seconds;
    }


    async function fetchLiveDraftResultsXML() {
        const url = `${baseURLDynamic}/fflnetdynamic${year}/${league_id}_LEAGUE_draft_results.xml?_=${Date.now()}`;

        try {
            const res = await fetch(url);
            const text = await res.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, "text/xml");
            return xmlDoc;
        } catch (err) {
            console.error("❌ Failed to fetch or parse draft results XML:", err);
            return null;
        }
    }

    function parseLiveDraftMeta(xmlDoc) {
        const root = xmlDoc.querySelector("draftResults");
        if (!root) return null;

        const currentFranchiseId = root.getAttribute("franchise_id");
        const currentRound = parseInt(root.getAttribute("round"), 10);
        const currentPick = parseInt(root.getAttribute("pick"), 10);
        const lastPickTime = parseInt(root.getAttribute("last_pick_time"), 10);
        const paused = root.getAttribute("paused") === "1";

        return {
            currentFranchiseId,
            currentRound,
            currentPick,
            lastPickTime,
            paused
        };
    }



    function buildPlayerPoolTable(lastYearScores = {}) {

        let positionFilter;
        let nameSearch;

        if (typeof window.playerDatabaseObj === 'object' && Array.isArray(window.playerDatabaseObj["picker"]) && window.playerDatabaseObj["picker"].length > 0) {

            window.pdb_picker = playerDatabaseObj["picker"];
            // console.log("✅ Extracted pdb_picker from playerDatabaseObj with", pdb_picker.length, "players");
        } else {
            console.error("❌ playerDatabaseObj['picker'] not found or invalid");
            return;
        }

        const isQueueMode = document.querySelector('form[name="new_predraft"]') !== null;
        const destinationList = document.querySelector('#destination_list');
        const showQueueSidebar = destinationList !== null;

        let currentSortKey = "fsrank";
        let sortDirection = 1;

        function getSortValue(player, key) {
            if (key === "lastYearScore") return parseFloat(lastYearScores[player.id] || 0);
            if (key === "fsrank") return parseInt(player.fsrank) || Infinity;
            return (player[key] || "").toString().toUpperCase();
        }


        // console.log("✅ isQueueMode:", isQueueMode);
        // console.log("✅ destinationList exists:", destinationList !== null);

        let queuedPlayerIDs = destinationList
            ? Array.from(destinationList.options).map(opt => opt.value)
            : [];

        const style = document.createElement("style");
        style.textContent = `/* unchanged CSS block */`;
        document.head.appendChild(style);

        let existing = document.getElementById("player-pool-container");
        if (existing) existing.remove();

        const layoutWrapper = document.createElement("div");
        layoutWrapper.id = "player-pool-layout";

        const queueSidebar = document.createElement("div");
        queueSidebar.id = "player-queue-sidebar";
        queueSidebar.className = "draft-view";
        queueSidebar.innerHTML = `
    <h3 id="queue-header">Queued Players:<br>Round ?</h3>
    <div id="queue-list"></div>
`;

        const container = document.createElement("div");
        container.id = "player-pool-container";
        container.className = "draft-view";

        // 🔽 Add h3 header
        const poolHeader = document.createElement("h3");
        poolHeader.textContent = "Player Pool";
        poolHeader.style.margin = "0 0 0 0";
        poolHeader.style.backgroundColor = "white";
        poolHeader.style.position = "sticky";
        poolHeader.style.top = "0";
        poolHeader.style.zIndex = "10";
        poolHeader.style.padding = "0";
        container.appendChild(poolHeader);

        const headerDiv = document.createElement("div");
        headerDiv.className = "player-pool-header";

        // Round label + dropdown container
        const roundWrapper = document.createElement("div");
        roundWrapper.className = "round-wrapper";

        // Round label
        const customLabel = document.createElement("div");
        customLabel.textContent = "Player Queue for:";
        customLabel.className = "custom-round-label";
        roundWrapper.appendChild(customLabel);

        // Round form (optional, only if exists)
        const roundForm = document.querySelector('form.reportform[action="new_predraft"]');
        if (roundForm) {
            roundForm.style.display = "flex";
            [...roundForm.childNodes].forEach(node => {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.includes("Or, you may go")) {
                    node.textContent = '';
                }
            });
            roundWrapper.appendChild(roundForm);
        }

        positionFilter = document.createElement("select");
        positionFilter.id = "position-filter";
        positionFilter.className = "player-filter";

        // Build the options based on window.positionOptions
        (window.positionOptions || []).forEach(opt => {
            const optionEl = document.createElement("option");
            optionEl.value = opt.value;
            optionEl.textContent = opt.label;
            positionFilter.appendChild(optionEl);
        });

        headerDiv.appendChild(positionFilter);


        // Name Search Input
        nameSearch = document.createElement("input");
        nameSearch.type = "text";
        nameSearch.placeholder = "Player Search...";
        nameSearch.id = "player-name-search";
        nameSearch.className = "player-filter";
        headerDiv.appendChild(nameSearch);


        // Add to header
        headerDiv.appendChild(roundWrapper);


        container.appendChild(headerDiv); // ✅ Add header to player pool container
        layoutWrapper.appendChild(container); // ✅ Add player pool to center

        if (showQueueSidebar) {
            layoutWrapper.appendChild(queueSidebar); // ✅ Add queue to the right
        }

        const newPredraftDiv = document.querySelector('#new_predraft');
        const pageBody = document.querySelector("#options_52");

        if (newPredraftDiv) {
            newPredraftDiv.appendChild(layoutWrapper);
            // console.log("📦 Player pool layout added to #new_predraft.");
        } else if (pageBody) {
            pageBody.appendChild(layoutWrapper);
            // console.log("📦 Player pool table appended to #options_52.");
        } else {
            document.body.appendChild(layoutWrapper);
            // Keep this one for visibility if layout goes to an unexpected fallback
            console.warn("⚠️ Fallback: Appended player pool to body.");
        }

        // ✅ Always run setupRosterView regardless of isQueueMode
        setupRosterView();

        // 🧱 STEP 1: Add draft board container
        const draftBoardContainer = document.createElement("div");
        draftBoardContainer.id = "draftBoard";
        draftBoardContainer.style.overflowX = "auto";
        draftBoardContainer.style.whiteSpace = "nowrap";
        draftBoardContainer.style.width = "max-content";
        draftBoardContainer.style.height = "124px";
        draftBoardContainer.style.boxSizing = "border-box";
        draftBoardContainer.style.padding = "0px 0";
        draftBoardContainer.style.marginTop = "0px";
        draftBoardContainer.style.display = "flex";
        draftBoardContainer.style.gap = "8px";
        draftBoardContainer.style.paddingTop = "12px"; // keep top padding
        // 🧱 Create a wrapper for the draft board to allow scaling without breaking layout
        const draftBoardWrapper = document.createElement("div");
        draftBoardWrapper.id = "draftBoard-wrapper";
        draftBoardWrapper.style.overflowX = "auto";
        draftBoardWrapper.style.boxSizing = "border-box";
        draftBoardWrapper.style.padding = "0px"; // keep top padding here

        // Move your draftBoard into the wrapper
        draftBoardWrapper.appendChild(draftBoardContainer);

        // Then insert the whole wrapped section at the top of the layout
        layoutWrapper.insertBefore(draftBoardWrapper, layoutWrapper.firstChild);

        // console.log("🧱 Draft board container added.");

        const table = document.createElement("table");
        table.className = "player-pool-table";
        table.innerHTML = `
  <thead>
    <tr>
      <th class="player-rank sortable" data-sort-key="fsrank">RK</th>
      <th class="sortable" data-sort-key="name">PLAYER</th>
      <th class="sortable" data-sort-key="pos">POS</th>
      <th class="sortable" data-sort-key="nfl_team">TEAM</th>
      <th class="sortable" data-sort-key="bye_week">BYE</th>
      <th class="sortable" data-sort-key="lastYearScore">${parseInt(year, 10) - 1} FPTS</th>
      <th class="th-draft">DRAFT/QUEUE</th>
    </tr>
  </thead>
  <tbody></tbody>
`;

        const tbody = table.querySelector("tbody");
        const sortedPlayers = pdb_picker.slice().sort((a, b) => {
            const aVal = getSortValue(a, "fsrank");
            const bVal = getSortValue(b, "fsrank");
            if (aVal < bVal) return -1;
            if (aVal > bVal) return 1;
            return 0;
        });

        let filteredPlayers = sortedPlayers.slice(); // full list initially

        function applyFilters() {
            const selectedPos = positionFilter.value;
            const searchTerm = nameSearch.value.trim().toLowerCase();

            filteredPlayers = sortedPlayers.filter(player => {
                const matchesPosition = !selectedPos || player.pos.toUpperCase() === selectedPos;
                const [last, first] = player.name.split(", ");
                const fullName = `${first} ${last}`.toLowerCase();
                const matchesName = fullName.includes(searchTerm);
                return matchesPosition && matchesName;
            });

            renderPlayerPoolRows(filteredPlayers);
        }

        positionFilter.addEventListener("change", applyFilters);
        nameSearch.addEventListener("input", applyFilters);



        function renderPlayerPoolRows(players) {
            tbody.innerHTML = "";

            players.forEach((player, index) => {
                const isDef = player.pos.toUpperCase() === "DEF";
                const imageUrl = isDef
                    ? `https://www.mflscripts.com/playerImages_96x96/mfl_${player.nfl_team}.svg`
                    : `https://www.mflscripts.com/playerImages_80x107/mfl_${player.id}.png`;

                const [last, first] = player.name.split(", ");
                const fullName = `${first || ""} ${last || ""}`.trim();
                const rank = isNaN(parseInt(player.fsrank, 10)) ? "" : player.fsrank;

                let buttonLabel = "DRAFT";
                let isQueued = false;

                if (isQueueMode) {
                    isQueued = queuedPlayerIDs.includes(player.id);
                    buttonLabel = isQueued ? "Remove" : "Queue";
                }

                const tr = document.createElement("tr");
                tr.className = index % 2 === 0 ? "eventablerow" : "oddtablerow";

                tr.innerHTML = `
          <td class="player-rank">${rank}</td>
          <td class="player-cell">
            <div class="player-img-wrapper">
              <img src="${imageUrl}" alt="${fullName}" class="player-img">
            </div>
            <div class="player-name">
              <a href="${baseURLDynamic}/${year}/player?L=${league_id}&P=${player.id}" target="_blank" rel="noopener noreferrer">${fullName}</a>
            </div>
          </td>
          <td class="player-position-td">${player.pos}</td>
          <td class="player-team-td">${player.nfl_team}</td>
          <td class="bye-week-td">${player.bye_week}</td>
          <td class="ly-scores-td">${lastYearScores[player.id] ?? "—"}</td>
          <td>
            <button class="draft-btn${isQueued ? ' queued-player' : ''}" data-player-id="${player.id}" type="button">${buttonLabel}</button>
          </td>
        `;

                tbody.appendChild(tr);
            });

            attachDraftButtonListeners(); // ✅ cleaner re-attachment
        }


        function attachDraftButtonListeners() {
            container.querySelectorAll(".draft-btn").forEach(button => {
                button.addEventListener("click", function () {
                    const playerId = this.getAttribute("data-player-id");

                    if (isQueueMode) {
                        if (!destinationList) return;

                        if (this.textContent === "Queue") {
                            const player = pdb_picker.find(p => String(p.id) === String(playerId));
                            const opt = document.createElement("option");
                            opt.value = playerId;
                            opt.text = `${player.name} ${player.nfl_team} ${player.pos}`;
                            destinationList.appendChild(opt);
                            queuedPlayerIDs.push(playerId);
                            this.textContent = "Remove";
                            this.classList.add("queued-player");

                            renderQueueSidebar();
                        } else {
                            const option = destinationList.querySelector(`option[value="${playerId}"]`);
                            if (option) option.remove();
                            queuedPlayerIDs = queuedPlayerIDs.filter(id => id !== playerId);
                            this.textContent = "Queue";
                            this.classList.remove("queued-player");

                            renderQueueSidebar();
                        }
                    } else {
                        if (playerId) {
                            draftPlayer(playerId);
                        } else {
                            console.warn("⚠️ No playerId found on button.");
                        }
                    }
                });
            });
        }



        if (isQueueMode) {
            const submitBtn = document.createElement("button");
            submitBtn.textContent = "Submit Queue";
            submitBtn.className = "queue-btn";
            submitBtn.addEventListener("click", (e) => {
                e.preventDefault();
                submitQueuePlayers();
            });
            headerDiv.appendChild(submitBtn);

            const clearBtn = document.createElement("button");
            clearBtn.textContent = "Clear Queue";
            clearBtn.className = "queue-btn clear-btn";
            clearBtn.addEventListener("click", (e) => {
                e.preventDefault();
                clearQueuedPlayers();
            });
            headerDiv.appendChild(clearBtn);

        }

        container.appendChild(table);
        renderPlayerPoolRows(sortedPlayers);

        table.querySelectorAll("th.sortable").forEach(th => {
            th.style.cursor = "pointer";
            th.addEventListener("click", () => {
                const sortKey = th.dataset.sortKey;
                if (sortKey === currentSortKey) {
                    sortDirection *= -1;
                } else {
                    currentSortKey = sortKey;
                    sortDirection = 1;
                }

                // Optional: update visual indicators
                table.querySelectorAll("th.sortable").forEach(header => header.classList.remove("sorted-asc", "sorted-desc"));
                th.classList.add(sortDirection === 1 ? "sorted-asc" : "sorted-desc");

                filteredPlayers.sort((a, b) => {
                    const aVal = getSortValue(a, sortKey);
                    const bVal = getSortValue(b, sortKey);
                    if (aVal < bVal) return -1 * sortDirection;
                    if (aVal > bVal) return 1 * sortDirection;
                    return 0;
                });
                renderPlayerPoolRows(filteredPlayers);

            });
        });


        const currentRoundInput = document.querySelector('form[name="new_predraft"] input[name="ROUND"]');
        const roundDropdown = document.querySelector('select[name="ROUND"]');

        if (currentRoundInput && roundDropdown) {
            const currentVal = currentRoundInput.value;
            Array.from(roundDropdown.options).forEach(option => {
                option.selected = (option.value === currentVal);
            });
        }

        injectDraftCaptionMessage();

    }

    function injectDraftCaptionMessage() {
        const draftTableCaption = document.querySelector('form[action*="/draft"] table.report caption span');
        const layoutWrapper = document.getElementById("player-pool-layout");

        if (draftTableCaption && layoutWrapper) {
            const messageDiv = document.createElement("div");
            messageDiv.id = "draft-timer-message";
            messageDiv.textContent = draftTableCaption.textContent;

            layoutWrapper.parentNode.insertBefore(messageDiv, layoutWrapper);
            // console.log("⏰ Draft timer message injected."); // Removed for cleanliness
        } else {
            console.warn("⚠️ Could not find draft caption or layout container."); // Keep this for fallback awareness
        }
    }



    async function setupRosterView() {
        // console.log("🧪 setupRosterView() starting...");

        const form = document.querySelector('form[name="new_predraft"]') || document.querySelector('form[action*="/draft"]');
        const layout = document.getElementById("player-pool-layout");

        if (!form) {
            console.error("❌ Could not find predraft form.");
        }

        if (!layout) {
            console.error("❌ Could not find #player-pool-layout. Is buildPlayerPoolTable() done?");
        }

        if (!form || !layout) return;

        const leagueId = form.querySelector('input[name="LEAGUE_ID"]')?.value;
        const franchiseId = form.querySelector('input[name="FRANCHISE_ID"]')?.value;
        const maxRounds = window.maxRoundsFallback || 16;

        if (!leagueId || !franchiseId) {
            console.error("❌ Missing LEAGUE_ID or FRANCHISE_ID.");
            return;
        }

        const startersConfig = window.startersConfig || {
            QB: 1,
            RB: 2,
            WR: 2,
            TE: 1,
            K: 0,
            DEF: 1
        };

        const totalStarters = Object.values(startersConfig).reduce((sum, val) => sum + val, 0);
        const numFlex = maxRounds - totalStarters;

        // console.log("📌 Starters config:", startersConfig);
        // console.log("📌 Total FLEX spots:", numFlex);

        const rosterDiv = document.createElement("div");
        rosterDiv.id = "team-roster-view";
        rosterDiv.className = "draft-view";
        rosterDiv.innerHTML = `
        <h3 class="roster-h3-header">Roster</h3>
        <div id="roster-starters"><h4>Starters</h4></div>
        <div id="roster-flex"><h4>Bench</h4></div>
    `;

        layout.prepend(rosterDiv);

        // Fetch draft results
        const xmlUrl = `${baseURLDynamic}/fflnetdynamic${year}/${leagueId}_LEAGUE_draft_results.xml?_=${Date.now()}`;

        try {
            const res = await fetch(xmlUrl);
            const text = await res.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, "text/xml");

            const draftPicks = Array.from(xmlDoc.querySelectorAll("draftPick"));

            const allDraftedPlayerIDs = draftPicks
                .map(pick => pick.getAttribute("player"))
                .filter(pid => pid && pid !== "");

            const myPicks = draftPicks
                .filter(pick => pick.getAttribute("franchise") === franchiseId && pick.getAttribute("player"))
                .map(pick => pick.getAttribute("player"));

            window.draftedPlayerIDs = myPicks;

            const allDetails = await fetchDraftedPlayerDetails(leagueId, allDraftedPlayerIDs);
            window.draftedPlayerDetails = allDetails;

            window.draftedPlayerIDs = myPicks;
            window.startersConfig = startersConfig;
            window.flexSpots = numFlex;

            renderRoster(); // ✅ CALL IT HERE

            // ✅ Draft board rendering
            if (window.draftedPlayerDetails && Array.isArray(window.draftedPlayerIDs)) {
                const draftBoardEl = document.getElementById("draftBoard");
                const franchiseNameMap = window.teamInfo || {};
                let currentPickEl = null;
                let lastRound = null;

                draftPicks.forEach(pickEl => {
                    const franchiseId = pickEl.getAttribute("franchise");
                    const playerId = pickEl.getAttribute("player");
                    const round = pickEl.getAttribute("round");
                    const pickNum = pickEl.getAttribute("pick");
                    const formattedPick = `${parseInt(round, 10)}.${pickNum.padStart(2, '0')}`;

                    if (round !== lastRound) {
                        const roundDiv = document.createElement("div");
                        roundDiv.className = "round-divider";
                        roundDiv.innerHTML = `Round<br><span class="round-number">${round}</span>`;
                        roundDiv.style.display = "inline-flex";
                        roundDiv.style.flexDirection = "column";
                        roundDiv.style.justifyContent = "center";
                        roundDiv.style.alignItems = "center";
                        roundDiv.style.minWidth = "100px";
                        roundDiv.style.maxWidth = "100px";
                        roundDiv.style.height = "100px";
                        roundDiv.style.textAlign = "center";
                        roundDiv.style.fontWeight = "900";
                        roundDiv.style.fontSize = "0.9rem";
                        roundDiv.style.color = "var(--dark-color)";
                        roundDiv.style.padding = "4px 6px";
                        roundDiv.style.background = "none";
                        roundDiv.style.borderRadius = "6px";
                        roundDiv.style.textTransform = "uppercase";
                        roundDiv.style.fontFamily = "Industry, sans-serif";


                        draftBoardEl.appendChild(roundDiv);
                        lastRound = round;
                    }

                    const pickDiv = document.createElement('div');
                    pickDiv.classList.add('draft-pick', `team_${franchiseId}`);
                    pickDiv.style.display = 'inline-block';
                    pickDiv.style.minWidth = '100px';
                    pickDiv.style.maxWidth = '100px';
                    pickDiv.style.height = '100px';
                    pickDiv.style.borderRadius = '8px';
                    pickDiv.style.color = 'var(--dark-color)';
                    pickDiv.style.padding = '6px';
                    pickDiv.style.boxSizing = 'border-box';
                    pickDiv.style.backgroundColor = "#ccc"; // default grey
                    pickDiv.style.textAlign = 'left';
                    pickDiv.style.position = 'relative';
                    pickDiv.style.zIndex = '2'; // above background logo
                    pickDiv.style.overflow = 'hidden';


                    // 🔁 Top-right team icon
                    const teamIconWrapper = document.createElement('div');
                    teamIconWrapper.className = 'team-icon-wrapper';
                    teamIconWrapper.style.position = 'absolute';
                    teamIconWrapper.style.top = '10px';
                    teamIconWrapper.style.right = '35px';
                    teamIconWrapper.style.width = '28px';
                    teamIconWrapper.style.height = '28px';
                    teamIconWrapper.style.backgroundImage = `var(--team_${franchiseId}-icon)`;
                    teamIconWrapper.style.backgroundSize = 'cover';
                    teamIconWrapper.style.borderRadius = '50%';
                    teamIconWrapper.style.zIndex = '1'; // above background logo

                    // 🔁 Large faint background team logo
                    const teamLogoImg = document.createElement("img");
                    teamLogoImg.className = "team-logo-bg";
                    teamLogoImg.src = getComputedStyle(document.documentElement)
                        .getPropertyValue(`--team_${franchiseId}-icon`)
                        .replace(/url\(["']?/, '')
                        .replace(/["']?\)/, '');

                    teamLogoImg.style.position = 'absolute';
                    teamLogoImg.style.width = '180%';
                    teamLogoImg.style.height = 'auto'; // keep aspect ratio
                    teamLogoImg.style.top = '-60px';
                    teamLogoImg.style.left = '-60px';
                    teamLogoImg.style.position = 'absolute';
                    teamLogoImg.style.transform = 'translate(0, 0)';

                    teamLogoImg.style.objectFit = 'cover';
                    teamLogoImg.style.opacity = '0.08'; // subtle watermark
                    teamLogoImg.style.zIndex = '0';
                    teamLogoImg.style.pointerEvents = 'none';
                    teamLogoImg.style.borderRadius = '8px';

                    teamLogoImg.style.maskImage = 'linear-gradient(to top, transparent 0%, transparent 30%, black 65%, black 100%)';
                    teamLogoImg.style.maskSize = '100% 100%';
                    teamLogoImg.style.maskRepeat = 'no-repeat';

                    // For browser compatibility
                    teamLogoImg.style.webkitMaskImage = 'linear-gradient(to top, transparent 0%, transparent 30%, black 65%, black 100%)';
                    teamLogoImg.style.webkitMaskSize = '100% 100%';
                    teamLogoImg.style.webkitMaskRepeat = 'no-repeat';




                    const pickNumDiv = document.createElement('div');
                    pickNumDiv.textContent = formattedPick;
                    pickNumDiv.className = 'pick-number';
                    pickNumDiv.style.fontSize = '0.75rem';
                    pickNumDiv.style.opacity = '0.85';
                    pickNumDiv.style.zIndex = '1';

                    const mainText = document.createElement('div');
                    // Set default class
                    mainText.className = 'team-name';

                    const positionText = document.createElement('div');
                    positionText.style.className = 'position-text';
                    positionText.style.fontSize = '0.75rem';
                    positionText.style.marginTop = '2px';
                    positionText.style.position = 'relative';
                    positionText.style.zIndex = '1';

                    const player = window.draftedPlayerDetails[playerId];
                    if (player) {
                        const [last, first] = player.name.split(", ");
                        const fullName = `${first || ""} ${last || ""}`.trim();

                        mainText.innerHTML = `${first || ""}<br>${last || ""}`;
                        mainText.classList.add('player-name'); // switch class
                        mainText.title = fullName; // tooltip
                        positionText.textContent = player.pos || "";
                    } else {
                        mainText.textContent = franchiseNameMap?.[franchiseId]?.name || `Team ${franchiseId}`;
                        mainText.classList.add('team-name');
                        positionText.textContent = '';

                        if (!currentPickEl) {
                            currentPickEl = pickDiv;
                            pickDiv.classList.add('current-pick');

                            pickDiv.style.color = "#fff"; // white text for current pick

                            // 🌈 Apply team color only for current pick
                            const teamClass = `team_${franchiseId}`;
                            const teamId = franchiseId;
                            const cssVar = `--team_${teamId}`;
                            const baseColor = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();

                            if (baseColor) {
                                const darkColor = darkenHexColor(baseColor, 0.6);
                                const lightFade = hexToRgba(baseColor, 0.8);
                                pickDiv.style.background = `linear-gradient(to top, ${darkColor}, ${lightFade})`;

                                // ✅ Setup animation style sheet once globally
                                if (!window.dynamicAnimationStyleEl) {
                                    const styleEl = document.createElement("style");
                                    styleEl.id = "dynamic-animations";
                                    document.head.appendChild(styleEl);
                                    window.dynamicAnimationStyleEl = styleEl.sheet;
                                }

                                // ✅ Inject keyframes for this specific team if not already added
                                const animationName = `pulseGlow_${franchiseId}`;
                                const existingRule = Array.from(window.dynamicAnimationStyleEl.cssRules).find(rule =>
                                    rule.name === animationName
                                );

                                if (!existingRule) {
                                    const keyframes = `
        @keyframes ${animationName} {
            0%   { box-shadow: 0 0 0 3px ${lightFade}; }
            50%  { box-shadow: 0 0 10px 4px ${baseColor}; }
            100% { box-shadow: 0 0 0 3px ${lightFade}; }
        }`;
                                    try {
                                        window.dynamicAnimationStyleEl.insertRule(keyframes, window.dynamicAnimationStyleEl.cssRules.length);
                                        // console.log(`✅ Injected keyframes for ${animationName}`); // Removed for production
                                    } catch (err) {
                                        console.error(`❌ Failed to inject keyframes for ${animationName}:`, err);
                                    }
                                }


                                // ✅ Set CSS variable to trigger the animation
                                pickDiv.style.setProperty('--pulse-anim', animationName);
                            }
                        }

                    }

                    pickDiv.appendChild(teamLogoImg); // must go first
                    pickDiv.appendChild(positionText);
                    pickDiv.appendChild(mainText);
                    pickDiv.appendChild(teamIconWrapper);
                    pickDiv.appendChild(pickNumDiv);



                    draftBoardEl.appendChild(pickDiv);


                });

    if (currentPickEl) {
    const container = document.getElementById("draftBoard-wrapper");
    let offset = window.innerWidth <= 900 ? 208 : 116; // Default offsets

    const allDraftPicks = Array.from(container.querySelectorAll(".draft-pick, .round-divider"));
    const currentIndex = allDraftPicks.indexOf(currentPickEl);

    if (currentIndex > -1 && currentIndex <= 3) {
        offset = 500; // No offset for picks 0-3
    }

    setTimeout(() => {
        const elRect = currentPickEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft;
        const targetScroll = scrollLeft + (elRect.left - containerRect.left) - offset;

        container.scrollTo({
            left: targetScroll,
            behavior: "smooth"
        });
        console.log("📌 Scrolled to current pick (index", currentIndex, ") with offset:", offset);
    }, 50);
}

                console.log("✅ Draft board populated.");
            }


        } catch (err) {
            console.error("❌ Failed to fetch draft results:", err);
        }
    }

    function renderRoster() {
        if (!window.draftedPlayerIDs || !Array.isArray(window.draftedPlayerIDs)) {
            console.warn("⚠️ No drafted player IDs found.");
            return;
        }

        const startersEl = document.getElementById("roster-starters");
        const flexEl = document.getElementById("roster-flex");
        if (!startersEl || !flexEl) {
            console.warn("⚠️ Could not find #roster-starters or #roster-flex.");
            return;
        }

        // Clear any existing content
        startersEl.innerHTML = "<h4>Starters</h4>";
        flexEl.innerHTML = "<h4>Bench</h4>";

        // ✅ Insert header row BEFORE the #roster-starters div
        const headerRow = document.createElement("div");
        headerRow.className = "roster-line header";
        headerRow.innerHTML = `
  <div class="roster-pos">Pos</div>
  <div class="roster-name">Player</div>
  <div class="roster-bye">Bye</div>
`;

        const parent = startersEl.parentNode;
        if (parent) {
            parent.insertBefore(headerRow, startersEl);
        }



        const starterSlots = {};
        const flexPlayers = [];

        window.draftedPlayerIDs.forEach(pid => {
            const player = window.draftedPlayerDetails?.[pid];
            if (!player) {
                console.warn(`❌ No player details found for ID: ${pid}`);
                return;
            }

            const pos = player.pos.toUpperCase();
            const [last, first] = player.name.split(", ");
            const fullName = `${first || ""} ${last || ""}`.trim();

            // console.log(`🧩 Player ${fullName} (${pid}) - Team: ${player.team}`); // Removed for cleaner output

            const byeWeek = window.byeWeeksMap?.[player.team];
            if (!byeWeek) {
                console.warn(`❓ No bye week found for team ${player.team}`);
            }

            if (!starterSlots[pos]) starterSlots[pos] = [];
            const maxSlots = window.startersConfig[pos] || 0;

            const playerData = {
                fullName,
                pos,
                team: player.team,
                byeWeek: byeWeek || "—"
            };

            if (starterSlots[pos].length < maxSlots) {
                starterSlots[pos].push(playerData);
            } else {
                flexPlayers.push(playerData);
            }
        });


        // Render starters
        for (const pos of Object.keys(window.startersConfig)) {
            const max = window.startersConfig[pos];
            const filled = starterSlots[pos] || [];

            for (let i = 0; i < max; i++) {
                const player = filled[i] || { fullName: "Empty", byeWeek: "—" };

                const wrapper = document.createElement("div");
                wrapper.className = "roster-line";
                if (player.fullName === "Empty") wrapper.classList.add("roster-empty");


                const posDiv = document.createElement("div");
                posDiv.className = "roster-pos";
                posDiv.textContent = `${pos}:`;

                const nameDiv = document.createElement("div");
                nameDiv.className = "roster-name";
                nameDiv.textContent = player.fullName;

                const byeDiv = document.createElement("div");
                byeDiv.className = "roster-bye";
                byeDiv.textContent = `${player.byeWeek}`;

                wrapper.appendChild(posDiv);
                wrapper.appendChild(nameDiv);
                wrapper.appendChild(byeDiv);
                startersEl.appendChild(wrapper);
            }
        }

        // Render FLEX bench spots
        for (let i = 0; i < window.flexSpots; i++) {
            const player = flexPlayers[i] || { fullName: "Empty", byeWeek: "—" };

            const wrapper = document.createElement("div");
            wrapper.className = "roster-line";
            if (player.fullName === "Empty") wrapper.classList.add("roster-empty");

            const labelDiv = document.createElement("div");
            labelDiv.className = "roster-pos";
            labelDiv.textContent = "FLEX:";

            const nameDiv = document.createElement("div");
            nameDiv.className = "roster-name";
            nameDiv.textContent = player.fullName;

            const byeDiv = document.createElement("div");
            byeDiv.className = "roster-bye";
            byeDiv.textContent = `${player.byeWeek}`;

            wrapper.appendChild(labelDiv);
            wrapper.appendChild(nameDiv);
            wrapper.appendChild(byeDiv);
            flexEl.appendChild(wrapper);
        }
    }



    async function fetchDraftedPlayerDetails(leagueId, playerIDs) {
        if (!leagueId || !year || !Array.isArray(playerIDs) || playerIDs.length === 0) return {};

        const encodedIDs = playerIDs.join("%2C");
        const url = `${baseURLDynamic}/${year}/export?TYPE=players&L=${leagueId}&PLAYERS=${encodedIDs}&JSON=1`;

        try {
            const res = await fetch(url);
            const data = await res.json();

            let playerArray = data?.players?.player;

            // Normalize to an array if it's just a single object
            if (!Array.isArray(playerArray)) {
                playerArray = playerArray ? [playerArray] : [];
            }

            const playerMap = {};
            playerArray.forEach(p => {
                playerMap[p.id] = {
                    name: p.name,
                    pos: p.position,
                    team: p.team
                };
            });
            return playerMap;
        } catch (err) {
            console.error("❌ Failed to fetch player details:", err);
            return {};
        }
    }





    function renderQueueSidebar() {
        const queueList = document.querySelector("#queue-list");
        const queueHeader = document.querySelector("#queue-header");

        if (!queueList || !queueHeader) return;

        const roundSelect = document.querySelector('select[name="ROUND"]');
        const currentRound = roundSelect?.value || "?";

        queueHeader.innerHTML = `Queued Players:<br>Round ${currentRound}`;

        queueList.innerHTML = "";

        const destinationList = document.querySelector('#destination_list');
        const queuedPlayerIDs = destinationList
            ? Array.from(destinationList.options).map(opt => opt.value)
            : [];

        // ➡️ Introduce a new counter for rendered players
        let renderedPlayerIndex = 0;

        queuedPlayerIDs.forEach((id) => {
            const player = pdb_picker.find(p => p.id === id);
            if (!player) return;

            const isDef = player.pos.toUpperCase() === "DEF";
            const imageUrl = isDef
                ? `https://www.mflscripts.com/playerImages_96x96/mfl_${player.nfl_team}.svg`
                : `https://www.mflscripts.com/playerImages_80x107/mfl_${player.id}.png`;

            const [last, first] = player.name.split(", ");
            const fullName = `${first || ""} ${last || ""}`.trim();

            const item = document.createElement("div");
            item.classList.add("queue-player-item");

            // ✅ Use renderedPlayerIndex instead of original index
            const rowClass = renderedPlayerIndex % 2 === 0 ? "eventablerow-draft" : "oddtablerow-draft";
            item.classList.add(rowClass);

            const playerRank = player.fsrank || "—";

            item.innerHTML = `
            <div class="queue-grid">
                <div class="queue-num">${renderedPlayerIndex + 1}</div>
                <div class="queue-img-wrapper">
                    <div class="player-img-wrapper">
                        <img src="${imageUrl}" alt="${fullName}" class="player-img">
                    </div>
                </div>

                <div class="queue-name">
                    ${fullName}
                    <div class="queue-rank">Rank: ${playerRank}</div>
                </div>
                <div class="queue-pos">${player.pos}</div>
                <div class="queue-team">${player.nfl_team}</div>
            </div>
        `;

            queueList.appendChild(item);

            // ✅ Increment only after successful render
            renderedPlayerIndex++;
        });
    }


    // ➕ The renumberQueue function definition:
    function renumberQueue() {
        const queueItems = document.querySelectorAll('#queue-list .queue-player-item .queue-num');
        queueItems.forEach((item, index) => {
            item.textContent = index + 1;
        });
    }



    function draftPlayer(playerId) {
        console.log("🧨 draftPlayer() called with:", playerId);

        const formOnPage = document.querySelector('form[action*="/draft"]');
        if (!formOnPage) {
            console.error("❌ Draft form not found on the page.");
            return;
        }

        const leagueId = formOnPage.querySelector('input[name="LEAGUE_ID"]')?.value;
        const franchiseId = formOnPage.querySelector('input[name="FRANCHISE_ID"]')?.value;
        const option = formOnPage.querySelector('input[name="OPTION"]')?.value;

        console.log("📋 Fetched hidden form values:", { leagueId, franchiseId, option });

        if (!leagueId || !franchiseId || !option) {
            console.error("❌ One or more hidden input values are missing.");
            return;
        }


        // ✅ Get player name for confirmation message
        const player = pdb_picker.find(p => String(p.id) === String(playerId));
        const [last, first] = player?.name?.split(", ") || ["", ""];
        const fullName = `${first || ""} ${last || ""}`.trim();

        // 🛑 Confirm submission
        const confirmMsg = `Are you sure you want to draft ${fullName}? This action cannot be undone.`;
        if (!window.confirm(confirmMsg)) {
            console.log("⛔ Draft cancelled by user.");
            return;
        }

        console.log("🧪 Preparing to DRAFT Player:");
        console.table({
            LEAGUE_ID: leagueId,
            FRANCHISE_ID: franchiseId,
            OPTION: option,
            PLAYER_PICK: playerId,
            MSG: ""
        });

        const draftForm = document.createElement("form");
        draftForm.method = "POST";
        draftForm.action = formOnPage.action;

        const addField = (name, value) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = name;
            input.value = value;
            draftForm.appendChild(input);
        };

        addField("LEAGUE_ID", leagueId);
        addField("FRANCHISE_ID", franchiseId);
        addField("OPTION", option);
        addField("PLAYER_PICK", playerId);
        addField("MSG", "");

        console.log("📦 Draft form action URL:", draftForm.action);
        console.log("📤 Form data (serialized):");
        Array.from(draftForm.elements).forEach(input => {
            console.log(`  ${input.name}: ${input.value}`);
        });

        document.body.appendChild(draftForm);
        console.log("📝 Form appended to body. Submitting now...");
        draftForm.submit();
        console.log("✅ draftForm.submit() should be complete.");
    }


    function submitQueuePlayers() {
        const form = document.querySelector('form[name="new_predraft"]');
        const select = document.querySelector('#destination_list');

        if (!form || !select) {
            console.error("❌ Could not find predraft form or destination list.");
            return;
        }

        const queuedIds = Array.from(select.options).map(opt => opt.value);
        if (queuedIds.length === 0) {
            alert("No players in queue to submit.");
            return;
        }

        const formAction = form.getAttribute('action');
        const urlParams = new URLSearchParams(new FormData(form));

        // Required hidden fields
        queuedIds.forEach(pid => urlParams.append("PICKS", pid));
        urlParams.set("continue", "Save These Picks And Continue");

        const finalUrl = `${formAction}?${urlParams.toString()}`;
        console.log("📤 Submitting queue to:", finalUrl);

        // Create and submit form
        const dynamicForm = document.createElement("form");
        dynamicForm.method = "POST";
        dynamicForm.action = formAction;

        // Copy all hidden fields
        form.querySelectorAll('input[type="hidden"]').forEach(input => {
            const clone = input.cloneNode();
            dynamicForm.appendChild(clone);
        });

        // Add PICKS
        queuedIds.forEach(pid => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = "PICKS";
            input.value = pid;
            dynamicForm.appendChild(input);
        });

        // Add 'continue'
        const cont = document.createElement("input");
        cont.type = "hidden";
        cont.name = "continue";
        cont.value = "Save These Picks And Continue";
        dynamicForm.appendChild(cont);

        document.body.appendChild(dynamicForm);
        dynamicForm.submit();
    }

    function clearQueuedPlayers() {
        const destinationList = document.querySelector('#destination_list');
        if (destinationList) {
            destinationList.innerHTML = ""; // Clear all <option>s
        }

        // Reset queuedPlayerIDs array
        window.queuedPlayerIDs = [];

        // Update all draft buttons
        document.querySelectorAll('.draft-btn').forEach(btn => {
            btn.textContent = "Queue";
            btn.classList.remove("queued-player");
        });

        renderQueueSidebar(); // Re-render the sidebar to reflect cleared state
    }



    function darkenHexColor(hex, amount = 0.2) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        const { h, s, l } = rgbToHsl(r, g, b);
        const darkenedL = Math.max(0, l * (1 - amount)); // <- proportional instead of subtractive
        const { r: dr, g: dg, b: db } = hslToRgb(h, s, darkenedL);

        return `rgb(${dr}, ${dg}, ${db})`;
    }

    function lightenHexColor(hex, amount = 0.2) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        const { h, s, l } = rgbToHsl(r, g, b);
        const lightenedL = Math.min(1, l + amount); // Add lightness
        const { r: lr, g: lg, b: lb } = hslToRgb(h, s, lightenedL);

        return `rgb(${lr}, ${lg}, ${lb})`;
    }

    function hexToRgba(hex, alpha = 0.25) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        const d = max - min;

        if (d) {
            s = d / (1 - Math.abs(2 * l - 1));
            switch (max) {
                case r: h = ((g - b) / d) + (g < b ? 6 : 0); break;
                case g: h = ((b - r) / d) + 2; break;
                case b: h = ((r - g) / d) + 4; break;
            }
            h /= 6;
        }

        return { h, s, l };
    }

    function hslToRgb(h, s, l) {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        let r, g, b;

        if (!s) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }


  async function fetchDraftStartTime() {
    try {
        const url = `${baseURLDynamic}/${year}/export?TYPE=calendar&L=${league_id}&JSON=0`;
        const response = await fetch(url);
        const text = await response.text();

        console.log("📄 Raw calendar XML:", text);

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const events = xmlDoc.getElementsByTagName('event');
        for (let event of events) {
            const type = event.getAttribute('type');
            const rawStart = event.getAttribute('start_time');
            if (type === "DRAFT_START") {
                const startTime = parseInt(rawStart, 10);
                console.log("✅ Found DRAFT_START event:", event.outerHTML);
                console.log("🕒 Parsed draftStartTime:", startTime, new Date(startTime * 1000).toLocaleString());
                return startTime;
            }
        }

        console.warn("⚠️ No event with type='DRAFT_START' found.");
        return null;
    } catch (err) {
        console.error("❌ Failed to fetch draft start time:", err);
        return null;
    }
}


async function initLiveDraftClock() {
    const xmlDoc = await fetchLiveDraftResultsXML();
    if (!xmlDoc) return;

    const meta = parseLiveDraftMeta(xmlDoc);
    if (!meta || isNaN(meta.lastPickTime)) return;

    const draftStartTime = await fetchDraftStartTime();
    console.log("📆 Final draftStartTime value:", draftStartTime);
    const pickLimitSec = getPickTimeLimitInSeconds();
    const deadline = meta.lastPickTime + pickLimitSec;

    const container = document.querySelector("#player-pool-layout");
    if (!container) return;

    const timerDiv = document.createElement("div");
    timerDiv.id = "live-draft-clock";
    timerDiv.style.cssText = `
        background: var(--dark-color);
        color: #fff;
        padding: 8px;
        font-size: 40px;
        font-family: 'Industry', sans-serif;
        font-weight: 900;
        text-align: center;
        height: 140px;
        margin-bottom: 12px;
        display: flex;
        flex-direction: column;
        justify-content: center;
    `;
    container.prepend(timerDiv);

    let interval;

    function updateClock(deadline) {
        const now = Math.floor(Date.now() / 1000);
        const remaining = Math.max(0, deadline - now);
        const roundInfo = `Round ${meta.currentRound}, Pick ${meta.currentPick}`;
        let timeHtml = "";

        // 🛑 No draft scheduled
  if (draftStartTime === null) {
    // 🛑 Draft start time not found at all
    timerDiv.innerHTML = `
        <div style="font-size: 16px;">Draft not scheduled</div>
        <div style="font-size: 24px;">Waiting...</div>
    `;
    clearInterval(interval);
    return;
}

if (now < draftStartTime) {
    // 🟡 Draft scheduled but not started yet
    const fullSec = pickLimitSec;
    const h = Math.floor(fullSec / 3600);
    const m = Math.floor((fullSec % 3600) / 60);

    timerDiv.style.color = "#fff"; // reset color

    timerDiv.innerHTML = `
        <div style="font-size: 16px;">Draft Not Started</div>
        <div style="font-size: 50px; font-weight: 900; font-family:'Industry', sans-serif;">
            ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}
        </div>
        <div style="display: flex; justify-content: center; gap: 30px; font-size: 10px; font-weight: normal; margin-top: -4px;">
            <div style="width: 40px; text-align: center;">Hours</div>
            <div style="width: 40px; text-align: center;">Minutes</div>
        </div>
    `;
    return;
}


        // 🟢 Draft has started
        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        const s = remaining % 60;

        if (remaining <= 10) {
            timerDiv.style.color = "#ff4d4f"; // 🔴 flash red near expiration
        } else {
            timerDiv.style.color = "#fff";
        }

        if (h >= 1) {
            timeHtml = `
                <div style="font-size: 50px; font-weight: 900; font-family:'Industry', sans-serif;">
                    ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}
                </div>
                <div style="display: flex; justify-content: center; gap: 30px; font-size: 10px; font-weight: normal; margin-top: -4px;">
                    <div style="width: 40px; text-align: center;">Hours</div>
                    <div style="width: 40px; text-align: center;">Minutes</div>
                </div>
            `;
        } else {
            timeHtml = `
                <div style="font-size: 50px; font-weight: 900; font-family:'Industry', sans-serif;">
                    ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}
                </div>
                <div style="display: flex; justify-content: center; gap: 30px; font-size: 10px; font-weight: normal; margin-top: -4px;">
                    <div style="width: 40px; text-align: center;">Minutes</div>
                    <div style="width: 40px; text-align: center;">Seconds</div>
                </div>
            `;
        }

        timerDiv.innerHTML = `
            <div style="font-size: 16px;">${roundInfo}</div>
            ${timeHtml}
        `;

        if (remaining <= 0) {
            clearInterval(interval);
            timerDiv.innerHTML = `
                <div style="font-size: 16px;">${roundInfo}</div>
                <div style="font-size: 24px;">⏰ Timer Expired</div>
            `;
        }
    }

    updateClock(deadline);
    interval = setInterval(() => updateClock(deadline), 1000);
}








    let lastSeenDraftPickCount = 0;

    document.addEventListener("DOMContentLoaded", async () => {
        const leagueId = window.league_id || window.customLeagueId;

        // 🟢 1. Load team info & bye weeks
        window.teamInfo = await fetchTeamInfo(leagueId);
        window.byeWeeksMap = await fetchNFLByeWeeks(year);

        // 🟢 2. Load previous year fantasy points
        const lastYearScores = await fetchLastYearFantasyPoints();

        // 🟢 3. Build UI
        buildPlayerPoolTable(lastYearScores);

        // 🟢 4. Start draft timer
        initLiveDraftClock();

        // 🟢 5. Track queued players
        const destinationList = document.querySelector('#destination_list');
        const queuedPlayerIDs = destinationList
            ? Array.from(destinationList.options).map(opt => opt.value)
            : [];

        queuedPlayerIDs.forEach(playerId => {
            const button = document.querySelector(`button.draft-btn[data-player-id="${playerId}"]`);
            if (button) {
                button.classList.add("queued-player");
                button.textContent = "Remove";
            }
        });

        renderQueueSidebar();
        injectMobileViewButtons();

        handleResizeForMobileNav();
        window.addEventListener("resize", handleResizeForMobileNav);

        const playerQueueSidebar = document.querySelector("#player-queue-sidebar");
        if (playerQueueSidebar) {
            console.log("Found #player-queue-sidebar — it's NOT your turn.");
            document.body.classList.add("not-your-turn");
        } else {
            console.log("Did NOT find #player-queue-sidebar — it's YOUR turn.");
            document.body.classList.add("your-turn");
        }

        // 🟡 Initialize lastSeenDraftPickCount
        const initialXml = await fetchLiveDraftResultsXML();
        const initialPicks = Array.from(initialXml?.querySelectorAll("draftPick") || []);
        lastSeenDraftPickCount = initialPicks.length;
        console.log(`📌 Initialized lastSeenDraftPickCount = ${lastSeenDraftPickCount}`);

        // 🔁 Start polling every 10 seconds
        setInterval(pollForDraftUpdates, 10000);
    });

}
