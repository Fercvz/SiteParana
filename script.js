// Debugging Global Errors
window.onerror = function (msg, url, line, col, error) {
    alert("Error: " + msg + "\nLine: " + line);
    return false;
};

document.addEventListener('DOMContentLoaded', async () => {
    // alert("JS Loaded OK"); // Uncomment to verify basic load
    // DOM Elements - Globals for inner scope
    let sidebar, mapContainer, svgElement;
    // Vars initialized later or globally
    const closeSidebarBtn = document.getElementById('close-sidebar');
    const citySearch = document.getElementById('city-search');
    const datalist = document.getElementById('cities-list');
    const themeToggle = document.getElementById('theme-toggle');
    const tooltip = document.getElementById('tooltip');

    // Controls
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomResetBtn = document.getElementById('zoom-reset');
    const visModeSelect = document.getElementById('vis-mode');
    const legendContainer = document.getElementById('map-legend');

    // Filters
    const filterParty = document.getElementById('filter-party');
    const resetFiltersBtn = document.getElementById('reset-filters');
    const highlightCount = document.getElementById('highlight-count');

    // Estado da Aplicação (Login removido/Aberto)
    // Estado da Aplicação
    let isLoggedIn = false;
    let authToken = null;
    let activeCityId = null;
    let citiesData = {};
    let campaignData = {};
    let eleitoradoData = {};
    let filters = {
        party: 'all'
    };
    let currentVisMode = 'none';

    // Cores dos Partidos (Oficiais/Aproximadas)
    const PARTY_COLORS = {
        "PSD": "#F59E0B",   // Amarelo/Laranja forte
        "PP": "#0EA5E9",    // Azul Claro
        "MDB": "#16A34A",   // Verde
        "PL": "#172554",    // Azul Marinho Escuro
        "União Brasil": "#f6ff00fa", // Teal/Turquesa (bem distinto)
        "PSB": "#CA8A04",   // Dourado/Mostarda (mais visível que amarelo)
        "Republicanos": "#7C3AED", // Roxo/Violeta (distinto)
        "PODE": "#84CC16",  // Verde Lima (bem distinto do MDB)
        "PRD": "#475569",   // Cinza Azulado
        "NOVO": "#EA580C",  // Laranja
        "CIDADANIA": "#DB2777", // Rosa/Magenta
        "SOLIDARIEDADE": "#D97706", // Laranja Queimado
        "PSDB": "#0470c2ff",  // Azul Médio
        "PT": "#DC2626",    // Vermelho
        "PDT": "#771515ff",   // Vermelho Escuro
        "AVANTE": "#7C3AED", // Roxo (Just in case)
        "Podemos": "#ed3a9cff",
        "Outros": "#94A3B8",
        "Não informado": "#CBD5E1"
    };

    const PARTIES = Object.keys(PARTY_COLORS).filter(k => k !== 'Outros' && k !== 'Não informado');

    // Pan/Zoom State
    let scale = 1;
    let pointX = 0;
    let pointY = 0;
    let isDragging = false;
    let startX, startY;

    // Check Protocol immediately (Optional, can be relaxed now)
    if (window.location.protocol === 'file:' && !document.getElementById('mapa-pr')) {
        // Keep warning only if SVG is MISSING
        mapContainer.innerHTML = `...`;
        return;
    }

    try {
        // 1. Get Embedded SVG or Fallback
        svgElement = document.getElementById('mapa-pr');

        if (!svgElement) {
            // Fallback: Tenta fetch se não estiver embutido (caso o python falhe)
            console.log("SVG not found in DOM, fetching...");
            const svgResponse = await fetch('mapa_pr.svg');
            if (!svgResponse.ok) throw new Error(`Erro SVG: ${svgResponse.status}`);
            const svgText = await svgResponse.text();

            const mapSvgLayer = document.getElementById('map-svg-layer') || mapContainer;
            mapSvgLayer.innerHTML = svgText;
            svgElement = document.getElementById('mapa-pr');
        }

        if (!svgElement) throw new Error("SVG do mapa não pôde ser carregado.");

        // 2. Setup mapGroup link
        mapGroup = svgElement.querySelector('g') || svgElement;

        // 3. Load Data
        const jsonResponse = await fetch('cidades_pr.json?v=20260116');
        if (!jsonResponse.ok) throw new Error(`Erro JSON: ${jsonResponse.status}`);
        citiesData = await jsonResponse.json();

        initApp();
    } catch (error) {
        console.error("Error initializing:", error);
        mapContainer.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; color:var(--text-secondary); text-align:center; padding:1rem;">
                <div style="font-size:3rem; margin-bottom:1rem;">❌</div>
                <h3 style="color:var(--text-primary); margin-bottom:0.5rem;">Erro de Inicialização</h3>
                <p style="color:#ef4444; font-family:monospace; background:rgba(239, 68, 68, 0.1); padding:0.5rem; border-radius:4px; margin-bottom:1rem;">
                    ${error.message}
                </p>
                <p>Verifique se os arquivos 'mapa_pr.svg' e 'cidades_pr.json' estão na pasta correta.</p>
                <a href="http://localhost:8082" style="margin-top:1rem; color:var(--accent-color); font-weight:600;">Tentar novamente em 8082</a>
            </div>
        `;
    }

    // State duplicado removido
    // As variáveis globais já foram declaradas no topo do arquivo.
    let chartInstances = {};
    // isLoggedIn e authToken já existem.



    // --- Search Logic ---
    window.filterCities = function (query) {
        if (!svgElement) svgElement = document.getElementById('map-svg-layer'); // Ensure valid ref

        if (!query) {
            // search reset
            const paths = svgElement.querySelectorAll('path');
            paths.forEach(p => {
                p.classList.remove('dimmed', 'highlight-filter');
                p.style.display = ''; // Show all
            });
            if (highlightCount) highlightCount.innerText = "399";
            return;
        }

        const lowerQuery = query.toLowerCase();
        let matches = 0;
        const paths = svgElement.querySelectorAll('path');

        paths.forEach(path => {
            const city = citiesData[path.id];
            if (city && city.nome.toLowerCase().includes(lowerQuery)) {
                path.classList.remove('dimmed');
                path.classList.add('highlight-filter');
                path.style.display = '';
                matches++;
                if (matches === 1) {
                    // can zoom to first
                }
            } else {
                path.classList.add('dimmed');
                path.classList.remove('highlight-filter');
                // Optional: hide non-matches or just dim? 
                // path.style.display = 'none'; // Keeping them visible but dimmed is better for context
            }
        });

        if (highlightCount) highlightCount.innerText = matches;
    }

    async function initApp() {
        // Setup Mobile Toggles
        setupMobileInteractions();

        // Theme Toggle Fix
        setupThemeToggle();

        // Initialize Globals
        sidebar = document.getElementById('sidebar'); // City details sidebar
        mapContainer = document.getElementById('map-container');

        injectMockData(); // Ensure complete data coverage
        initFilters();    // Populate dropdowns and setup ranges
        initMapInteractions();
        initSearch(); // Call improved search init
        setupZoomPan();
        initTabs();       // Sistema de abas
        loadEleitoradoData(); // Carrega dados eleitorais

        // Novos Inicializadores de Campanha/Login
        initLogin();
        await loadCampaignGlobalStats();
        initDraggableModals();

        // Initial Render
        updateMapDisplay();
    }

    function setupThemeToggle() {
        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) {
            // Remove listeners antigos cloning
            const newBtn = themeBtn.cloneNode(true);
            themeBtn.parentNode.replaceChild(newBtn, themeBtn);

            newBtn.addEventListener('click', () => {
                const isDark = document.body.getAttribute('data-theme') === 'dark';
                document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
                // newBtn.textContent = isDark ? '🌙' : '☀️'; // Opz, ícones podem ser fixos ou mudar
            });
        }
    }

    function setupMobileInteractions() {
        // Removed for Desktop/Web reversion
    }

    // --- Draggable Modals ---
    function initDraggableModals() {
        const modals = document.querySelectorAll('.modal-content');

        modals.forEach(modal => {
            const header = modal.querySelector('.modal-header') || modal.querySelector('h2'); // h2 for login modal
            if (!header) return;

            header.style.cursor = 'move';

            let isDragging = false;
            let currentX;
            let currentY;
            let initialX;
            let initialY;
            let xOffset = 0;
            let yOffset = 0;

            header.addEventListener('mousedown', dragStart);
            document.addEventListener('mouseup', dragEnd);
            document.addEventListener('mousemove', drag);

            function dragStart(e) {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;

                if (e.target === header || header.contains(e.target)) {
                    isDragging = true;
                }
            }

            function dragEnd(e) {
                initialX = currentX;
                initialY = currentY;
                isDragging = false;
            }

            function drag(e) {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;

                    xOffset = currentX;
                    yOffset = currentY;

                    setTranslate(currentX, currentY, modal);
                }
            }

            function setTranslate(xPos, yPos, el) {
                el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
            }
        });
    }

    // --- Auth & Campaign Logic ---
    function initLogin() {
        const loginBtn = document.getElementById('login-btn');
        const loginModal = document.getElementById('login-modal');
        const closeLogin = document.getElementById('close-login');
        const btnPerform = document.getElementById('btn-perform-login');

        // Abre modal
        if (loginBtn) {
            loginBtn.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent any weird default behaviors
                if (isLoggedIn) {
                    // Logout simples
                    isLoggedIn = false;
                    loginBtn.innerText = "Entrar";
                    document.getElementById('campaign-stats').classList.add('hidden');

                    // Esconde a aba de campanha
                    const tabBtnCampaign = document.getElementById('tab-btn-campaign');
                    if (tabBtnCampaign) {
                        tabBtnCampaign.classList.add('hidden');
                    }

                    const tabBtnInsights = document.getElementById('tab-btn-insights');
                    if (tabBtnInsights) {
                        tabBtnInsights.classList.add('hidden');
                    }

                    const activeTab = document.querySelector('.tab-btn.active');
                    if (activeTab && (activeTab.dataset.tab === 'campaign' || activeTab.dataset.tab === 'insights')) {
                        document.querySelector('.tab-btn[data-tab="info"]').click();
                    }

                    toggleCampaignVisualizations(false);

                    // Limpa campos de input para garantir
                    document.getElementById('input-votes').value = "";
                    document.getElementById('input-money').value = "";

                    // Limpa textos de insights
                    ['ins-votes', 'ins-money', 'ins-conversion', 'ins-cost-vote', 'ins-cost-pop', 'ins-share'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.innerText = "-";
                    });

                    alert("Você saiu do sistema.");
                } else {
                    loginModal.classList.remove('hidden');
                    loginModal.style.display = ''; // Limpa inline style (setado/fechado por performLogin)
                }
            });
        }

        // Fecha modal
        if (closeLogin) {
            closeLogin.addEventListener('click', () => {
                loginModal.classList.add('hidden');
                document.getElementById('login-msg').innerText = "";
            });
        }

        // Ação de Login (Form Submit - Robust "Enter" support)
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault(); // Stop page reload
                performLogin();
            });
        }

        // Manual keyup removed

        // Salvar Campanha
        const btnSave = document.getElementById('btn-save-campaign');
        if (btnSave) {
            btnSave.addEventListener('click', saveCampaignData);
        }
    }

    async function performLogin() {
        const user = (document.getElementById('login-user').value || '').trim();
        const pass = (document.getElementById('login-pass').value || '').trim();
        const msg = document.getElementById('login-msg');

        // Feedback visual imediato
        msg.innerText = "Verificando credenciais...";
        msg.style.color = "var(--text-secondary)";

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            });

            if (res.ok) {
                const data = await res.json();
                isLoggedIn = true;
                authToken = data.token;

                // Força o fechamento do modal
                const modal = document.getElementById('login-modal');
                if (modal) {
                    modal.classList.add('hidden'); // CSS class
                    modal.style.display = 'none';  // Inline styles fallback
                }

                document.getElementById('login-btn').innerText = "Sair";
                document.getElementById('campaign-stats').classList.remove('hidden');
                document.getElementById('campaign-stats').style.display = 'flex'; // Ensure visibility

                // Exibe a aba de campanha
                const tabBtnCampaign = document.getElementById('tab-btn-campaign');
                if (tabBtnCampaign) {
                    tabBtnCampaign.classList.remove('hidden');
                    tabBtnCampaign.click(); // Auto-select tab
                }

                const tabBtnInsights = document.getElementById('tab-btn-insights');
                if (tabBtnInsights) {
                    tabBtnInsights.classList.remove('hidden');
                }

                // Limpa mensagem
                msg.innerText = "";

                // Atualiza UI se tiver cidade selecionada
                if (activeCityId && typeof populateSidebar === 'function') {
                    populateSidebar(activeCityId);
                }

                // Carrega dados globais
                loadCampaignGlobalStats();
                toggleCampaignVisualizations(true);

            } else {
                msg.style.color = "#ef4444"; // Red
                if (res.status === 401) {
                    msg.innerText = "Usuário ou senha incorretos.";
                } else {
                    msg.innerText = `Erro no servidor: ${res.status}`;
                }
            }
        } catch (e) {
            console.error(e);
            msg.style.color = "#ef4444";
            msg.innerText = "Erro de conexão. Verifique o terminal.";
        }
    }

    async function loadCampaignGlobalStats() {
        try {
            const res = await fetch('/api/campaign/data');
            if (res.ok) {
                campaignData = await res.json(); // Atualiza cache

                let totalVotes = 0;
                let totalMoney = 0;

                Object.values(campaignData).forEach(c => {
                    totalVotes += (c.votes || 0);
                    totalMoney += (c.money || 0);
                });

                document.getElementById('global-votes').innerText = totalVotes.toLocaleString('pt-BR');
                document.getElementById('global-money').innerText = totalMoney.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            }
        } catch (e) {
            console.warn("Erro ao carregar stats globais:", e);
        }
    }

    function updateSidebarCampaign(slug) {
        if (!isLoggedIn) return;

        document.getElementById('save-msg').innerText = "";

        // Preencher dados se existirem no cache
        const data = campaignData[slug] || { votes: 0, money: 0 };

        const inputVotes = document.getElementById('input-votes');
        const inputMoney = document.getElementById('input-money');

        if (inputVotes) inputVotes.value = data.votes || 0;
        if (inputMoney) inputMoney.value = data.money || 0;
    }

    async function saveCampaignData() {
        if (!activeCityId) return;

        const votes = parseInt(document.getElementById('input-votes').value) || 0;
        const money = parseFloat(document.getElementById('input-money').value) || 0;
        const msg = document.getElementById('save-msg');

        try {
            const res = await fetch('/api/campaign/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    city_slug: activeCityId,
                    votes: votes,
                    money: money
                })
            });

            if (res.ok) {
                msg.style.color = 'green';
                msg.innerText = "Salvo com sucesso!";

                // Atualiza cache e totais
                campaignData[activeCityId] = { votes, money };
                loadCampaignGlobalStats();

                // Atualiza Insights e Mapa
                if (typeof updateInsights === 'function') {
                    updateInsights(activeCityId);
                }
                updateMapDisplay();
            } else {
                msg.style.color = 'red';
                msg.innerText = "Erro ao salvar.";
            }
        } catch (e) {
            msg.style.color = 'red';
            msg.innerText = "Erro de conexão.";
        }
    }

    // Carrega dados eleitorais do TSE
    async function loadEleitoradoData() {
        try {
            const response = await fetch('dados_eleitorais.json');
            if (response.ok) {
                eleitoradoData = await response.json();
            }
        } catch (e) {
            console.warn('Dados eleitorais não encontrados:', e);
        }
    }

    // Sistema de Abas
    function initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');

                // Remove active de todos
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                // Ativa o clicado
                btn.classList.add('active');
                document.getElementById(`tab-${tabId}`).classList.add('active');
            });
        });
    }

    // --- 1. Data Management ---
    function injectMockData() {
        const paths = svgElement.querySelectorAll('path');

        paths.forEach(path => {
            const id = path.id;

            // Create base object if missing
            if (!citiesData[id]) {
                citiesData[id] = {
                    nome: path.getAttribute('data-name') || id,
                    descricao: "Município do estado do Paraná."
                };
            }

            const city = citiesData[id];

            // Deterministic assignment for Party (stable across reloads)
            if (!city.partido || city.partido === "Não informado") {
                let hash = 0;
                for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
                city.partido = PARTIES[Math.abs(hash) % PARTIES.length];
            }

            // Weighted Random Population
            if (!city.habitantes) {
                const r = Math.random();
                let pop;
                if (r > 0.98) pop = 300000 + Math.random() * 1500000; // Curitiba/Londrina scale
                else if (r > 0.90) pop = 50000 + Math.random() * 250000;
                else pop = 2000 + Math.random() * 48000;
                city.habitantes = Math.floor(pop);
            }

            // Area
            if (!city.area_km2) {
                city.area_km2 = Math.floor(Math.random() * 1500) + 100;
            }

            // Derived and Additional Mock Data
            if (!city.densidade) city.densidade = (city.habitantes / city.area_km2).toFixed(2);

            // PIB per capita
            if (!city.pib_per_capita) {
                // Extrai do campo economia se existir
                if (city.economia && city.economia.includes('PIB per Capita')) {
                    const match = city.economia.match(/R\$\s*([\d.,]+)/);
                    if (match) {
                        city.pib_per_capita = parseFloat(match[1].replace('.', '').replace(',', '.'));
                    }
                }
                // Se ainda não tiver, gera valor aleatório baseado na população
                if (!city.pib_per_capita) {
                    const basePib = 20000 + Math.random() * 80000;
                    city.pib_per_capita = parseFloat(basePib.toFixed(2));
                }
            }

            // IDHM
            if (!city.idhm) {
                city.idhm = (0.65 + Math.random() * 0.15).toFixed(3);
            }

            // Gentílico
            if (!city.gentilico) {
                city.gentilico = "Não informado";
            }

            // Aniversário
            if (!city.aniversario) {
                city.aniversario = "Não informado";
            }

            // Mock Political Data (if missing)
            if (!city.prefeito) city.prefeito = "Prefeito não informado";
            if (!city.vice_prefeito) city.vice_prefeito = "Vice não informado";
        });
    }

    function initFilters() {
        // Populate Party Dropdown Dynamically
        if (filterParty) {
            filterParty.innerHTML = '<option value="all">Todos</option>';
            PARTIES.sort().forEach(party => {
                const opt = document.createElement('option');
                opt.value = party;
                opt.innerText = party;
                filterParty.appendChild(opt);
            });
        }
    }


    // --- 2. Unified Map Display Logic ---
    function updateMapDisplay() {
        const paths = svgElement.querySelectorAll('path');
        let matchCount = 0;

        // Prepare Visualization Data
        let minVal = Infinity, maxVal = -Infinity;
        let dataField = null;
        let useCampaignData = false;
        let campaignField = null;
        let filteredCities = [];

        if (currentVisMode === 'heatmap-pop') {
            dataField = 'habitantes';
        } else if (currentVisMode === 'heatmap-pib') {
            dataField = 'pib_per_capita';
        } else if (currentVisMode === 'heatmap-votes') {
            useCampaignData = true;
            campaignField = 'votes';
        } else if (currentVisMode === 'heatmap-money') {
            useCampaignData = true;
            campaignField = 'money';
        }

        if (dataField || useCampaignData) {
            Object.keys(citiesData).forEach(slug => {
                let val = 0;
                if (useCampaignData) {
                    const cData = campaignData[slug] || { votes: 0, money: 0 };
                    val = parseFloat(cData[campaignField]) || 0;
                } else {
                    val = parseFloat(citiesData[slug][dataField]) || 0;
                }

                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
            });
            if (minVal === maxVal) maxVal = minVal + 1;
        }

        paths.forEach(path => {
            const city = citiesData[path.id];
            if (!city) return;

            // 1. Check Filters
            let isMatch = true;
            if (filters.party !== 'all' && city.partido !== filters.party) isMatch = false;

            // 2. Apply Base Visualization Color
            let fill = '';
            if (currentVisMode === 'party') {
                fill = PARTY_COLORS[city.partido] || '#ccc';
            } else if (dataField || useCampaignData) {
                let val = 0;
                if (useCampaignData) {
                    const cData = campaignData[path.id] || { votes: 0, money: 0 };
                    val = parseFloat(cData[campaignField]) || 0;
                } else {
                    val = parseFloat(city[dataField]) || 0;
                }

                // 1. Zero check - Gray color
                if (val === 0) {
                    fill = '#e5e7eb'; // Light Gray
                } else {
                    let ratio = 0;

                    // 2. Rank-Based Scaling for Pop/PIB (Guarantees distribution)
                    if (dataField === 'habitantes' || dataField === 'pib_per_capita') {
                        if (!window.mapSortedValues || window._sortedCacheKey !== dataField) {
                            // Create cache of sorted positive values
                            const values = Object.values(citiesData)
                                .map(c => parseFloat(c[dataField]) || 0)
                                .filter(v => v > 0)
                                .sort((a, b) => a - b);
                            window.mapSortedValues = values;
                            window._sortedCacheKey = dataField;
                        }

                        // Find rank
                        const sorted = window.mapSortedValues;
                        let rank = 0;
                        let lo = 0, hi = sorted.length - 1;
                        while (lo <= hi) {
                            const mid = (lo + hi) >> 1;
                            if (sorted[mid] < val) lo = mid + 1;
                            else hi = mid - 1;
                        }
                        rank = lo;

                        ratio = rank / Math.max(sorted.length - 1, 1);

                    } else {
                        // Linear (Campanha)
                        if (maxVal > minVal) {
                            ratio = (val - minVal) / (maxVal - minVal);
                        }
                    }
                    fill = getHeatmapColor(ratio);
                }
            }

            // 3. Apply Styles to DOM
            if (fill) {
                path.style.fill = fill;
            } else {
                path.style.fill = ''; // Revert to CSS default
            }

            if (isMatch) {
                path.classList.remove('dimmed');
                path.classList.add('highlight-filter');
                matchCount++;
                filteredCities.push({
                    nome: city.nome,
                    partido: city.partido
                });
            } else {
                path.classList.add('dimmed');
                path.classList.remove('highlight-filter');
            }
        });

        // Ordena cidades
        filteredCities.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        // Update UI
        if (highlightCount) highlightCount.innerText = matchCount;
        updateLegend(minVal, maxVal, (dataField || campaignField), filteredCities);

        if (currentVisMode !== 'none') {
            mapContainer.classList.add('visualizing');
            // Force Light Background as requested
            mapContainer.style.backgroundColor = '#e2e8f0';
        }
        else {
            mapContainer.classList.remove('visualizing');
            mapContainer.style.backgroundColor = ''; // Revert to CSS default
        }
        // Prevent background change (User request #4)
        // mapContainer.style.backgroundColor = ''; // Reset if needed, or rely on CSS not handling .visualizing for BG anymore

        const hasFilters = filters.party !== 'all';
        if (hasFilters) mapContainer.classList.add('filtering');
        else mapContainer.classList.remove('filtering');
    }

    // Heatmap: "Turbo-like" Rainbow spectrum for high contrast
    function getHeatmapColor(t) {
        // 0.0 (Low) -> 1.0 (High)
        // Purple -> Blue -> Cyan -> Green -> Yellow -> Orange -> Red -> Dark Red
        if (t < 0.14) return interpolateColor('#4c1d95', '#3b82f6', t / 0.14);          // Roxo Escuro -> Azul
        if (t < 0.28) return interpolateColor('#3b82f6', '#06b6d4', (t - 0.14) / 0.14);  // Azul -> Ciano
        if (t < 0.42) return interpolateColor('#06b6d4', '#22c55e', (t - 0.28) / 0.14);  // Ciano -> Verde
        if (t < 0.57) return interpolateColor('#22c55e', '#eab308', (t - 0.42) / 0.15);  // Verde -> Amarelo
        if (t < 0.71) return interpolateColor('#eab308', '#f97316', (t - 0.57) / 0.14);  // Amarelo -> Laranja
        if (t < 0.85) return interpolateColor('#f97316', '#dc2626', (t - 0.71) / 0.14);  // Laranja -> Vermelho
        return interpolateColor('#dc2626', '#7f1d1d', (t - 0.85) / 0.15);                // Vermelho -> Vinho
    }

    function interpolateColor(c1, c2, factor) {
        const parse = c => c.match(/\w\w/g).map(x => parseInt(x, 16));
        const [r1, g1, b1] = parse(c1);
        const [r2, g2, b2] = parse(c2);

        const r = Math.round(r1 + factor * (r2 - r1));
        const g = Math.round(g1 + factor * (g2 - g1));
        const b = Math.round(b1 + factor * (b2 - b1));
        return `rgb(${r},${g},${b})`;
    }

    function updateLegend(min, max, dataField, filteredCities = []) {
        // Find or create legend container in Left Sidebar
        let leftSidebarLegend = document.getElementById('sidebar-legend-container');
        if (!leftSidebarLegend) {
            const sidebar = document.querySelector('.left-sidebar');
            leftSidebarLegend = document.createElement('div');
            leftSidebarLegend.id = 'sidebar-legend-container';
            leftSidebarLegend.className = 'sidebar-section legend-box';
            sidebar.appendChild(leftSidebarLegend);
        }

        leftSidebarLegend.innerHTML = '';
        leftSidebarLegend.classList.add('hidden');

        // Also clear the map-absolute legend just in case (we are moving it)
        legendContainer.innerHTML = '';
        legendContainer.classList.add('hidden');

        if (currentVisMode === 'party') {
            leftSidebarLegend.innerHTML = '<h3>Legenda</h3>';

            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = '1fr'; // List view usually looks better in sidebar
            grid.style.gap = '6px';

            // Calculate counts per party
            const partyCounts = {};
            let missingPartyCount = 0;

            Object.values(citiesData).forEach(city => {
                const p = city.partido ? city.partido.trim() : null;
                if (p && p !== 'null' && p !== 'undefined') {
                    partyCounts[p] = (partyCounts[p] || 0) + 1;
                } else {
                    missingPartyCount++;
                    // console.warn('Missing party for:', city.nome); // Debug
                }
            });

            // Filter parties with count > 0 and sort frequencies or alphabetical?
            // User asked: "Deixe aparecendo somente os partidos políticos que possuem valores"
            const activeParties = Object.keys(partyCounts).filter(p => partyCounts[p] > 0);

            // Sort by count desc
            activeParties.sort((a, b) => partyCounts[b] - partyCounts[a]);

            activeParties.forEach(label => {
                const color = PARTY_COLORS[label] || '#999';
                const count = partyCounts[label];

                const div = document.createElement('div');
                div.className = 'legend-item';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.fontSize = '0.85rem';

                div.innerHTML = `
                    <div class="legend-color" style="background:${color}; width:12px; height:12px; border-radius:2px; margin-right:8px;"></div>
                    <span style="flex:1; color:var(--text-primary);">${label}</span>
                    <span style="font-weight:600; color:var(--text-secondary); margin-left:4px;">${count}</span>
                `;
                grid.appendChild(div);
            });

            // Handle cities without party if any (fixing issue #3 visual)
            if (missingPartyCount > 0) {
                const div = document.createElement('div');
                div.className = 'legend-item';
                div.innerHTML = `<div class="legend-color" style="background:#cbd5e1; width:12px; height:12px; border-radius:2px; margin-right:8px;"></div><span>Sem Partido</span><span style="font-weight:600; margin-left:auto;">${missingPartyCount}</span>`;
                grid.appendChild(div);
            }

            leftSidebarLegend.appendChild(grid);
            leftSidebarLegend.classList.remove('hidden');

        } else if (dataField || currentVisMode.startsWith('heatmap')) {
            // For Heatmaps, displaying in Sidebar is also cleaner
            let title = '';
            let formatFn;

            if (currentVisMode === 'heatmap-pop' || dataField === 'habitantes') {
                title = 'Habitantes';
                formatFn = (v) => v.toLocaleString('pt-BR');
            } else if (currentVisMode === 'heatmap-pib' || dataField === 'pib_per_capita') {
                title = 'PIB per capita';
                formatFn = (v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else if (currentVisMode === 'heatmap-votes' || dataField === 'votes') {
                title = 'Campanha: Total de Votos';
                formatFn = (v) => Math.round(v).toLocaleString('pt-BR');
            } else if (currentVisMode === 'heatmap-money' || dataField === 'money') {
                title = 'Campanha: Investimento Total';
                formatFn = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            } else {
                return; // Unknown mode
            }

            leftSidebarLegend.innerHTML = `<h3>${title}</h3>`;
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.flexDirection = 'column';
            div.style.gap = '8px';

            // Container para a barra com evento
            const barContainer = document.createElement('div');
            barContainer.style.position = 'relative';
            barContainer.style.height = '16px';
            barContainer.style.marginBottom = '4px';

            const bar = document.createElement('div');
            bar.style.width = '100%';
            bar.style.height = '100%';
            bar.style.background = 'linear-gradient(to right, #4c1d95, #3b82f6, #06b6d4, #22c55e, #eab308, #f97316, #dc2626, #7f1d1d)';
            bar.style.borderRadius = '4px';
            bar.style.cursor = 'crosshair';

            // Eventos da régua (Tooltip)
            bar.addEventListener('mousemove', (e) => {
                const rect = bar.getBoundingClientRect();
                const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                const pct = x / rect.width;

                let val = 0;
                // Reverse calculation Logic
                if ((currentVisMode === 'heatmap-pop' || currentVisMode === 'heatmap-pib') && window.mapSortedValues) {
                    const idx = Math.floor(pct * (window.mapSortedValues.length - 1));
                    val = window.mapSortedValues[idx];
                } else {
                    val = min + pct * (max - min);
                    if (max > min * 100) {
                        const minLog = Math.log(Math.max(min, 1));
                        const maxLog = Math.log(Math.max(max, 1));
                        val = Math.exp(minLog + pct * (maxLog - minLog));
                    }
                }

                const tooltip = document.getElementById('tooltip');
                tooltip.style.left = e.pageX + 15 + 'px';
                tooltip.style.top = e.pageY + 15 + 'px';
                tooltip.innerHTML = `<strong>${formatFn(val)}</strong>`;
                tooltip.classList.remove('hidden');
            });

            bar.addEventListener('mouseleave', () => {
                document.getElementById('tooltip').classList.add('hidden');
            });

            barContainer.appendChild(bar);
            div.appendChild(barContainer);

            const rangeLabels = document.createElement('div');
            rangeLabels.style.display = 'flex';
            rangeLabels.style.justifyContent = 'space-between';
            rangeLabels.style.fontSize = '0.75rem';
            rangeLabels.style.color = 'var(--text-secondary)';
            rangeLabels.innerHTML = `<span>${formatFn(min)}</span><span>${formatFn(max)}</span>`;
            div.appendChild(rangeLabels);

            leftSidebarLegend.appendChild(div);
            leftSidebarLegend.classList.remove('hidden');
        }

        // Logic for Filtered Cities List (Show when filtering by party)
        if (filters.party !== 'all') {
            // Re-calculate filtered cities if empty (fallback)
            if (filteredCities.length === 0) {
                Object.values(citiesData).forEach(city => {
                    if (city.partido === filters.party) filteredCities.push(city);
                });
                filteredCities.sort((a, b) => a.nome.localeCompare(b.nome));
            }
            updateFilteredCitiesList(filteredCities);
        } else {
            const existingList = document.getElementById('filtered-cities-panel');
            if (existingList) existingList.remove();
        }
    }

    function toggleCampaignVisualizations(show) {
        const visSelect = document.getElementById('vis-mode');
        if (!visSelect) return;

        // IDs of campaign options
        const CAMPAIGN_OPTS = ['heatmap-votes', 'heatmap-money'];

        if (show) {
            // Check if they exist, if not add them
            if (!visSelect.querySelector('option[value="heatmap-votes"]')) {
                const opt1 = document.createElement('option');
                opt1.value = 'heatmap-votes';
                opt1.innerText = 'Total de Votos (Mapa de Calor)';
                opt1.style.color = '#dc2626'; // Highlight as admin feature
                visSelect.appendChild(opt1);

                const opt2 = document.createElement('option');
                opt2.value = 'heatmap-money';
                opt2.innerText = 'Investimento Total (Mapa de Calor)';
                opt2.style.color = '#dc2626';
                visSelect.appendChild(opt2);
            }
        } else {
            // Se o modo atual for restrito, reseta para padrão antes de remover as opções
            if (CAMPAIGN_OPTS.includes(currentVisMode) || CAMPAIGN_OPTS.includes(visSelect.value)) {
                visSelect.value = 'none';
                currentVisMode = 'none';
                updateMapDisplay();
            }

            // Remove options
            CAMPAIGN_OPTS.forEach(val => {
                const opt = visSelect.querySelector(`option[value="${val}"]`);
                if (opt) opt.remove();
            });
        }
    }

    // Função para mostrar lista de cidades filtradas
    function updateFilteredCitiesList(cities) {
        let panel = document.getElementById('filtered-cities-panel');

        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'filtered-cities-panel';
            // Styling directly here for robustness, or usually in CSS
            panel.style.position = 'absolute';
            panel.style.top = '70px'; // Below header
            panel.style.left = '320px'; // Right of sidebar
            panel.style.width = '250px';
            panel.style.background = 'var(--card-bg, white)';
            panel.style.border = '1px solid var(--border-color, #ccc)';
            panel.style.borderRadius = '8px';
            panel.style.padding = '15px';
            panel.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            panel.style.zIndex = '900';
            panel.style.maxHeight = 'calc(100vh - 100px)';
            panel.style.display = 'flex';
            panel.style.flexDirection = 'column';

            // Responsive adjust
            if (window.innerWidth <= 1024) {
                panel.style.left = '20px';
                panel.style.width = 'calc(100% - 40px)';
                panel.style.top = '140px'; // Lower
            }

            document.body.appendChild(panel);
        }

        const partyColor = PARTY_COLORS[filters.party] || '#666';

        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid ${partyColor};">
                <strong style="font-size:1rem; color:var(--text-primary, #333);">Cidades - ${filters.party}</strong>
                <span style="background:${partyColor}; color:white; padding:2px 8px; border-radius:12px; font-size:0.85rem;">${cities.length}</span>
                <button onclick="document.getElementById('filtered-cities-panel').remove()" style="background:none; border:none; cursor:pointer; font-size:1.2rem; color:var(--text-secondary);">&times;</button>
            </div>
            <div style="max-height: 400px; overflow-y: auto;">
                <ul style="list-style:none; padding:0; margin:0; font-size:0.9rem;">
                ${cities.map(c => `
                    <li style="padding:6px 0; border-bottom:1px solid var(--border-color, #f0f0f0); cursor:pointer; transition:background 0.2s; color:var(--text-primary, #333);" 
                        onmouseover="this.style.background='var(--bg-secondary, #f9fafb)'; this.style.color='var(--accent-color, #2563eb)'" 
                        onmouseout="this.style.background='transparent'; this.style.color='var(--text-primary, #333)'"
                        onclick="document.getElementById('city-search').value='${c.nome}'; document.getElementById('search-btn').click();">
                        ${c.nome}
                    </li>
                `).join('')}
                </ul>
            </div>
        `;
    }


    // --- 3. Events ---
    function initMapInteractions() {
        const paths = svgElement.querySelectorAll('path');
        paths.forEach(path => {
            path.addEventListener('click', (e) => {
                e.stopPropagation();
                selectCity(path.id); // Robust selection
                console.log('Clicked:', path.id); // Debug Log
            });
            path.addEventListener('mouseenter', (e) => showTooltip(citiesData[path.id]?.nome || path.id, e));
            path.addEventListener('mouseleave', hideTooltip);
            path.addEventListener('mousemove', moveTooltip);
        });

        svgElement.addEventListener('click', (e) => {
            if (e.target.tagName !== 'path') closeSidebar();
        });

        // Controls
        if (visModeSelect) {
            visModeSelect.addEventListener('change', () => {
                currentVisMode = visModeSelect.value;
                updateMapDisplay();
            });
        }

        // Filters
        const handleFilterChange = () => {
            filters.party = filterParty.value;
            updateMapDisplay();
        };

        if (filterParty) filterParty.addEventListener('change', handleFilterChange);

        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                filterParty.value = 'all';
                visModeSelect.value = 'none';

                filters = { party: 'all' };
                currentVisMode = 'none';

                updateMapDisplay();
            });
        }
    }

    function selectCity(id) {
        if (!id) return;

        if (activeCityId) {
            const prev = document.getElementById(activeCityId);
            if (prev) prev.classList.remove('active');
        }
        activeCityId = id;
        const el = document.getElementById(id);
        if (el) el.classList.add('active');

        populateSidebar(id);
        sidebar.classList.add('open');
    }

    function populateSidebar(id) {
        // Robust Lookup: Case Insensitive
        let data = citiesData[id];

        if (!data) {
            // Try detecting case mismatches
            const lowerId = id.toLowerCase();
            const key = Object.keys(citiesData).find(k => k.toLowerCase() === lowerId);
            if (key) data = citiesData[key];
        }

        // Fallback
        if (!data) {
            data = {
                nome: id,
                descricao: "Dados indisponíveis."
            };
        }

        // Atualiza título e descrição
        document.getElementById('city-name').innerText = data.nome || "Cidade";
        document.getElementById('city-desc').innerText = data.descricao || "Sem descrição disponível.";

        // Função auxiliar para setar valores
        const set = (eid, val) => {
            const el = document.getElementById(eid);
            if (el) el.innerText = (val !== undefined && val !== null && val !== '' && val !== 'Não informado') ? val : '-';
        };

        // 1. Nome da cidade
        set('stat-nome', data.nome);

        // 2. Gentílico
        let gentilico = data.gentilico || '-';
        if (gentilico && gentilico !== '-' && gentilico !== 'Não informado') {
            // Capitaliza primeira letra
            gentilico = gentilico.charAt(0).toUpperCase() + gentilico.slice(1);
        }
        set('stat-gentilico', gentilico);

        // 3. Prefeito
        let prefeito = data.prefeito || '-';
        if (prefeito && prefeito !== '-' && prefeito !== 'Prefeito não informado') {
            // Formata nome do prefeito (capitaliza corretamente)
            prefeito = formatName(prefeito);
        }
        set('stat-prefeito', prefeito);

        // 5. Partido político
        set('stat-partido', data.partido);

        // 6. Habitantes
        const habitantes = data.habitantes
            ? parseInt(data.habitantes).toLocaleString('pt-BR')
            : '-';
        set('stat-habitantes', habitantes);

        // 7. Área
        const area = data.area_km2
            ? parseFloat(data.area_km2).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' km²'
            : '-';
        set('stat-area', area);

        // 8. Densidade demográfica
        const densidade = data.densidade
            ? parseFloat(data.densidade).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' hab/km²'
            : '-';
        set('stat-densidade', densidade);

        // 9. IDHM
        const idhm = data.idhm
            ? parseFloat(data.idhm).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
            : '-';
        set('stat-idhm', idhm);

        // 10. PIB per capita
        let pib = '-';
        if (data.pib_per_capita) {
            pib = 'R$ ' + parseFloat(data.pib_per_capita).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else if (data.economia && data.economia.includes('PIB per Capita')) {
            // Extrai do campo economia
            const match = data.economia.match(/R\$\s*[\d.,]+/);
            if (match) pib = match[0];
        }
        set('stat-pib', pib);
        // Atualiza Aba de Eleitorado
        updateEleitoradoTab(id);

        // Atualiza Aba de Campanha (Admin)
        if (typeof updateSidebarCampaign === 'function') {
            updateSidebarCampaign(id);
        }

        // Atualiza Aba Insights (Admin)
        if (isLoggedIn && typeof updateInsights === 'function') {
            updateInsights(id);
        }
    }

    // Expose for debug
    window.eleitoradoData = eleitoradoData;
    window.updateEleitoradoTab = updateEleitoradoTab;

    // Atualiza gráficos e dados da aba eleitorado
    function updateEleitoradoTab(cityId) {
        if (!cityId) return;

        // Normaliza chave da cidade para buscar no JSON eleitoral
        // IDs do SVG geralmente já estão em snake_case e sem acentos, mas garantimos:
        // Se cityId for "Curitiba" -> "curitiba". Se "S. José" -> "s_jose" (exemplo)
        // O JSON usa: "curitiba", "sao_jose_dos_pinhais", etc.
        let key = cityId.toLowerCase().trim().replace(/-/g, '_');

        // Remove acentos caso o ID do SVG tenha escapado (ex: "vitoria")
        key = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        console.log(`[Eleitorado] Buscando dados para ID: "${cityId}" -> Chave: "${key}"`);

        const data = eleitoradoData[key];

        if (!data) {
            console.warn(`[Eleitorado] Dados não encontrados para a chave: "${key}". Verifique se o JSON foi carregado ou se a chave está correta.`);
            const totalEl = document.getElementById('total-eleitores');
            if (totalEl) totalEl.innerText = 'Indisponível';
            return;
        }

        console.log(`[Eleitorado] Dados encontrados para ${data.nome}. Total: ${data.total_eleitores}`);

        // 1. Total de Eleitores
        const totalEl = document.getElementById('total-eleitores');
        if (totalEl) totalEl.innerText = data.total_eleitores.toLocaleString('pt-BR');

        // Verifica se Chart.js está carregado
        if (typeof Chart === 'undefined') {
            console.error("[Eleitorado] Chart.js não está carregado!");
            return;
        }

        // 2. Gráficos
        renderChart('chart-genero', 'doughnut', data.genero, ['#3b82f6', '#ec4899', '#9ca3af'], ['Masculino', 'Feminino', 'Não Inf.'], false, data.total_eleitores);

        // Ordena faixas etárias
        const faixasOrder = [
            '16 anos', '17 anos', '18 anos', '19 anos', '20 anos',
            '21 a 24 anos', '25 a 29 anos', '30 a 34 anos', '35 a 39 anos',
            '40 a 44 anos', '45 a 49 anos', '50 a 54 anos', '55 a 59 anos',
            '60 a 64 anos', '65 a 69 anos', '70 a 74 anos', '75 a 79 anos',
            '80 a 84 anos', '85 a 89 anos', '90 a 94 anos', '95 a 99 anos',
            '100 anos ou mais'
        ];

        const faixaLabels = [];
        const maleValues = [];
        const femaleValues = [];

        // Filtra apenas faixas que existem
        faixasOrder.forEach(label => {
            if (data.faixa_etaria && data.faixa_etaria[label]) {
                const group = data.faixa_etaria[label];
                faixaLabels.push(label);
                // Masculino vai para a esquerda (negativo)
                maleValues.push((group.M || 0) * -1);
                // Feminino vai para a direita (positivo)
                femaleValues.push(group.F || 0);
            }
        });

        // Reverse to have youngest at bottom (Chart.js draws bottom-up on Y, or index 0 at bottom?)
        // Chart.js standard bar index/category axis usually starts from top (index 0) to bottom.
        // If we want Youngest (index 0) at Bottom, we probably actually need to REVERSE the arrays if the default matches array order Top-to-Bottom.
        // Let's check: '16 anos' is index 0. We want it at the BOTTOM.
        // Chart.js Category Scale: labels[0] is usually at the TOP (Left for horizontal? No, Top y-axis).
        // Wait, indexAxis: 'y' means Y is the category axis.
        // Usually, the first label is at the TOP.
        // We want '16 anos' (Index 0) at the base (BOTTOM).
        // So we should Reverse the arrays so '16 anos' becomes the last element?
        // Let's try reversing everything.

        faixaLabels.reverse();
        maleValues.reverse();
        femaleValues.reverse();

        renderPyramidChart('chart-idade', faixaLabels, maleValues, femaleValues, data.total_eleitores);

        // Grau de Instrução
        // Grau de Instrução
        if (data.grau_instrucao) {
            const instrucaoEntries = Object.entries(data.grau_instrucao).sort((a, b) => b[1] - a[1]); // Ordena por valor decrescente
            renderChart('chart-instrucao', 'bar',
                { labels: instrucaoEntries.map(e => e[0]), values: instrucaoEntries.map(e => e[1]) },
                '#10b981', null, false, data.total_eleitores); // Passe data.total_eleitores
        }

        // Estado Civil
        if (data.estado_civil) {
            renderChart('chart-civil', 'doughnut', data.estado_civil,
                ['#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#8b5cf6'],
                Object.keys(data.estado_civil), false, data.total_eleitores); // Passe data.total_eleitores e force horizontal=false
        }
    }

    function renderChart(canvasId, type, data, colors, labels = null, horizontal = false, totalAbsolute = null) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error(`[Eleitorado] Canvas ${canvasId} não encontrado.`);
            return;
        }

        const ctx = canvas.getContext('2d');

        // Destrói gráfico anterior se existir
        if (chartInstances[canvasId]) {
            chartInstances[canvasId].destroy();
        }

        let chartData, chartOptions;

        // Cor do texto baseada no tema (tenta pegar CSS var ou usa fallback)
        const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#666';

        if (type === 'doughnut') {
            // Prepara dados para Doughnut
            const dataValues = Object.values(data);
            const dataLabels = labels || Object.keys(data);

            chartData = {
                labels: dataLabels,
                datasets: [{
                    data: dataValues,
                    backgroundColor: colors,
                    borderWidth: 0
                }]
            };

            chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 12,
                            font: { size: 10 },
                            color: textColor
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.label || '';
                                if (label) label += ': ';
                                let value = context.parsed;
                                label += value + '%';
                                if (totalAbsolute) {
                                    const abs = Math.round((value / 100) * totalAbsolute);
                                    label += ` (${abs.toLocaleString('pt-BR')} eleitores)`;
                                }
                                return label;
                            }
                        }
                    }
                }
            };
        } else {
            // Bar Chart
            const isObj = !Array.isArray(data.values);
            const dataValues = isObj ? Object.values(data) : data.values;
            const dataLabels = isObj ? Object.keys(data) : data.labels;

            chartData = {
                labels: dataLabels,
                datasets: [{
                    label: '%',
                    data: dataValues,
                    backgroundColor: colors,
                    borderRadius: 4
                }]
            };

            chartOptions = {
                indexAxis: horizontal ? 'y' : 'x',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                if (horizontal) value = context.parsed.x; // Handle horizontal bar

                                // Remove prefix logic and just return value
                                // label += ': ' + value + '%'; 
                                label = value + '%';
                                if (totalAbsolute) {
                                    const abs = Math.round((value / 100) * totalAbsolute);
                                    label += ` (${abs.toLocaleString('pt-BR')} eleitores)`;
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { font: { size: 10 }, color: textColor } },
                    y: { ticks: { font: { size: 10 }, color: textColor, autoSkip: false } }
                }
            };
        }

        try {
            chartInstances[canvasId] = new Chart(ctx, {
                type: type,
                data: chartData,
                options: chartOptions
            });
        } catch (err) {
            console.error(`[Eleitorado] Erro ao criar gráfico ${canvasId}:`, err);
        }
    }

    function renderPyramidChart(canvasId, labels, maleValues, femaleValues, totalAbsolute) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (chartInstances[canvasId]) chartInstances[canvasId].destroy();

        const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#666';

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Masculino',
                        data: maleValues,
                        backgroundColor: '#3b82f6',
                        stack: 'Stack 0'
                    },
                    {
                        label: 'Feminino',
                        data: femaleValues,
                        backgroundColor: '#ec4899',
                        stack: 'Stack 0'
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                let value = context.raw;
                                let absPercent = Math.abs(value);

                                label += absPercent.toFixed(1) + '%';

                                if (totalAbsolute) {
                                    const abs = Math.round((absPercent / 100) * totalAbsolute);
                                    label += ` (${abs.toLocaleString('pt-BR')} eleitores)`;
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: {
                            color: textColor,
                            callback: function (value) { return Math.abs(value) + '%'; }
                        }
                    },
                    y: {
                        stacked: true,
                        ticks: {
                            color: textColor,
                            autoSkip: false,
                            font: { size: 10 }
                        }
                    }
                }
            }
        });
    }

    // Função para formatar nomes próprios corretamente
    function formatName(name) {
        if (!name) return name;

        // Palavras que devem ficar em minúsculo (conectivos)
        const lowercase = ['de', 'da', 'do', 'das', 'dos', 'e', 'em'];

        return name.split(' ').map((word, index) => {
            const lowerWord = word.toLowerCase();
            if (index > 0 && lowercase.includes(lowerWord)) {
                return lowerWord;
            }
            return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
        }).join(' ');
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        if (activeCityId) {
            const prev = document.getElementById(activeCityId);
            if (prev) prev.classList.remove('active');
            activeCityId = null;
        }
    }
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);


    // --- 4. Search & Zoom ---
    function initSearch() {
        Object.keys(citiesData).forEach(id => {
            const option = document.createElement('option');
            option.value = citiesData[id].nome;
            datalist.appendChild(option);
        });

        const perform = () => {
            const val = citySearch.value.toLowerCase();
            const id = Object.keys(citiesData).find(key => citiesData[key].nome.toLowerCase() === val);
            if (id) selectCity(id);
            else alert('Cidade não encontrada.');
        };

        document.getElementById('search-btn').addEventListener('click', perform);
        citySearch.addEventListener('keypress', (e) => { if (e.key === 'Enter') perform(); });
    }

    function setupZoomPan() {
        const updateTransform = () => {
            if (mapGroup) mapGroup.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
        };

        mapContainer.addEventListener('mousedown', e => {
            isDragging = true;
            startX = e.clientX - pointX;
            startY = e.clientY - pointY;
            mapContainer.style.cursor = 'grabbing';
        });
        window.addEventListener('mouseup', () => { isDragging = false; mapContainer.style.cursor = 'grab'; });
        window.addEventListener('mousemove', e => {
            if (!isDragging) return;
            e.preventDefault();
            pointX = e.clientX - startX;
            pointY = e.clientY - startY;
            updateTransform();
        });
        mapContainer.addEventListener('wheel', e => {
            e.preventDefault();

            // Direção do scroll
            const delta = Math.sign(e.deltaY) * -1;
            const factor = 1.1; // Suave
            let newScale = delta > 0 ? scale * factor : scale / factor;

            // Limites de zoom
            newScale = Math.min(Math.max(0.5, newScale), 10);

            // Posição do mouse relativa ao container
            const rect = mapContainer.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Cálcula novo translate para manter o ponto sob o mouse fixo
            pointX = mouseX - (mouseX - pointX) * (newScale / scale);
            pointY = mouseY - (mouseY - pointY) * (newScale / scale);
            scale = newScale;

            updateTransform();
        });

        zoomInBtn.addEventListener('click', () => { scale *= 1.2; updateTransform(); });
        zoomOutBtn.addEventListener('click', () => { scale /= 1.2; updateTransform(); });
        zoomResetBtn.addEventListener('click', () => { scale = 1; pointX = 0; pointY = 0; updateTransform(); });
    }

    // Theme & Tooltip
    themeToggle.addEventListener('click', () => {
        document.body.dataset.theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
        themeToggle.innerText = document.body.dataset.theme === 'dark' ? '🌙' : '☀️';
    });

    function showTooltip(txt, e) {
        tooltip.innerText = txt;
        tooltip.classList.remove('hidden');
        moveTooltip(e);
    }
    function hideTooltip() {
        tooltip.classList.add('hidden');
    }
    function moveTooltip(e) {
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY + 10) + 'px';
    }
    // ==========================================
    // 4. AI Chat Logic
    // ==========================================
    function initChat() {
        const chatToggle = document.getElementById('chat-toggle');
        const chatWindow = document.getElementById('chat-window');
        const chatClose = document.getElementById('chat-close');
        const chatInput = document.getElementById('chat-input');
        const chatSend = document.getElementById('chat-send');
        const chatMessages = document.getElementById('chat-messages');

        if (!chatToggle || !chatWindow) return;

        // Toggle Open/Close
        const toggleChat = () => {
            const isOpen = chatWindow.classList.contains('open');
            if (isOpen) {
                chatWindow.classList.remove('open');
            } else {
                chatWindow.classList.add('open');
                // Focus input
                setTimeout(() => chatInput.focus(), 300);
            }
        };

        chatToggle.addEventListener('click', toggleChat);
        chatClose.addEventListener('click', toggleChat);

        // Send Message
        const sendMessage = async () => {
            const text = chatInput.value.trim();
            if (!text) return;

            // 1. Add User Message
            appendMessage(text, 'user');
            chatInput.value = '';
            chatSend.disabled = true;

            // 2. Prepare Context (Current selected city)
            let cityContext = null;
            let mayorContext = null;
            let siteStats = "Dados consolidados não disponíveis.";

            // Calculate Site Stats
            if (citiesData && Object.keys(citiesData).length > 0) {
                const partyCounts = {};
                let totalCidades = 0;

                Object.values(citiesData).forEach(c => {
                    if (c.partido && c.partido !== 'Não informado') {
                        partyCounts[c.partido] = (partyCounts[c.partido] || 0) + 1;
                        totalCidades++;
                    }
                });

                const topParties = Object.entries(partyCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([p, count]) => `${p} (${count})`);

                siteStats = `Total Cidades: ${totalCidades}. Top Partidos: ${topParties.join(', ')}.`;
            }

            if (activeCityId && citiesData[activeCityId]) {
                const city = citiesData[activeCityId];
                cityContext = `${city.nome} (População: ${city.habitantes}, Partido: ${city.partido})`;
                mayorContext = city.prefeito;
            } else {
                cityContext = "Paraná (Estado Geral)";
            }

            // 3. Show loading bubble
            const loadingId = appendLoading();

            try {
                // Call Backend
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        city_context: cityContext,
                        mayor_context: mayorContext,
                        site_stats: siteStats
                    })
                });

                if (!response.ok) throw new Error("Erro na conexão com API");
                const data = await response.json();

                // 4. Remove loading and show response
                removeMessage(loadingId);

                // Format links if sources exist
                let finalResponse = data.response;
                if (data.sources && data.sources.length > 0) {
                    finalResponse += "\n\n**Fontes:**\n" + data.sources.map(s => `- [${s.title}](${s.url})`).join('\n');
                }

                appendMessage(parseMarkdown(finalResponse), 'bot');

            } catch (err) {
                removeMessage(loadingId);
                appendMessage("Desculpe, tive um problema ao conectar com o servidor. Verifique se o backend Python está rodando.", 'bot');
                console.error(err);
            } finally {
                chatSend.disabled = false;
                chatInput.focus();
            }
        };

        chatSend.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // Helpers UI
    function appendMessage(text, type) {
        const chatMessages = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = `message ${type}`;

        // Se for bot, aceita HTML (do parseMarkdown), se for user, texto puro para segurança básica
        if (type === 'bot') div.innerHTML = text;
        else div.innerText = text;

        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return div;
    }

    function appendLoading() {
        const chatMessages = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'message bot';
        div.id = 'msg-loading-' + Date.now();
        div.innerHTML = '<span style="display:inline-block; animation: pulse 1s infinite">Thinking...</span>';
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return div.id;
    }

    function removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // Simple Markdown Parser for Links and Bold
    function parseMarkdown(text) {
        if (!text) return '';
        // Bold
        let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Links [Label](Url)
        html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
        // Line breaks
        html = html.replace(/\n/g, '<br>');
        // List items (simple)
        html = html.replace(/- (.*?)<br>/g, '<li>$1</li>');
        return html;
    }

    // Initialize Chat
    initChat();


    // --- Funções de Campanha: Insights & Tabelas (Admin) ---

    // Atualiza a aba Insights com métricas calculadas
    function updateInsights(slug) {
        if (!isLoggedIn) return;

        const cData = campaignData[slug] || { votes: 0, money: 0 };
        const city = citiesData[slug];
        let eleitorado = 0;

        // Tenta achar dados eleitorais
        let key = slug.toLowerCase().trim().replace(/-/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (eleitoradoData[key]) {
            eleitorado = eleitoradoData[key].total_eleitores;
        }

        const votes = parseFloat(cData.votes) || 0;
        const money = parseFloat(cData.money) || 0;
        const pop = city ? (city.habitantes || 0) : 0;
        let globalVotes = 0;

        // Calcula Global Votes para participação
        Object.values(campaignData).forEach(d => globalVotes += (d.votes || 0));

        // a. Votos Recebidos
        setStat('ins-votes', Math.round(votes).toLocaleString('pt-BR'));

        // b. Investimento
        setStat('ins-money', money.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

        // c. Votos Convertidos (% do eleitorado da cidade)
        const conversion = eleitorado > 0 ? (votes / eleitorado) * 100 : 0;
        setStat('ins-conversion', conversion.toFixed(2) + '%');

        // d. Investimento por Voto Convertido (R$/voto)
        const costVote = votes > 0 ? (money / votes) : 0;
        setStat('ins-cost-vote', costVote.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

        // e. Investimento por População (R$/pop)
        const costPop = pop > 0 ? (money / pop) : 0;
        setStat('ins-cost-pop', costPop.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

        // f. Participação Global (% votos da cidade / votos totais da campanha)
        const share = globalVotes > 0 ? (votes / globalVotes) * 100 : 0;
        setStat('ins-share', share.toFixed(2) + '%');
    }

    function setStat(id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    }

    // --- Tabela Resumo ---
    function openSummaryModal() {
        const modal = document.getElementById('summary-modal');
        const tbody = document.querySelector('#summary-table tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        let globalVotes = 0;
        Object.values(campaignData).forEach(d => globalVotes += (d.votes || 0));

        const citiesList = Object.keys(citiesData)
            .filter(slug => {
                const name = citiesData[slug].nome || "";
                // Remove linhas de metadados/lixo (Notas, Fontes, etc)
                if (name.includes('Nota') || name.includes('Fonte') || name.length > 50) return false;
                if (name.startsWith('Escolariza') || name.startsWith('Popula') || name.startsWith('Área') || name.startsWith('Densidade')) return false;
                return true;
            })
            .map(slug => {
                const city = citiesData[slug];
                const cData = campaignData[slug] || { votes: 0, money: 0 };

                let key = slug.toLowerCase().trim().replace(/-/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const eleitorado = eleitoradoData[key] ? eleitoradoData[key].total_eleitores : 0;

                const votes = cData.votes || 0;
                const money = cData.money || 0;
                const pop = city.habitantes || 0;

                const conversion = eleitorado > 0 ? (votes / eleitorado) * 100 : 0;
                const costVote = votes > 0 ? (money / votes) : 0;
                const costPop = pop > 0 ? (money / pop) : 0;
                const share = globalVotes > 0 ? (votes / globalVotes) * 100 : 0;

                return {
                    name: city.nome,
                    votes, money, conversion, costVote, costPop, share
                };
            });

        // Ordenar por Votos (Decrescente)
        citiesList.sort((a, b) => b.votes - a.votes);

        // Função de renderização interna
        const renderTable = (items) => {
            tbody.innerHTML = '';
            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1rem; color:var(--text-secondary);">Nenhuma cidade encontrada.</td></tr>';
                return;
            }
            items.forEach(c => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${c.name}</td>
                    <td>${c.votes.toLocaleString('pt-BR')}</td>
                    <td>${c.money.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${c.conversion.toFixed(2)}%</td>
                    <td>${c.costVote.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${c.costPop.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${c.share.toFixed(2)}%</td>
                `;
                tbody.appendChild(tr);
            });
        };

        // Renderização inicial
        renderTable(citiesList);

        // Configurar busca (remove listener antigo clonando input ou apenas sobrescrevendo oninput)
        const searchInput = document.getElementById('summary-search');
        if (searchInput) {
            searchInput.value = ''; // Reset
            searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = citiesList.filter(c => c.name.toLowerCase().includes(term));
                renderTable(filtered);
            };
        }

        modal.classList.remove('hidden');
    }

    async function exportSummaryToExcel() {
        console.log("Iniciando exportação...");
        // 1. Recalcular Dados (Fonte da Verdade Limpa)
        let globalVotes = 0;
        Object.values(campaignData).forEach(d => globalVotes += (d.votes || 0));

        const data = Object.keys(citiesData)
            .filter(slug => {
                const name = citiesData[slug].nome || "";
                if (name.includes('Nota') || name.includes('Fonte') || name.length > 50) return false;
                if (name.startsWith('Escolariza') || name.startsWith('Popula') || name.startsWith('Área') || name.startsWith('Densidade')) return false;
                return true;
            })
            .map(slug => {
                const city = citiesData[slug];
                const cData = campaignData[slug] || { votes: 0, money: 0 };
                let key = slug.toLowerCase().trim().replace(/-/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const eleitorado = eleitoradoData[key] ? eleitoradoData[key].total_eleitores : 0;
                const votes = cData.votes || 0;
                const money = cData.money || 0;
                const pop = parseInt(city.habitantes.toString().replace(/\./g, '')) || 0;

                const conversion = eleitorado > 0 ? (votes / eleitorado) * 100 : 0;
                const costVote = votes > 0 ? (money / votes) : 0;
                const costPop = pop > 0 ? (money / pop) : 0;
                const share = globalVotes > 0 ? (votes / globalVotes) * 100 : 0;

                return {
                    "Cidade": city.nome,
                    "Votos": votes,
                    "Investimento (R$)": money,
                    "Conversão (%)": parseFloat(conversion.toFixed(2)),
                    "R$/Voto": parseFloat(costVote.toFixed(2)),
                    "R$/Pop": parseFloat(costPop.toFixed(2)),
                    "Participação (%)": parseFloat(share.toFixed(2))
                };
            });

        // Ordenar por Votos
        data.sort((a, b) => b["Votos"] - a["Votos"]);

        if (data.length === 0) {
            alert("Não há dados para exportar.");
            return;
        }

        // 2. Mapear para Modelo da API (Backend Python)
        const apiItems = data.map(item => ({
            city: item["Cidade"],
            votes: item["Votos"],
            investment: item["Investimento (R$)"],
            conversion: item["Conversão (%)"],
            cost_per_vote: item["R$/Voto"],
            cost_per_pop: item["R$/Pop"],
            share: item["Participação (%)"]
        }));

        try {
            alert("Solicitando arquivo ao servidor... Aguarde.");

            const res = await fetch('http://localhost:8082/api/export_excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: apiItems })
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || "Falha na geração do arquivo.");
            }

            const data = await res.json();

            if (data.download_url) {
                // Adiciona timestamp para evitar cache do navegador (crucial para o Chrome)
                const downloadLink = `http://localhost:8082${data.download_url}?t=${Date.now()}`;

                console.log("Tentando download via link:", downloadLink);

                // Método 1: Criação de Link (Padrão)
                const a = document.createElement('a');
                a.href = downloadLink;
                a.setAttribute('download', 'Resumo_Campanha_Parana.xlsx');
                a.target = '_blank'; // Força nova aba para garantir que o Chrome não bloqueie
                document.body.appendChild(a);
                a.click();

                // Cleanup
                setTimeout(() => {
                    document.body.removeChild(a);
                }, 500);

            } else {
                throw new Error("URL de download não retornada pelo servidor.");
            }

            console.log("Download via Backend concluído.");

        } catch (error) {
            console.error("Erro na exportação via servidor:", error);
            alert("Erro ao exportar arquivo: " + error.message);
        }
    }

    // --- Importação Excel ---
    function triggerImport() {
        // Abre o modal de instruções primeiro
        document.getElementById('import-modal').classList.remove('hidden');
    }

    async function handleExcelImport(e) {
        console.log("handleExcelImport triggered");
        const file = e.target.files[0];
        if (!file) {
            console.log("No file selected");
            return;
        }
        console.log("File selected:", file.name);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            console.log("FileReader loaded data");
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

                // Converte para Matriz de Dados (Array de Arrays)
                // Isso é mais seguro que JSON com chaves, pois evita problemas com espaços em cabeçalhos
                const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                if (rawData.length < 2) {
                    alert("Arquivo vazio ou sem dados (apenas cabeçalho).");
                    return;
                }

                // 1. Identificar índices das colunas (ignorando case e espaços)
                const headerRow = rawData[0].map(h => h ? h.toString().trim() : "");
                const cleanHeaders = headerRow.filter(h => h !== "");

                // Validação 1 & 2: Colunas Corretas e Únicas
                // Esperado: Cidade, Votos, Investimento

                // Normaliza para verificar presença
                const lowerHeaders = headerRow.map(h => h.toLowerCase());
                const idxCidade = lowerHeaders.indexOf('cidade');
                const idxVotos = lowerHeaders.indexOf('votos');
                const idxInvest = lowerHeaders.findIndex(h => h.includes('investimento'));

                // Verificação de nomes (existência)
                if (idxCidade === -1 || idxVotos === -1 || idxInvest === -1) {
                    alert("A tabela não foi importada, por conta de não atender as especificações.\n\nMotivo: As colunas obrigatórias não foram encontradas.\nEsperado: Cidade, Votos, Investimento.");
                    return;
                }

                // Verificação de Quantidade (Não pode ter colunas extras)
                if (cleanHeaders.length !== 3) {
                    alert(`A tabela não foi importada, por conta de não atender as especificações.\n\nMotivo: A tabela deve conter APENAS as 3 colunas solicitadas.\nEncontradas: ${cleanHeaders.length} colunas.`);
                    return;
                }

                // 2. Processar Linhas e Validar Cidades
                const bulkItems = [];
                const nameToSlug = {};

                // Cache de slugs normalizados
                Object.keys(citiesData).forEach(slug => {
                    const cleanName = citiesData[slug].nome.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    nameToSlug[cleanName] = slug;
                });

                let errors = [];

                for (let i = 1; i < rawData.length; i++) {
                    const row = rawData[i];
                    if (!row || row.length === 0) continue;

                    let cityName = row[idxCidade];
                    const hasData = row.some(cell => cell !== undefined && cell !== null && cell !== "");
                    if (!hasData) continue;

                    if (!cityName) {
                        errors.push(`Linha ${i + 1}: Nome da cidade vazio.`);
                        continue;
                    }

                    // Normalização
                    const clean = cityName.toString().toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const slug = nameToSlug[clean];

                    if (!slug) {
                        // Validação 3: Apenas cidades existentes
                        errors.push(`Linha ${i + 1}: Cidade "${cityName}" não pertence ao cadastro do Paraná.`);
                        continue;
                    }

                    const votes = parseInt(row[idxVotos]) || 0;

                    let rawMoney = row[idxInvest];
                    let money = 0;
                    if (typeof rawMoney === 'string') {
                        rawMoney = rawMoney.replace('R$', '').replace(/\s/g, '').replace(',', '.');

                        money = parseFloat(rawMoney) || 0;
                    } else if (typeof rawMoney === 'number') {
                        money = rawMoney;
                    }

                    bulkItems.push({
                        city_slug: slug,
                        votes: votes,
                        money: money
                    });
                }

                if (errors.length > 0) {
                    alert(`A tabela não foi importada, por conta de não atender as especificações.\n\nErros encontrados:\n${errors.slice(0, 5).join('\n')}\n${errors.length > 5 ? '...e mais ' + (errors.length - 5) + ' erros.' : ''}`);
                    return;
                }

                if (bulkItems.length > 0) {
                    // Envia pro backend
                    const res = await fetch('http://localhost:8082/api/campaign/update_bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items: bulkItems })
                    });

                    if (res.ok) {
                        alert(`Sucesso! ${bulkItems.length} cidades atualizadas.`);
                        // Recarrega dados
                        loadCampaignGlobalStats();
                        // Se tiver cidade aberta, atualiza sidebar
                        if (activeCityId) {
                            populateSidebar(activeCityId);
                        }
                        updateMapDisplay();

                        // Fecha modal de importação se estiver aberto (já deve estar fechado pelo ENTENDI, mas garante)
                        document.getElementById('import-modal').classList.add('hidden');

                    } else {
                        const errText = await res.text();
                        console.error("Erro Servidor:", errText);
                        alert(`Erro ao salvar dados no servidor (Status ${res.status}):\n${errText}`);
                    }
                } else {
                    alert("Nenhum dado válido encontrado para importação.");
                }

            } catch (err) {
                console.error("Erro crítico no processamento:", err);
                alert(`Ocorreu um erro ao processar o arquivo Excel:\n\n${err.message || err.toString()}`);
            }
        };
        reader.readAsArrayBuffer(file);
        // Limpa input

    }

    // Inicializa novos listeners
    function initAdminListeners() {
        // Botão Tabela
        const btnSummary = document.getElementById('btn-summary');
        if (btnSummary) btnSummary.addEventListener('click', openSummaryModal);

        // Modal Close (Summary)
        const closeSum = document.getElementById('close-summary');
        if (closeSum) closeSum.addEventListener('click', () => {
            document.getElementById('summary-modal').classList.add('hidden');
        });

        // Export
        const btnExp = document.getElementById('btn-export-excel');
        if (btnExp) btnExp.addEventListener('click', exportSummaryToExcel);

        // Import Button (Barra) -> Abre Modal Instruções
        const btnImp = document.getElementById('btn-import');
        if (btnImp) btnImp.addEventListener('click', triggerImport);

        // --- Import Modal Listeners ---
        // X fecha modal e cancela
        const closeImp = document.getElementById('close-import');
        if (closeImp) closeImp.addEventListener('click', () => {
            document.getElementById('import-modal').classList.add('hidden');
        });

        // ENTENDI / SELECIONAR -> Clica no input file
        const btnConfirmImp = document.getElementById('btn-confirm-import');
        if (btnConfirmImp) btnConfirmImp.addEventListener('click', (e) => {
            e.preventDefault(); // Evita comportamentos padrão
            const fileInput = document.getElementById('file-import');
            if (fileInput) {
                // Reseta o valor para permitir selecionar o mesmo arquivo novamente (caso tenha dado erro antes)
                fileInput.value = "";
                // Força o clique no input
                fileInput.click();
            } else {
                alert("Erro: Campo de arquivo não encontrado.");
            }
            // Fecha modal apenas depois (opcional, manter ou não, mas o timeout pode ajudar)
            document.getElementById('import-modal').classList.add('hidden');
        });

        // Ocorre quando arquivo é selecionado
        const fileImp = document.getElementById('file-import');
        if (fileImp) fileImp.addEventListener('change', handleExcelImport);
    }

    // Auto-init listeners immediately (DOM is ready)
    initAdminListeners();

}); // End DOMContentLoaded Scope
